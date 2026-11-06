"""Offline scanner tests: no network, no Telegram. Run: python -m unittest discover -s tests"""
import json
import os
import sys
import tempfile
import urllib.request
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
TMP = tempfile.mkdtemp()
os.environ["DEAL_DB"] = os.path.join(TMP, "state.db")
os.environ["DEAL_FEED"] = os.path.join(TMP, "data", "deals.json")

import bot  # noqa: E402

CFG = {
    "postcode": "7671", "distance_km": 50, "pages": 1, "seed_pages": 1, "min_samples": 3,
    "market_days": 21, "max_age_hours": 720,
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
        seed = [listing(str(i), 400, date=datetime.now(timezone.utc).isoformat()) for i in range(1, 7)]
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
        updated = bot.load_feed()["deals"]
        self.assertEqual([d["listing_id"] for d in updated], ["99"])
        self.assertEqual(updated[0]["status"], "strong")

    def test_listing_published_29_days_ago_is_eligible_with_30_day_window(self):
        posted = (datetime.now(timezone.utc) - timedelta(days=29)).isoformat()
        seed = [listing(f"old-{i}", 400, date=posted) for i in range(1, 7)]
        deal = listing("old-deal", 250, date=posted, title="PS5 met 2 controllers")
        self.assertTrue(self.run_scan(seed + [deal]))
        feed = bot.load_feed()
        self.assertEqual([item["listing_id"] for item in feed["deals"]], ["old-deal"])
        self.assertEqual(feed["deals"][0]["posted_at"], posted)

    def test_listing_published_31_days_ago_is_excluded(self):
        posted = (datetime.now(timezone.utc) - timedelta(days=31)).isoformat()
        seed = [listing(f"expired-{i}", 400, date=posted) for i in range(1, 7)]
        deal = listing("expired-deal", 250, date=posted, title="PS5 met 2 controllers")
        self.assertTrue(self.run_scan(seed + [deal]))
        self.assertEqual(bot.load_feed()["deals"], [])

    def test_iphone_search_rejects_replacement_parts_not_phones(self):
        with open(os.path.join(ROOT, "config.json"), encoding="utf-8") as handle:
            config = json.load(handle)
        iphone = next(q for q in config["queries"] if q["key"] == "iphone-16")
        self.assertFalse(bot.title_matches_query(iphone, "Scherm voor iPhone 16 Plus Zwart Service Pack"))
        self.assertFalse(bot.title_matches_query(iphone, "Scherm met Sensor Flex voor iPhone 16 Pro Max Zwart Pulled"))
        self.assertTrue(bot.title_matches_query(iphone, "Apple iPhone 16 Zwart, 88% Batterijconditie"))
        self.assertTrue(bot.title_matches_query(iphone, "iPhone 16 Pro Max 256GB - scherm krasvrij"))

    def test_dutch_marktplaats_date_labels_are_parsed(self):
        now_label = f"{datetime.now(timezone.utc).day} {['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'][datetime.now(timezone.utc).month - 1]} {datetime.now(timezone.utc).year % 100:02d}"
        self.assertLess(bot.age_hours(now_label), 1)
        self.assertGreaterEqual(bot.age_hours("Eergisteren"), 47)
        self.assertLessEqual(bot.age_hours("Eergisteren"), 49)
        self.assertGreater(bot.age_hours("18 okt 26"), 7 * 24)

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

    def test_duplicate_search_results_are_counted_once(self):
        now = datetime.now(timezone.utc).isoformat()
        rows = [listing("a", 400, now), listing("b", 400, now), listing("c", 400, now),
                listing("a", 400, now), listing("b", 400, now)]
        self.assertTrue(self.run_scan(rows))
        stats = bot.load_feed()["scannerStats"]
        self.assertEqual(stats["checked"], 5)
        self.assertEqual(stats["unique"], 3)
        self.assertEqual(stats["duplicates"], 2)

    def test_candidate_without_comparables_is_filtered_from_main_feed(self):
        now = datetime.now(timezone.utc).isoformat()
        self.assertTrue(self.run_scan([listing("solo", 180, now)]))
        self.assertEqual(bot.load_feed()["deals"], [])

    def test_query_aliases_match_ps5_console_variants_and_hide_candidates_from_main_feed(self):
        q = {"query": "playstation 5", "include_any": ["ps5"], "exclude": []}
        self.assertTrue(bot.title_matches_query(q, "PS5 Slim Console"))
        self.assertTrue(bot.title_matches_query(q, "PlayStation 5 Disc Drive"))
        feed = {"deals": [
            {"listing_id": "good-1", "category_key": "ps5", "title": "PS5 console", "description": "", "price": 300,
             "listing_url": "https://www.marktplaats.nl/v/good-1", "status": "good", "estimated_profit": 70, "profit_roi": 0.4,
             "detected_at": datetime.now(timezone.utc).isoformat()},
            {"listing_id": "candidate-1", "category_key": "ps5", "title": "PS5 controller", "description": "", "price": 100,
             "listing_url": "https://www.marktplaats.nl/v/candidate-1", "status": "candidate", "estimated_profit": 5, "profit_roi": 0.05,
             "detected_at": datetime.now(timezone.utc).isoformat()},
        ], "updatedAt": None}
        with open(os.environ["DEAL_FEED"], "w", encoding="utf-8") as handle:
            json.dump(feed, handle)
        db = bot.open_db()
        try:
            self.assertTrue(self.run_scan([]))
        finally:
            db.close()
        self.assertEqual([d["listing_id"] for d in bot.load_feed()["deals"]], ["good-1"])

    def test_profit_floor_is_50_eur(self):
        cfg = {"profitability": {"market_resale_factor": 0.95, "buyer_negotiation_rate": 0.04, "selling_fee_rate": 0.08, "fixed_selling_cost_eur": 10, "min_profit_eur": 50, "min_roi": 0.2}}
        result = bot.calculate_resale_economics({"min_profit_eur": 50, "min_roi": 0.2}, 160, 127, 12, "marktplaats", cfg=cfg)
        self.assertFalse(result["profitable"])
        self.assertLess(result["estimated_profit"], 50)

    def test_television_groups_include_brand_size_panel_resolution_and_year(self):
        q = {"group_type": "television"}
        samsung = bot.group_of(q, "Samsung UE43CU8000 43 inch 4K LED")
        sony = bot.group_of(q, "Sony KD55X85L 55 inch 4K TV")
        samsung_qled = bot.group_of(q, "Samsung QE43Q80D 43 inch 4K QLED")
        self.assertEqual(samsung, "samsung-43-led-lcd-4k-2023")
        self.assertEqual(sony, "sony-55-panel-unknown-4k-2023")
        self.assertNotEqual(samsung, samsung_qled)
        self.assertEqual(bot.group_of(q, "Smart TV 43 inch"), "unknown")

    def test_model_required_categories_do_not_group_unknown_models_together(self):
        q = {"group_type": "model_required", "group_regex": r"\b(?:mini\s*3|mavic\s*3)\b"}
        self.assertEqual(bot.group_of(q, "DJI Mini 3 Pro drone"), "mini3")
        self.assertEqual(bot.group_of(q, "Drone complete set"), "unknown")

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

    def test_unknown_category_key_in_cached_feed_is_ignored(self):
        cached = {
            "updatedAt": None,
            "deals": [{
                "listing_id": "missing-q",
                "category_key": "totally-unknown",
                "title": "PS5 console",
                "description": "",
                "price": 430,
                "listing_url": "https://www.marktplaats.nl/v/missing-q",
                "status": "candidate",
            }],
        }
        with open(os.environ["DEAL_FEED"], "w", encoding="utf-8") as handle:
            json.dump(cached, handle)
        db = bot.open_db()
        try:
            self.assertTrue(self.run_scan([], dry=False))
        finally:
            db.close()
        self.assertEqual(bot.load_feed()["deals"], [])

    def test_external_website_links_are_rejected_and_email_is_allowed(self):
        now = datetime.now(timezone.utc).isoformat()
        linked = listing("linked", 150, now)
        linked["description"] = "Visit our shop https://example-store.nl/product"
        clean = listing("clean", 150, now)
        clean["description"] = "See our listing on https://www.marktplaats.nl/v/clean"
        self.assertTrue(self.run_scan([linked, clean]))
        self.assertEqual(bot.load_feed()["deals"], [])
        self.assertTrue(bot.has_external_website_link("shop.example.nl"))
        self.assertFalse(bot.has_external_website_link("seller@gmail.com"))

    def test_iphone_64gb_160_euro_is_unprofitable_at_127_market_median(self):
        cfg={"profitability":{"market_resale_factor":0.95,"buyer_negotiation_rate":0.04,"selling_fee_rate":0.08,"fixed_selling_cost_eur":10,"min_profit_eur":40,"min_roi":0.2}}
        result=bot.calculate_resale_economics({"min_profit_eur":55,"min_roi":0.25},160,127,12,"marktplaats",cfg=cfg)
        self.assertFalse(result["profitable"])
        self.assertLess(result["estimated_profit"],-60)

    def test_iphone_variants_and_storage_do_not_share_market_group(self):
        with open(os.path.join(ROOT,"config.json"),encoding="utf-8") as handle: config=json.load(handle)
        q=next(q for q in config["queries"] if q["key"]=="iphone-12")
        self.assertEqual(bot.group_of(q,"iPhone 12 64GB"),"64gb")
        self.assertEqual(bot.group_of(q,"iPhone 12 Pro 128GB"),"128gb-pro")
        self.assertEqual(bot.group_of(q,"iPhone 12 without storage"),"unknown")

    def test_current_tv_generations_and_old_tv_rejection(self):
        q={"group_type":"television","min_model_year":2023}
        base={"id":"tv","price":500,"ptype":"FIXED","dist_km":1,"external_link":False}
        old=dict(base,title="Samsung QE55Q80B",text="Samsung QE55Q80B")
        self.assertEqual(bot.primary_rejection(q,old,{"distance_km":50}),"old_model")
        self.assertEqual(bot.television_model_year("LG OLED55C2"),2022)
        self.assertEqual(bot.television_model_year("LG OLED55C6"),2026)
        self.assertEqual(bot.television_model_year("65QNED82B6B"),2026)
        self.assertEqual(bot.television_model_year("65U8N"),2024)
        self.assertEqual(bot.television_model_year("65U8Q"),2025)
        self.assertEqual(bot.television_model_year("55P6L"),2026)
        self.assertEqual(bot.television_model_year("65PUS8001/12"),2026)
        self.assertEqual(bot.television_model_year("K-55XR50"),2025)
        self.assertEqual(bot.television_model_year("K-65XR90"),2024)
        self.assertEqual(bot.television_model_year("K-65XR90M2"),2026)
        self.assertEqual(bot.television_model_year("Samsung UA55U8000H"),2026)
        self.assertEqual(bot.television_model_year("Samsung QE55Q80B bought in 2025"),2022)
        self.assertIsNone(bot.television_model_year("Generic 55 inch 4K Smart TV"))

    def test_camera_categories_use_model_specific_filters(self):
        with open(os.path.join(ROOT,"config.json"),encoding="utf-8") as handle: config=json.load(handle)
        sony=next(q for q in config["queries"] if q["key"]=="camera-sony")
        canon=next(q for q in config["queries"] if q["key"]=="camera-canon")
        self.assertTrue(bot.title_matches_query(sony,"Sony A7 IV systeemcamera body"))
        self.assertFalse(bot.title_matches_query(sony,"Sony camera tas"))
        self.assertTrue(bot.title_matches_query(canon,"Canon EOS R6 Mark II body"))

    def test_global_price_ceiling_is_800_euros(self):
        q={"min_price":1,"max_price":2000}
        item={"title":"Sony camera body","id":"x","price":801,"ptype":"FIXED","dist_km":1,"external_link":False}
        self.assertEqual(bot.primary_rejection(q,item,{"distance_km":50,"max_product_price_eur":800}),"price_range")
        item["price"]=800
        self.assertIsNone(bot.primary_rejection(q,item,{"distance_km":50,"max_product_price_eur":800}))

    def test_rayban_gen2_accepts_wayfarer_and_rw4012_variants(self):
        with open(os.path.join(ROOT,"config.json"),encoding="utf-8") as handle: config=json.load(handle)
        q=next(q for q in config["queries"] if q["key"]=="rayban")
        self.assertTrue(bot.title_matches_query(q,"Ray-Ban Meta Wayfarer Gen 2 RW4012 Matte Zwart"))
        self.assertTrue(bot.title_matches_query(q,"Ray-Ban Meta Gen 2 RW4012"))
        self.assertTrue(bot.title_matches_query(q,"Rayban Meta Wayfarer Gen 2"))
        self.assertFalse(bot.title_matches_query(q,"Ray-Ban Meta Wayfarer Gen 1 RW4006"))
        self.assertEqual(bot.group_of(q,"Ray-Ban Meta Gen 2 RW4012"),"wayfarer-gen-2")

    def test_ai_reviews_are_cached_until_listing_text_changes(self):
        db = bot.open_db()
        item = {
            "id": "ai-1", "title": "PS5 console",
            "description": "PlayStation 5 disc edition in goede staat",
            "price": 250,
        }
        verdict = {
            "ai-1": {
                "same_product": True, "comparable": True, "is_accessory": False,
                "confidence": 0.98, "variant": "disc", "reason": "Exacte PS5 disc-console",
            }
        }
        try:
            with mock.patch.dict(os.environ, {"OLLAMA_HOST": "http://127.0.0.1:11434"}):
                with mock.patch.object(bot, "request_ai_listing_review", return_value=verdict) as request_ai:
                    first = bot.review_listings_with_ai(db, CFG["queries"][0], [item])
                    second = bot.review_listings_with_ai(db, CFG["queries"][0], [item])
                    self.assertTrue(first["ai-1"]["same_product"])
                    self.assertTrue(second["ai-1"]["comparable"])
                    self.assertEqual(request_ai.call_count, 1)
                    changed = {**item, "description": "PlayStation 5 controller only"}
                    refreshed = bot.review_listings_with_ai(db, CFG["queries"][0], [changed])
                    self.assertIn("ai-1", refreshed)
                    self.assertEqual(request_ai.call_count, 2)
        finally:
            db.close()

    def test_ai_can_confidently_reject_accessory_mismatch(self):
        now = datetime.now(timezone.utc).isoformat()
        seed = [listing(f"ai-seed-{i}", 400, now) for i in range(1, 7)]
        target = listing("ai-accessory", 80, now, title="PS5 controller")
        def decisions(db, query, items):
            return {
                "ai-accessory": {
                    "same_product": False, "comparable": False, "is_accessory": True,
                    "confidence": 0.99, "variant": "controller",
                    "reason": "Контроллер является аксессуаром, а не консолью",
                }
            }
        db = bot.open_db()
        try:
            with mock.patch.object(bot, "fetch_query", return_value=seed + [target]), \
                 mock.patch.object(bot, "review_listings_with_ai", side_effect=decisions):
                self.assertTrue(bot.run_once(CFG, db, dry=False))
            self.assertEqual(bot.load_feed()["deals"], [])
        finally:
            db.close()

    def test_marktplaats_v2_search_result_is_normalized(self):
        row={"itemId":"m123","title":"Ray-Ban Meta Gen 2 RW4012",
             "priceModel":{"modelType":"fixed","askingPrice":32500},
             "translations":[{"locale":"nl-NL","description":"Wayfarer Gen 2"}],
             "_links":{"mp:advertisement-website-link":{"href":"https://link.marktplaats.nl/m123"}}}
        parsed=bot.parse_listing(row)
        self.assertEqual(parsed["price"],325)
        self.assertEqual(parsed["ptype"],"FIXED")
        self.assertEqual(parsed["id"],"m123")
        self.assertIn("Wayfarer",parsed["text"])

    def test_rayban_meta_wayfarer_without_rayban_brand_word_is_accepted(self):
        with open(os.path.join(ROOT,"config.json"),encoding="utf-8") as handle: config=json.load(handle)
        q=next(q for q in config["queries"] if q["key"]=="rayban")
        self.assertTrue(bot.title_matches_query(q,"Meta Wayfarer Gen 2 RW4012"))

    def test_rayban_code_in_description_is_accepted(self):
        with open(os.path.join(ROOT, "config.json"), encoding="utf-8") as handle:
            config=json.load(handle)
        q=next(q for q in config["queries"] if q["key"]=="rayban")
        row=listing("rb-gen2-description", 230, datetime.now(timezone.utc).isoformat(),
                    title="Ray-Ban Meta Wayfarer slimme bril")
        row["description"]="Modelnummer RW4012, Meta Wayfarer Gen 2"
        item=bot.parse_listing(row)
        self.assertIsNone(bot.primary_rejection(q, item, {
            "distance_km":50, "max_product_price_eur":800
        }))
        self.assertEqual(bot.group_of(q, item["text"]), "wayfarer-gen-2")

    def test_rayban_wayfarer_gen2_without_meta_word_is_accepted(self):
        with open(os.path.join(ROOT, "config.json"), encoding="utf-8") as handle:
            config=json.load(handle)
        q=next(q for q in config["queries"] if q["key"]=="rayban")
        self.assertTrue(bot.title_matches_query(q, "Ray-Ban Wayfarer Gen 2 RW4012 Matte Black"))
        self.assertTrue(bot.title_matches_query(q, "RW4012 601S1Z 50-22"))
        self.assertFalse(bot.title_matches_query(q, "Ray-Ban Wayfarer Gen 1 RW4006"))
        self.assertEqual(bot.group_of(q, "Ray-Ban Wayfarer Gen 2 RW4012"), "wayfarer-gen-2")

    def test_existing_feed_drops_cached_products_over_800_euros(self):
        os.makedirs(os.path.dirname(os.environ["DEAL_FEED"]), exist_ok=True)
        old_deal = {
            "listing_id": "old-900", "category_key": "ps5", "title": "PS5 console",
            "description": "", "price": 900, "listing_url": "https://www.marktplaats.nl/v/old-900",
            "status": "strong", "estimated_profit": 100, "profit_roi": 0.4,
        }
        with open(os.environ["DEAL_FEED"], "w", encoding="utf-8") as handle:
            json.dump({"deals": [old_deal], "updatedAt": None}, handle)
        self.assertTrue(self.run_scan([]))
        self.assertEqual(bot.load_feed()["deals"], [])


if __name__ == "__main__":
    unittest.main()
