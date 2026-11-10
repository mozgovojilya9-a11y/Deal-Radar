"""Telegram alerts: what is sent, when, and that nothing is lost or repeated. No network."""
import os
import sqlite3
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import bot  # noqa: E402

CFG = {"notifications": {"enabled": True, "min_profit_eur": 0, "max_per_run": 2, "categories": []}}
ENV = {"TELEGRAM_TOKEN": "t", "TELEGRAM_CHAT_ID": "1"}


def deal(listing_id, status="good", profit=100, **extra):
    return {"listing_id": listing_id, "status": status, "title": "PS5 <Slim>", "category_label": "PS5", "price": 200, "market_value": 400,
            "estimated_profit": profit, "profit_roi": 0.5, "max_offer_price": 240, "opening_offer_price": 180, "city": "Utrecht", "distance_km": 12.4,
            "listing_url": "https://www.marktplaats.nl/v/" + listing_id, "active": True, "valuation_rules": bot.VALUATION_RULES, **extra}


class NotifyTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("CREATE TABLE notified(id TEXT PRIMARY KEY, status TEXT, ts INTEGER)")
        self.sent = []
        self.answer = True
        self.patches = [mock.patch.object(bot, "send_telegram", self.fake_send), mock.patch.object(bot.time, "sleep", lambda *_: None),
                        mock.patch.dict(os.environ, ENV)]
        for patch in self.patches:
            patch.start()

    def tearDown(self):
        for patch in reversed(self.patches):
            patch.stop()

    def fake_send(self, _token, _chat, text, button=None):
        if self.answer:
            self.sent.append(text)
        return self.answer

    def enable(self, deals=()):
        bot.notify_new_deals(self.db, list(deals), CFG, 1)
        self.sent.clear()

    def test_first_run_announces_instead_of_flooding(self):
        bot.notify_new_deals(self.db, [deal("a"), deal("b"), deal("c")], CFG, 1)
        self.assertEqual(len(self.sent), 1)
        self.assertIn("включены", self.sent[0])
        bot.notify_new_deals(self.db, [deal("a"), deal("b"), deal("c")], CFG, 2)
        self.assertEqual(len(self.sent), 1)

    def test_new_deal_is_sent_once_with_escaped_title_and_negotiation(self):
        self.enable([deal("old")])
        bot.notify_new_deals(self.db, [deal("old"), deal("new")], CFG, 2)
        bot.notify_new_deals(self.db, [deal("old"), deal("new")], CFG, 3)
        self.assertEqual(len(self.sent), 1)
        self.assertIn("&lt;Slim&gt;", self.sent[0])
        self.assertIn("начни с €180, максимум €240", self.sent[0])

    def test_upgrade_to_best_is_sent_again_but_downgrade_is_not(self):
        self.enable([deal("x")])
        bot.notify_new_deals(self.db, [deal("x", "strong")], CFG, 2)
        self.assertIn("повышен", self.sent[-1])
        count = len(self.sent)
        bot.notify_new_deals(self.db, [deal("x", "good")], CFG, 3)
        self.assertEqual(len(self.sent), count)

    def test_failed_send_is_retried_next_run(self):
        self.enable([deal("old")])
        self.answer = False
        bot.notify_new_deals(self.db, [deal("old"), deal("new")], CFG, 2)
        self.answer = True
        bot.notify_new_deals(self.db, [deal("old"), deal("new")], CFG, 3)
        self.assertEqual(len(self.sent), 1)

    def test_more_than_limit_sends_best_first_and_one_summary(self):
        self.enable([deal("old")])
        bot.notify_new_deals(self.db, [deal("low", profit=60), deal("top", profit=300), deal("mid", profit=100), deal("old")], CFG, 2)
        self.assertEqual(len(self.sent), 3)
        self.assertIn("€300", self.sent[0])
        self.assertIn("Ещё новых выгодных предложений: 1", self.sent[2])
        bot.notify_new_deals(self.db, [deal("low", profit=60), deal("top", profit=300), deal("mid", profit=100), deal("old")], CFG, 3)
        self.assertEqual(len(self.sent), 3)

    def test_waiting_old_rules_and_reserved_deals_are_never_sent(self):
        self.enable([deal("old")])
        rows = [deal("w", "candidate"), deal("r", reserved=True), deal("v", valuation_rules=1), deal("i", active=False)]
        bot.notify_new_deals(self.db, rows, CFG, 2)
        self.assertEqual(self.sent, [])

    def test_price_drop_on_a_known_deal_is_sent_once(self):
        self.enable([deal("x")])
        dropped = deal("x", price=170, previous_price=200, price_dropped_at="1970-01-01T00:00:05+00:00")
        bot.notify_new_deals(self.db, [dropped], CFG, 10)
        self.assertEqual(len(self.sent), 1)
        self.assertIn("Цена снижена", self.sent[0])
        self.assertIn("€200 → €170", self.sent[0])
        bot.notify_new_deals(self.db, [dropped], CFG, 20)
        self.assertEqual(len(self.sent), 1)

    def test_price_drop_before_the_last_alert_is_not_news(self):
        self.enable([deal("old")])
        bot.notify_new_deals(self.db, [deal("old"), deal("x", previous_price=250, price_dropped_at="1970-01-01T00:00:05+00:00")], CFG, 10)
        self.assertEqual(len(self.sent), 1)
        self.assertNotIn("Цена снижена", self.sent[0])
        bot.notify_new_deals(self.db, [deal("old"), deal("x", previous_price=250, price_dropped_at="1970-01-01T00:00:05+00:00")], CFG, 20)
        self.assertEqual(len(self.sent), 1)

    def test_without_secrets_nothing_happens(self):
        with mock.patch.dict(os.environ, {"TELEGRAM_TOKEN": "", "TELEGRAM_CHAT_ID": ""}):
            bot.notify_new_deals(self.db, [deal("a")], CFG, 1)
        self.assertEqual(self.sent, [])


