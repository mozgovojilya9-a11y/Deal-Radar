"""Per-listing valuation: real run of web/scripts/revalue-cli.ts, without network."""
import os
import shutil
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import bot  # noqa: E402

Q = {"key": "c", "label": "C"}


def offers(*rows):
    return [{"title": title, "price": price, "url": f"https://kleinanzeigen.de/{i}", "domain": "kleinanzeigen.de",
             "segment": "used", "method": "jsonld", "official": False} for i, (title, price) in enumerate(rows)]


def external(rows, stale=False):
    return {"checked_at": 1_800_000_000, "stale": stale, "offers": offers(*rows),
            "valuation": {"market_value": 1500, "used_count": len(rows)}}


def pending(title, group="unknown", listing_id="L1"):
    return [(Q, {listing_id: ({"title": title}, group, [])}, {})]


class ListingValueTest(unittest.TestCase):
    @unittest.skipUnless(shutil.which("node"), "node is required")
    def test_stored_offers_of_another_generation_are_dropped_on_read(self):
        item = pending("Nintendo Switch (2019)")
        key = bot.external_key(Q, "unknown", item[0][1]["L1"][0])
        metrics = {"technicalErrors": 0}
        result = bot.revalue_for_listings(item, {key: external([("Nintendo Switch 2", 380), ("Nintendo Switch 2 NEU", 399), ("Nintendo Switch 2 OVP", 400)])}, metrics)
        self.assertIsNone(result["L1"]["valuation"]["market_value"])
        self.assertEqual(result["L1"]["offers"], [])
        self.assertEqual(metrics["offersNotThisProduct"], 1)

    @unittest.skipUnless(shutil.which("node"), "node is required")
    def test_exact_offers_give_the_listing_its_own_value(self):
        item = pending("Canon EOS R6", "eosr6")
        key = bot.external_key(Q, "eosr6", item[0][1]["L1"][0])
        metrics = {"technicalErrors": 0}
        result = bot.revalue_for_listings(item, {key: external([("Canon EOS R6 Body", 1000), ("Canon EOS R6 Gehäuse", 1100), ("Canon EOS R6", 1200), ("Canon EOS R6 Mark II", 1700)])}, metrics)
        self.assertEqual(result["L1"]["valuation"]["market_value"], 1100)
        self.assertEqual(result["L1"]["valuation"]["used_count"], 3)

    def test_failed_check_gives_no_value_instead_of_an_unchecked_one(self):
        item = pending("Canon EOS R6", "eosr6")
        key = bot.external_key(Q, "eosr6", item[0][1]["L1"][0])
        metrics = {"technicalErrors": 0}
        with mock.patch.object(bot, "run_listing_revalue", return_value=None):
            result = bot.revalue_for_listings(item, {key: external([("Canon EOS R6", 1000)])}, metrics)
        self.assertIsNone(result["L1"])
        self.assertEqual(metrics["technicalErrors"], 1)

    def test_stale_valuation_is_not_checked_and_stays_unused(self):
        item = pending("Canon EOS R6", "eosr6")
        key = bot.external_key(Q, "eosr6", item[0][1]["L1"][0])
        with mock.patch.object(bot, "run_listing_revalue") as run:
            self.assertEqual(bot.revalue_for_listings(item, {key: external([("Canon EOS R6", 1000)], stale=True)}, {"technicalErrors": 0}), {})
        run.assert_not_called()


class ModelGroupTest(unittest.TestCase):
    def setUp(self):
        import json
        with open(os.path.join(os.path.dirname(__file__), "..", "config.json"), encoding="utf8") as handle:
            self.queries = {q["key"]: q for q in json.load(handle)["queries"]}

    def test_macbook_memory_comes_from_description_when_title_has_none(self):
        title = "Apple MacBook Pro 14 inch – 1TB SSD (M3, 2023)"
        text = title + " met m3-chip, 8 gb geheugen en 1 tb ssd-opslag"
        self.assertIn("8gb", bot.model_group_for(self.queries["macbook"], title, text).split("-"))

    def test_macbook_title_memory_is_not_overridden(self):
        title = "MacBook Air M3 13 inch 16GB 512GB"
        group = bot.model_group_for(self.queries["macbook"], title, title + " vorige had 8 gb geheugen")
        self.assertIn("16gb", group)
        self.assertNotIn("8gb", group)

    def test_switch_2019_with_switch_2_in_description_is_not_switch_2(self):
        title = "Nintendo Switch (2019) met accessoires"
        self.assertEqual(bot.model_group_for(self.queries["switch"], title, title + " wegens aanschaf switch 2"), "unknown")

    def test_canon_mark_two_is_its_own_group(self):
        q = self.queries["camera-canon"]
        self.assertNotEqual(bot.model_group_for(q, "Canon EOS R6 Mark II body", ""), bot.model_group_for(q, "Canon EOS R6 body", ""))


if __name__ == "__main__":
    unittest.main()
