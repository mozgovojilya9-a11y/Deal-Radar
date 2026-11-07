"""Offline tests for the listing lifecycle, evidence storage and data-safety guarantees."""
import io
import json
import os
import sqlite3
import sys
import tempfile
import unittest
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import bot  # noqa: E402

CFG = {
    "postcode": "7671", "distance_km": 50, "pages": 1, "seed_pages": 1, "min_samples": 3,
    "candidate_min_samples": 3, "market_days": 21, "max_age_hours": 720,
    "queries": [{"key": "ps5", "label": "PlayStation 5", "query": "playstation 5",
                 "include_any": ["ps5"], "min_price": 100, "threshold": 0.2}],
}


def listing(item_id, price, title="PS5 console", price_type="FIXED", lat=52.37, lon=4.90, condition="Gebruikt"):
    return {
        "itemId": item_id, "title": title, "description": "in goede staat",
        "priceInfo": {"priceCents": int(price * 100), "priceType": price_type},
        "location": {"cityName": "Amsterdam", "distanceMeters": -1, "latitude": lat, "longitude": lon},
        "attributes": [{"key": "condition", "value": condition}],
        "vipUrl": f"/v/games/{item_id}", "date": datetime.now(timezone.utc).isoformat(),
    }


class LifecycleTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.paths = mock.patch.multiple(bot, DB_PATH=os.path.join(self.tmp, "state.db"),
                                         FEED_PATH=os.path.join(self.tmp, "data", "deals.json"))
        self.paths.start()
        self.sleep = mock.patch.object(bot.time, "sleep", lambda *_: None)
        self.sleep.start()
        self.net = mock.patch.object(urllib.request, "urlopen", side_effect=AssertionError("network call"))
        self.net.start()

    def tearDown(self):
        self.net.stop()
        self.sleep.stop()
        self.paths.stop()

    def scan(self, rows, cfg=CFG, at=None):
        db = bot.open_db()
        try:
            patches = [mock.patch.object(bot, "fetch_query", return_value=rows),
                       mock.patch.object(bot, "get_web_market_reference", return_value={"sources": [], "rationale": ""})]
            if at is not None:
                patches.append(mock.patch.object(bot.time, "time", return_value=at))
            for patch in patches:
                patch.start()
            try:
                return bot.run_once(cfg, db)
            finally:
                for patch in reversed(patches):
                    patch.stop()
        finally:
            db.close()

    def feed(self):
        return {deal["listing_id"]: deal for deal in bot.load_feed()["deals"]}

    def test_old_schema_database_is_migrated_without_losing_rows(self):
        db = sqlite3.connect(bot.DB_PATH)
        db.execute("CREATE TABLE listings(id TEXT PRIMARY KEY, qkey TEXT, grp TEXT, title TEXT, price REAL, first_seen INTEGER, last_seen INTEGER)")
        db.execute("INSERT INTO listings VALUES('old','ps5','all','PS5',400,1,2)")
        db.commit()
        db.close()
        migrated = bot.open_db()
        try:
            columns = {row[1] for row in migrated.execute("PRAGMA table_info(listings)")}
            self.assertTrue({"url", "item_condition", "price_type", "lat", "lon"}.issubset(columns))
            self.assertEqual(migrated.execute("SELECT id, price, url FROM listings").fetchall(), [("old", 400.0, None)])
        finally:
            migrated.close()

    def test_marktplaats_estimate_keeps_real_comparable_urls(self):
        seed = [listing(f"s{i}", 400 + i) for i in range(6)]
        self.scan(seed)
        self.scan(seed + [listing("deal", 250, title="PS5 met 2 controllers")])
        deal = self.feed()["deal"]
        self.assertEqual(deal["price_reference_type"], "marktplaats")
        self.assertGreaterEqual(len(deal["market_sources"]), 3)
        self.assertTrue(all(source["url"].startswith("https://www.marktplaats.nl/v/") for source in deal["market_sources"]))
        self.assertNotIn("https://www.marktplaats.nl/v/games/deal", [source["url"] for source in deal["market_sources"]])
        self.assertEqual(deal["latitude"], 52.37)
        self.assertEqual(deal["item_condition"], "Gebruikt")
        self.assertTrue(deal["evaluation_reason"])

    def test_min_bid_listing_is_evaluated_but_never_a_comparable_or_strong(self):
        seed = [listing(f"s{i}", 400) for i in range(6)]
        bids = [listing(f"bid{i}", 50, price_type="MIN_BID") for i in range(3)]
        self.scan(seed + bids)
        self.scan(seed + bids + [listing("bid-deal", 200, price_type="MIN_BID")])
        feed = self.feed()
        self.assertIn(feed["bid-deal"]["status"], ("good", "candidate"))
        self.assertEqual(feed["bid-deal"]["price_type"], "MIN_BID")
        self.assertTrue(any("bieden" in flag for flag in feed["bid-deal"]["warning_flags"]))
        # Minimum bids of €50 must not drag the market median down.
        self.assertEqual(feed["bid-deal"]["market_median_price"], 400.0)

    def test_min_bid_without_confirmed_profit_is_not_kept_as_candidate(self):
        self.scan([listing("lonely-bid", 300, price_type="MIN_BID")])
        self.assertNotIn("lonely-bid", self.feed())
        self.assertEqual(bot.load_feed()["scannerStats"]["rejectedPriceType"], 1)

    def test_multi_item_lots_and_auctions_are_not_single_item_deals(self):
        seed = [listing(f"s{i}", 400) for i in range(6)]
        self.scan(seed + [listing("lot", 300, title="2x PS5 console"), listing("auction", 200, title="Veiling - PS5 console")])
        feed = self.feed()
        self.assertNotIn("lot", feed)
        self.assertEqual(feed["auction"]["price_type"], "MIN_BID")
        self.assertNotEqual(feed["auction"]["status"], "strong")

    def test_rate_limited_category_is_retried_not_lost(self):
        seed = [listing(f"s{i}", 400) for i in range(6)]
        db = bot.open_db()
        try:
            with mock.patch.object(bot, "fetch_query", side_effect=[OSError("HTTP Error 429: Too Many Requests"), seed]), \
                 mock.patch.object(bot, "get_web_market_reference", return_value={"sources": []}):
                bot.run_once(CFG, db)
        finally:
            db.close()
        stats = bot.load_feed()["scannerStats"]
        self.assertEqual(stats["failedQueries"], 0)
        self.assertEqual(stats["unique"], 6)

    def test_category_order_rotates_between_runs(self):
        cfg = dict(CFG, queries=[dict(CFG["queries"][0], key=k) for k in ("ps5", "ps4", "ps3")])
        seen_orders = []
        for _ in range(2):
            calls = []
            db = bot.open_db()
            try:
                with mock.patch.object(bot, "fetch_query", side_effect=lambda _cfg, q, _pages: calls.append(q["key"]) or []), \
                     mock.patch.object(bot, "get_web_market_reference", return_value={"sources": []}):
                    bot.run_once(cfg, db)
            finally:
                db.close()
            seen_orders.append(calls)
        self.assertEqual(sorted(seen_orders[0]), sorted(seen_orders[1]))
        self.assertNotEqual(seen_orders[0][0], seen_orders[1][0])

    def test_accessories_are_rejected_and_counted(self):
        rows = [listing("acc1", 120, title="Controller voor PS5"), listing("acc2", 110, title="PS5 games: FIFA en GTA")]
        self.scan(rows)
        stats = bot.load_feed()["scannerStats"]
        self.assertEqual(stats["rejectedAccessory"], 2)
        self.assertEqual(self.feed(), {})

    def test_candidate_is_promoted_when_market_data_arrives_and_detection_date_is_kept(self):
        start = 1_800_000_000
        self.scan([listing("c", 250)], at=start)
        first = self.feed()["c"]
        self.assertEqual(first["status"], "candidate")
        self.assertTrue(first["next_check_at"])
        # Market data appears later; the candidate is due again and gets promoted.
        seed = [listing(f"s{i}", 400) for i in range(6)]
        self.scan(seed + [listing("c", 250)], at=start + 2 * 3600)
        second = self.feed()["c"]
        self.assertEqual(second["status"], "strong")
        self.assertEqual(second["first_detected_at"], first["detected_at"])
        self.assertEqual(second["detected_at"], first["detected_at"])
        self.assertEqual(bot.load_feed()["scannerStats"]["promoted"], 1)
        self.assertGreaterEqual(second["checks"], 2)

    def test_not_due_listing_waits_in_queue_and_is_not_reprocessed(self):
        start = 1_800_000_000
        self.scan([listing("w", 250)], at=start)
        self.scan([], at=start + 600)  # 10 minutes later: next check is 1 hour after the first one
        stats = bot.load_feed()["scannerStats"]
        self.assertEqual(stats["awaitingRecheck"], 1)
        self.assertEqual(stats["cachedCandidatesReevaluated"], 0)
        self.assertIn("w", self.feed())

    def test_removed_listing_is_dropped_after_liveness_check(self):
        start = 1_800_000_000
        seed = [listing(f"s{i}", 400) for i in range(6)]
        self.scan(seed + [listing("gone", 250)], at=start)
        self.assertIn("gone", self.feed())
        self.net.stop()
        gone = urllib.error.HTTPError("https://www.marktplaats.nl/v/games/gone", 410, "Gone", {}, io.BytesIO(b""))

        def fake_urlopen(request, timeout=None):
            url = request.full_url if hasattr(request, "full_url") else str(request)
            if "/v/games/gone" in url:
                raise gone
            if "/v/games/" in url:
                response = mock.MagicMock()
                response.__enter__.return_value = response
                response.geturl.return_value = url
                response.read.return_value = b"ok"
                return response
            raise AssertionError("unexpected network call " + url)

        with mock.patch.object(urllib.request, "urlopen", side_effect=fake_urlopen):
            self.scan(seed, at=start + 40 * 3600)
        self.net.start()
        self.assertNotIn("gone", self.feed())
        self.assertEqual(bot.load_feed()["scannerStats"]["verifiedInactive"], 1)

    def test_wide_price_spread_blocks_verified_deal(self):
        seed = [listing("a", 150), listing("b", 400), listing("c", 900), listing("d", 1500)]
        self.scan(seed)
        self.scan(seed + [listing("x", 100)])
        deal = self.feed()["x"]
        self.assertEqual(deal["status"], "candidate")
        self.assertIn("разброс", deal["evaluation_reason"])

    def test_feed_with_existing_deals_is_never_emptied_by_a_failed_scan(self):
        seed = [listing(f"s{i}", 400) for i in range(6)]
        self.scan(seed + [listing("keep", 250)])
        before = set(self.feed())
        db = bot.open_db()
        try:
            with mock.patch.object(bot, "fetch_query", side_effect=OSError("blocked")), \
                 mock.patch.object(bot, "get_web_market_reference", return_value={"sources": []}):
                bot.run_once(CFG, db)
        finally:
            db.close()
        self.assertTrue(before.issubset(set(self.feed())))


if __name__ == "__main__":
    unittest.main()
