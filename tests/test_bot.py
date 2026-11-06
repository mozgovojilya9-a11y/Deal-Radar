"""Offline scanner tests: no network, no Telegram. Run: python -m unittest discover -s tests"""
import os
import sys
import tempfile
import urllib.request
import unittest
from datetime import datetime, timezone
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
TMP = tempfile.mkdtemp()
os.environ["DEAL_DB"] = os.path.join(TMP, "state.db")
os.environ["DEAL_FEED"] = os.path.join(TMP, "data", "deals.json")

import bot  # noqa: E402

CFG = {
    "postcode": "7671", "distance_km": 50, "pages": 1, "seed_pages": 1, "min_samples": 3,
    "market_days": 21, "max_age_hours": 168,
    "queries": [{"key": "ps5", "label": "PlayStation 5", "query": "playstation 5",
                 "include_any": ["ps5"], "min_price": 100, "max_price": 800, "threshold": 0.2}],
}


def listing(item_id, price, date=None, title="PS5 console"):
    return {
        "itemId": item_id, "title": title, "description": "in goede staat",
        "priceInfo": {"priceCents": int(price * 100), "priceType": "FIXED"},
        "location": {"cityName": "Almelo", "distanceMeters": 12000},
        "vipUrl": f"/v/{item_id}", "date": date,
        "pictures": [{"largeUrl": f"//images.example/{item_id}.jpg"}],
    }


class ScannerTests(unittest.TestCase):
    def setUp(self):
        for path in (os.environ["DEAL_DB"], os.environ["DEAL_FEED"]):
            if os.path.exists(path):
                os.remove(path)
        self.sleep = mock.patch.object(bot.time, "sleep", lambda *_: None)
        self.sleep.start()
        self.net = mock.patch.object(urllib.request, "urlopen", side_effect=AssertionError("network call"))
        self.net.start()

    def tearDown(self):
        self.sleep.stop()
        self.net.stop()

    def run_scan(self, listings, dry=False):
        db = bot.open_db()
        try:
            with mock.patch.object(bot, "fetch_query", return_value=listings):
                return bot.run_once(CFG, db, dry)
        finally:
            db.close()

    def test_catalog_receives_deal_without_telegram(self):
        seed = [listing(str(i), 400) for i in range(1, 7)]
        self.assertTrue(self.run_scan(seed))
        self.assertEqual(bot.load_feed()["deals"], [])
        now = datetime.now(timezone.utc).isoformat()
        deal = listing("99", 250, date=now, title="PS5 met 2 controllers")
        self.assertTrue(self.run_scan(seed + [deal]))
        feed = bot.load_feed()
        self.assertEqual([d["listing_id"] for d in feed["deals"]], ["99"])
        self.assertEqual(feed["deals"][0]["price"], 250.0)
        self.assertEqual(feed["deals"][0]["market_price"], 400.0)
        self.assertAlmostEqual(feed["deals"][0]["discount"], 0.375, places=3)
        self.assertEqual(feed["deals"][0]["listing_url"], "https://www.marktplaats.nl/v/99")
        self.assertTrue(feed["scannedAt"])

    def test_known_listing_is_re_evaluated_when_history_grows(self):
        now = datetime.now(timezone.utc).isoformat()
        first = [listing("a", 400, now), listing("b", 400, now), listing("99", 250, now)]
        self.run_scan(first)
        self.assertEqual(bot.load_feed()["deals"], [])
        self.run_scan(first + [listing("c", 400, now)])
        self.assertEqual([d["listing_id"] for d in bot.load_feed()["deals"]], ["99"])

    def test_listing_older_than_36_hours_but_under_7_days_is_eligible(self):
        posted = (datetime.now(timezone.utc) - __import__("datetime").timedelta(days=6)).isoformat()
        seed = [listing(f"old-{i}", 400, date=posted) for i in range(1, 7)]
        deal = listing("old-deal", 250, date=posted, title="PS5 met 2 controllers")
        self.assertTrue(self.run_scan(seed + [deal]))
        feed = bot.load_feed()
        self.assertEqual([item["listing_id"] for item in feed["deals"]], ["old-deal"])
        self.assertEqual(feed["deals"][0]["posted_at"], posted)

    def test_model_filters_reject_old_generations(self):
        rayban = {
            "include_any": ["ray-ban", "rayban", "ray ban"],
            "require_regex": r"(?=.*\bray[\s-]?ban\b)(?=.*\bmeta\b)(?=.*\bwayfarer\b)(?=.*\bgen(?:eration)?[\s.-]*(?:[2-9]\d*|1\d+)\b)",
            "exclude": ["case", "hoesje"],
        }
        self.assertTrue(bot.title_matches_query(rayban, "Ray-Ban Meta Wayfarer Gen 2"))
        self.assertFalse(bot.title_matches_query(rayban, "Ray-Ban Meta Wayfarer Gen 1"))
        self.assertFalse(bot.title_matches_query(rayban, "Ray-Ban Meta Skyler Gen 3"))

        airpods = {
            "include_any": ["airpods pro"],
            "require_regex": r"(?=.*\bairpods[\s-]*pro\b)(?=.*(?:\bpro[\s-]*3\b|\b3(?:rd)?[\s.-]*(?:gen(?:eration)?|e[\s-]*generatie)\b|\bgen(?:eration)?[\s.-]*3\b))",
            "exclude": ["case", "hoesje"],
        }
        self.assertTrue(bot.title_matches_query(airpods, "AirPods Pro 3"))
        self.assertFalse(bot.title_matches_query(airpods, "AirPods Pro 2"))

    def test_all_queries_failing_does_not_touch_feed(self):
        db = bot.open_db()
        try:
            with mock.patch.object(bot, "fetch_query", side_effect=OSError("blocked")):
                self.assertFalse(bot.run_once(CFG, db))
        finally:
            db.close()
        self.assertFalse(os.path.exists(os.environ["DEAL_FEED"]))

    def test_dry_run_writes_nothing(self):
        self.run_scan([listing("1", 400)], dry=True)
        self.assertFalse(os.path.exists(os.environ["DEAL_FEED"]))

    def test_no_telegram_sender_exists(self):
        for name in ("tg", "send", "format_deal", "get_chat_id"):
            self.assertFalse(hasattr(bot, name), name)


if __name__ == "__main__":
    unittest.main()
