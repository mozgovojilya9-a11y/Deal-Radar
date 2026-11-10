"""Radar quality: empty valuations are retried soon, deals carry a score, price drops are tracked. No network."""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))
import bot  # noqa: E402
from test_lifecycle import CFG, LifecycleTests, listing  # noqa: E402

class RadarCase(unittest.TestCase):
    """The offline scanner harness of the lifecycle tests, without re-running those tests."""
    setUp, tearDown, scan, feed = LifecycleTests.setUp, LifecycleTests.tearDown, LifecycleTests.scan, LifecycleTests.feed


del LifecycleTests

START = 1_800_000_000
HOUR = 3600


class EmptyValuationRetryTest(RadarCase):
    """A search that found nothing says little about the market: it must not block a model for days."""

    def test_empty_result_is_researched_again_after_the_short_wait(self):
        self.external.set(used=[])
        self.scan([listing("a", 200)], at=START)
        self.scan([listing("a", 200)], at=START + HOUR)
        self.assertEqual(len(self.external.calls), 1, "one hour later the empty answer is still cached")
        self.external.set(used=[400] * 6)
        self.scan([listing("a", 200)], at=START + 7 * HOUR)
        self.assertEqual(len(self.external.calls), 2)
        self.assertEqual(self.feed()["a"]["status"], "strong")

    def test_repeated_empty_results_back_off(self):
        self.external.set(used=[])
        self.scan([listing("a", 200)], at=START)
        self.scan([listing("a", 200)], at=START + 7 * HOUR)
        self.assertEqual(len(self.external.calls), 2)
        self.scan([listing("a", 200)], at=START + 14 * HOUR)
        self.assertEqual(len(self.external.calls), 2, "second miss doubles the wait to 12 h")
        self.scan([listing("a", 200)], at=START + 20 * HOUR)
        self.assertEqual(len(self.external.calls), 3)

    def test_valued_model_keeps_the_long_cache(self):
        self.external.set(used=[400] * 6)
        self.scan([listing("a", 200)], at=START)
        self.scan([listing("a", 200)], at=START + 7 * HOUR)
        self.assertEqual(len(self.external.calls), 1)

    def test_empty_results_from_older_research_rules_are_retried_at_once(self):
        self.external.set(used=[])
        self.scan([listing("a", 200)], at=START)
        db = bot.open_db()
        try:
            db.execute("UPDATE meta SET v='0' WHERE k='research_rules'")
            db.commit()
        finally:
            db.close()
        self.scan([listing("a", 200)], at=START + 600)
        self.assertEqual(len(self.external.calls), 2)
        self.scan([listing("a", 200)], at=START + 1200)
        self.assertEqual(len(self.external.calls), 2, "retried once, not on every run")

    def test_same_product_with_different_seller_wording_shares_one_valuation(self):
        q = CFG["queries"][0]
        keys = {bot.external_key(q, "unknown", {"title": title}) for title in (
            "iPhone 16 128GB zwart nette staat", "IPHONE 16 128gb - Zo goed als nieuw!", "iPhone 16 128GB accu 88%")}
        self.assertEqual(len(keys), 1)
        self.assertNotEqual(bot.external_key(q, "unknown", {"title": "iPhone 16 256GB"}), next(iter(keys)))


class ScoreTest(unittest.TestCase):
    def test_score_matches_shared_fixtures(self):
        with open(os.path.join(os.path.dirname(__file__), "..", "score_fixtures.json"), encoding="utf-8") as handle:
            fixtures = json.load(handle)
        for case in fixtures:
            total, parts = bot.deal_score(case["deal"], case["ageHours"])
            self.assertEqual(total, case["expected"]["total"], case["name"])
            self.assertEqual(parts, case["expected"]["parts"], case["name"])


class FeedScoreAndPriceTest(RadarCase):
    def test_every_deal_in_the_feed_has_a_score_with_parts(self):
        self.external.set(used=[400] * 6)
        self.scan([listing("a", 200)], at=START)
        deal = self.feed()["a"]
        self.assertGreaterEqual(deal["deal_score"], 60)
        self.assertEqual(set(deal["score_parts"]), {"profit", "roi", "evidence", "liquidity", "freshness", "risk"})

    def test_price_drop_is_recorded_with_the_previous_price(self):
        self.external.set(used=[600] * 6)
        self.scan([listing("a", 300)], at=START)
        self.assertIsNone(self.feed()["a"].get("previous_price"))
        self.scan([listing("a", 250)], at=START + HOUR)
        deal = self.feed()["a"]
        self.assertEqual(deal["price"], 250)
        self.assertEqual(deal["previous_price"], 300)
        self.assertTrue(deal["price_dropped_at"])
        self.assertEqual([point["price"] for point in deal["price_history"]], [300, 250])

    def test_price_increase_is_history_but_not_a_drop(self):
        self.external.set(used=[600] * 6)
        self.scan([listing("a", 250)], at=START)
        self.scan([listing("a", 280)], at=START + HOUR)
        deal = self.feed()["a"]
        self.assertEqual(deal["previous_price"], 250)
        self.assertIsNone(deal["price_dropped_at"])


if __name__ == "__main__":
    unittest.main()
