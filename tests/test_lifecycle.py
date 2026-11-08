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
from external_fake import FakeExternalMarket  # noqa: E402

CFG = {
    "postcode": "7671", "distance_km": 50, "pages": 1, "seed_pages": 1, "min_samples": 3,
    "candidate_min_samples": 3, "market_days": 21, "max_age_hours": 720,
    "queries": [{"key": "ps5", "label": "PlayStation 5", "query": "playstation 5",
                 "include_any": ["ps5"], "min_price": 100, "threshold": 0.2}],
}


def listing(item_id, price, title="PS5 console", price_type="FIXED", lat=52.37, lon=4.90, condition="Gebruikt", reserved=False, description="in goede staat"):
    return {
        "reserved": reserved,
        "itemId": item_id, "title": title, "description": description,
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
        # Independent market research is offline in tests: a controllable fake of market-cli.ts.
        self.external = FakeExternalMarket()
        self.external_patch = mock.patch.object(bot, "run_external_research", self.external)
        self.external_patch.start()
        # Matching of offers to one listing has its own tests (real Node run); here titles are placeholders.
        self.revalue_patch = mock.patch.object(bot, "revalue_for_listings", lambda *_: {})
        self.revalue_patch.start()

    def tearDown(self):
        self.revalue_patch.stop()
        self.external_patch.stop()
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

    def test_independent_valuation_is_stored_with_history_and_real_links(self):
        self.external.set(used=[300, 310, 320, 330, 340, 350], new=[499, 529])
        seed = [listing(f"s{i}", 600 + i) for i in range(6)]
        self.scan(seed + [listing("deal", 150, title="PS5 console")])
        deal = self.feed()["deal"]
        self.assertEqual(deal["price_reference_type"], "external_used")
        self.assertEqual(deal["market_value"], 325.0)
        self.assertEqual(deal["new_price"], 514.0)
        self.assertEqual(deal["used_price"], 325.0)
        self.assertEqual(deal["external_sources"], 8)
        self.assertEqual(deal["marktplaats_samples"], 6)
        self.assertTrue(all(not source["url"].startswith("https://www.marktplaats.nl") for source in deal["market_sources"]))
        self.assertEqual(deal["latitude"], 52.37)
        self.assertEqual(deal["item_condition"], "Gebruikt")
        self.assertTrue(deal["evaluation_reason"])
        db = bot.open_db()
        try:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM external_valuations").fetchone()[0], 1)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM external_offers").fetchone()[0], 8)
            # Marktplaats observations are kept as history, not deleted.
            self.assertEqual(db.execute("SELECT COUNT(*) FROM listings").fetchone()[0], 7)
        finally:
            db.close()

    def test_min_bid_listing_is_evaluated_but_never_strong(self):
        self.external.set(used=[400] * 6)
        bids = [listing(f"bid{i}", 50, price_type="MIN_BID") for i in range(3)]
        self.scan(bids + [listing("bid-deal", 200, price_type="MIN_BID")])
        feed = self.feed()
        self.assertEqual(feed["bid-deal"]["status"], "candidate")
        self.assertIsNone(feed["bid-deal"]["estimated_profit"])
        self.assertEqual(feed["bid-deal"]["price_type"], "MIN_BID")
        self.assertTrue(any("bieden" in flag for flag in feed["bid-deal"]["warning_flags"]))
        self.assertEqual(feed["bid-deal"]["market_value"], 400.0)

    def test_thin_evidence_from_one_website_is_held_back(self):
        self.external.used_domains = ("kleinanzeigen.de",)
        self.external.set(used=[400] * 3)
        self.scan([listing("thin", 200)])
        deal = self.feed()["thin"]
        self.assertEqual(deal["status"], "candidate")
        self.assertTrue(deal["needs_confirmation"])

    def test_solid_sample_from_one_website_can_still_be_good(self):
        self.external.used_domains = ("kleinanzeigen.de",)
        self.external.set(used=[400] * 6)
        self.scan([listing("solid", 200)])
        deal = self.feed()["solid"]
        self.assertEqual(deal["status"], "good")
        self.assertFalse(deal["needs_confirmation"])

    def test_good_deal_tells_how_far_to_negotiate(self):
        self.external.set(used=[400] * 6)
        self.scan([listing("offer", 250)])
        deal = self.feed()["offer"]
        self.assertGreaterEqual(deal["max_offer_price"], 250)
        self.assertEqual(deal["max_offer_price"] % 5, 0)
        self.assertLessEqual(deal["opening_offer_price"], 225)

    def small_profit_status(self, **limits):
        self.external.set(used=[400] * 6)
        self.scan([listing("small", 285)], cfg=dict(CFG, queries=[dict(CFG["queries"][0], min_roi=0.05, good_threshold=0.1, min_profit_eur=25, **limits)]))
        deal = self.feed().get("small")
        return deal["status"] if deal else None, (deal or {}).get("estimated_profit")

    def test_default_profit_floor_keeps_small_profit_out_of_good(self):
        self.assertNotIn(self.small_profit_status()[0], ("good", "strong"))

    def test_category_profit_floor_allows_small_profit(self):
        status, profit = self.small_profit_status(min_deal_profit=25)
        self.assertEqual(status, "good")
        self.assertLess(profit, 50)

    def rescan_with_rules(self, rules):
        self.external.set(used=[400] * 6)
        self.scan([listing("old-good", 200)])
        self.assertIn(self.feed()["old-good"]["status"], ("strong", "good"))
        with open(bot.FEED_PATH, encoding="utf8") as handle:
            doc = json.load(handle)
        for deal in doc["deals"]:
            if rules is None:
                deal.pop("valuation_rules", None)
            else:
                deal["valuation_rules"] = rules
        with open(bot.FEED_PATH, "w", encoding="utf8") as handle:
            json.dump(doc, handle)
        self.scan([])
        return bot.load_feed()["scannerStats"]["cachedCandidatesReevaluated"]

    def test_good_deal_from_older_rules_is_rechecked_before_its_schedule(self):
        self.assertEqual(self.rescan_with_rules(None), 1)

    def test_good_deal_under_current_rules_waits_for_its_schedule(self):
        self.assertEqual(self.rescan_with_rules(bot.VALUATION_RULES), 0)

    def test_min_bid_without_confirmed_profit_is_not_kept_as_candidate(self):
        self.scan([listing("lonely-bid", 300, price_type="MIN_BID")])
        self.assertNotIn("lonely-bid", self.feed())
        self.assertEqual(bot.load_feed()["scannerStats"]["rejectedPriceType"], 1)

    def test_multi_item_lots_and_auctions_are_not_single_item_deals(self):
        self.external.set(used=[400] * 6)
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
        # Independent market data appears later; the candidate is due again and gets promoted.
        self.external.set(used=[400] * 6)
        self.scan([listing("c", 250)], at=start + 2 * 3600)
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
        self.external.set(used=[150, 400, 900, 1500, 160, 1400])
        self.scan([listing("x", 100)])
        deal = self.feed()["x"]
        self.assertEqual(deal["status"], "candidate")
        self.assertIn("разброс", deal["evaluation_reason"])

    # ---- Reserved listings (Marktplaats "Gereserveerd") ----
    def test_reserved_listing_from_api_is_excluded_but_history_is_kept(self):
        self.external.set(used=[400] * 6)
        self.scan([listing("r1", 150, reserved=True), listing("free", 150)])
        feed = self.feed()
        self.assertNotIn("r1", feed)
        self.assertIn("free", feed)
        stats = bot.load_feed()["scannerStats"]
        self.assertEqual(stats["rejectedReserved"], 1)
        db = bot.open_db()
        try:
            self.assertEqual(db.execute("SELECT status, reserved FROM evaluations WHERE id='r1'").fetchone(), ("reserved", 1))
            self.assertEqual(db.execute("SELECT status FROM status_history WHERE id='r1'").fetchone()[0], "reserved")
        finally:
            db.close()

    def test_published_deal_that_becomes_reserved_leaves_the_catalog(self):
        self.external.set(used=[400] * 6)
        self.scan([listing("later", 200)])
        self.assertEqual(self.feed()["later"]["status"], "strong")
        self.scan([listing("later", 200, reserved=True)])
        self.assertNotIn("later", self.feed())
        self.assertEqual(bot.load_feed()["scannerStats"]["reservedRemoved"], 1)
        db = bot.open_db()
        try:
            history = [row[0] for row in db.execute("SELECT status FROM status_history WHERE id='later' ORDER BY rowid")]
            self.assertEqual(history, ["strong", "reserved"])
            self.assertEqual(db.execute("SELECT COUNT(*) FROM external_valuations").fetchone()[0], 1)
        finally:
            db.close()

    def test_reserved_word_in_description_is_not_a_reservation(self):
        self.external.set(used=[400] * 6)
        self.scan([listing("text", 150, description="Niet gereserveerd, reserved for nobody, direct ophalen")])
        self.assertIn("text", self.feed())

    def test_listing_page_status_uses_structured_markers(self):
        self.assertEqual(bot.listing_page_status('<script>{"isReserved":true}</script>'), "reserved")
        self.assertEqual(bot.listing_page_status('<div class="ListingHeader-module-price">Gereserveerd</div>'), "reserved")
        self.assertEqual(bot.listing_page_status('{"ap":"Gereserveerd","g_adid":"1"}'), "reserved")
        self.assertEqual(bot.listing_page_status('{"isReserved":false}<p>Gereserveerd voor Jan? Nee, nog beschikbaar</p>'), "live")

    def test_carried_deal_reserved_on_its_page_is_removed_on_recheck(self):
        start = 1_800_000_000
        self.external.set(used=[400] * 6)
        self.scan([listing("held", 200)], at=start)
        self.assertIn("held", self.feed())
        self.net.stop()

        def fake_urlopen(request, timeout=None):
            response = mock.MagicMock()
            response.__enter__.return_value = response
            response.geturl.return_value = request.full_url
            response.read.return_value = b'<div class="ListingHeader-module-price">Gereserveerd</div>{"isReserved":true}'
            return response

        with mock.patch.object(urllib.request, "urlopen", side_effect=fake_urlopen):
            self.scan([], at=start + 3600)
        self.net.start()
        self.assertNotIn("held", self.feed())
        db = bot.open_db()
        try:
            self.assertEqual(db.execute("SELECT reserved FROM evaluations WHERE id='held'").fetchone()[0], 1)
        finally:
            db.close()

    # ---- Independent valuation ----
    def test_marketplace_offers_returned_by_research_are_never_stored_as_evidence(self):
        from external_fake import external_result
        result = external_result("ps5|all", used=[300, 310, 320], used_domains=("kleinanzeigen.de",))
        result["offers"].append({"title": "x", "price": 999, "url": "https://www.marktplaats.nl/v/x", "domain": "marktplaats.nl", "segment": "used"})
        db = bot.open_db()
        try:
            bot.store_external(db, result, 1)
            offers = json.loads(db.execute("SELECT offers_json FROM external_valuations").fetchone()[0])
            self.assertFalse(any("marktplaats" in offer["url"] for offer in offers))
        finally:
            db.close()

    def test_stale_valuation_is_not_used_as_current_and_history_grows(self):
        start = 1_800_000_000
        self.external.set(used=[400] * 6)
        self.scan([listing("s", 200)], at=start)
        self.assertEqual(self.feed()["s"]["status"], "strong")
        # Two days later the research fails: the old value must not be presented as current.
        self.external.market = None
        self.scan([listing("s", 200)], at=start + 48 * 3600)
        deal = self.feed()["s"]
        self.assertEqual(deal["status"], "candidate")
        self.assertTrue(deal["market_stale"])
        self.assertIn("устарела", deal["evaluation_reason"])
        self.external.set(used=[410] * 6)
        self.scan([listing("s", 200)], at=start + 49 * 3600)
        db = bot.open_db()
        try:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM external_valuations").fetchone()[0], 2)
        finally:
            db.close()
        self.assertEqual(self.feed()["s"]["market_value"], 410.0)


    def test_legacy_marktplaats_based_deal_is_revalued_immediately(self):
        start = 1_800_000_000
        self.external.set(used=[400] * 6)
        self.scan([listing("old", 150)], at=start)
        feed = bot.load_feed()
        feed["deals"][0].update({"price_reference_type": "marktplaats", "status": "strong"})
        bot.save_feed(feed)
        self.external.market = None  # no independent data in this run
        self.scan([], at=start + 600)  # next check is hours away, but legacy status must not survive
        deal = self.feed()["old"]
        self.assertEqual(deal["price_reference_type"], "external_used")
        self.assertEqual(deal["market_value"], 400.0)

    # ---- Analytics: funnel, run history, prioritised external research ----
    def test_funnel_is_consistent_and_run_history_accumulates(self):
        self.external.set(used=[400] * 6)
        rows = [listing("ok", 150), listing("dup", 160), listing("dup", 160), listing("res", 150, reserved=True),
                listing("acc", 120, title="Controller voor PS5")]
        self.scan(rows, at=1_800_000_000)
        feed = bot.load_feed()
        stages = {stage["stage"]: stage for stage in feed["funnel"]}
        self.assertEqual(stages["Получено объявлений"]["passed"], 5)
        self.assertEqual(stages["Удалены дубликаты"]["rejected"], 1)
        self.assertEqual(stages["Проверен статус"]["rejected"], 1)
        self.assertEqual(stages["Проверена модель"]["reasons"].get("аксессуар"), 1)
        passed = [stage["passed"] for stage in feed["funnel"][:6]]
        self.assertEqual(passed, sorted(passed, reverse=True))  # a funnel never grows
        self.assertEqual(len(feed["runHistory"]), 1)
        self.scan(rows, at=1_800_000_000 + 900)
        history = bot.load_feed()["runHistory"]
        self.assertEqual(len(history), 2)
        self.assertGreater(history[-1]["catalogSize"], 0)
        self.assertGreaterEqual(bot.load_feed()["scannerStats"]["listingsPerMinute"], 0)

    def test_external_research_prioritises_promising_models(self):
        cfg = dict(CFG, external_market={"per_run": 1})
        cfg["queries"] = [dict(CFG["queries"][0], key="ps5", group_regex=r"\b(slim|pro)\b", strict_group=True)]
        context = [listing(f"c{i}", 500, title="PS5 Slim console") for i in range(4)] + \
                  [listing(f"p{i}", 700, title="PS5 Pro console") for i in range(4)]
        self.scan(context, cfg=cfg)  # builds Marktplaats context: slim ~500, pro ~700
        self.external.calls.clear()
        self.scan(context + [listing("cheap-slim", 300, title="PS5 Slim console")], cfg=cfg)
        # Only one external check fits this run: it goes to the group with a listing far below context.
        self.assertEqual(self.external.calls[-1], ["ps5|slim"])

    def test_price_far_below_market_is_watchlist_not_a_deal(self):
        self.external.set(used=[400] * 6)
        self.scan([listing("too-cheap", 120), listing("fair", 220)])
        feed = self.feed()
        self.assertEqual(feed["too-cheap"]["status"], "candidate")
        self.assertIn("подделка", feed["too-cheap"]["evaluation_reason"])
        self.assertIn(feed["fair"]["status"], ("strong", "good"))

    def test_model_group_comes_from_title_not_description(self):
        q = {"key": "switch", "group_regex": r"\b(?:switch\s*2|oled|lite)\b", "strict_group": True, "group_type": "model_required"}
        self.assertEqual(bot.model_group_for(q, "Nintendo Switch (2019) met accessoires", "Nintendo Switch (2019) geen switch 2"), "unknown")
        self.assertEqual(bot.model_group_for(q, "Nintendo Switch 2 nieuw", "Nintendo Switch 2 nieuw"), "switch2")

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