def star_payment(user, plan, date, amount=None, period=None):
    stars = {"month": 1000, "year": 10000}[plan]
    return {"id": f"c{user}{date}", "amount": amount or stars, "date": date,
            "source": {"type": "user", "user": {"id": user}, "invoice_payload": f"dr1:{plan}:{user}", "subscription_period": period}}


class SubscriberTest(unittest.TestCase):
    NOW = 1_800_000_000

    def test_active_subscribers_follow_payments_periods_and_refunds(self):
        day = 86400
        rows = [
            star_payment(1, "month", self.NOW - 10 * day, period=2592000),   # active
            star_payment(2, "month", self.NOW - 40 * day),                   # lapsed
            star_payment(3, "year", self.NOW - 200 * day),                   # active
            star_payment(4, "year", self.NOW - day),                         # refunded below
            {"id": "r4", "amount": 10000, "date": self.NOW, "receiver": {"type": "user", "user": {"id": 4}}},
            star_payment(5, "year", self.NOW - day, amount=500),             # underpaid
            {**star_payment(6, "year", self.NOW - day), "source": {"type": "user", "user": {"id": 6}, "invoice_payload": "dr1:year:7"}},
        ]
        self.assertEqual(bot.active_subscribers(rows, self.NOW), {"1", "3"})


class SubscriberAlertTest(NotifyTest):
    def test_new_deal_also_goes_to_paying_subscribers(self):
        self.enable([deal("old")])
        chats = []
        self.fake_send_chats = chats
        with mock.patch.dict(os.environ, {"PAYWALL_ENABLED": "1"}), \
                mock.patch.object(bot, "fetch_star_transactions", return_value=[star_payment(55, "year", 2)]), \
                mock.patch.object(bot, "send_telegram", lambda _t, chat, text, button=None: chats.append(chat) or True):
            bot.notify_new_deals(self.db, [deal("old"), deal("new")], CFG, 3)
        self.assertEqual(chats, ["1", "55"])

    def test_without_paywall_only_the_owner_gets_alerts(self):
        self.enable([deal("old")])
        with mock.patch.object(bot, "fetch_star_transactions") as fetch:
            bot.notify_new_deals(self.db, [deal("old"), deal("new")], CFG, 3)
        fetch.assert_not_called()
        self.assertEqual(len(self.sent), 1)


class SendTest(unittest.TestCase):
    def test_token_is_not_logged_on_failure(self):
        logged = []
        error = bot.urllib.error.HTTPError("https://api.telegram.org/botSECRET/sendMessage", 403, "Forbidden", {}, None)
        with mock.patch.object(bot, "log", logged.append), mock.patch.object(bot.urllib.request, "urlopen", side_effect=error):
            self.assertFalse(bot.send_telegram("SECRET", "1", "text"))
        self.assertTrue(logged)
        self.assertFalse(any("SECRET" in line for line in logged))


if __name__ == "__main__":
    unittest.main()
