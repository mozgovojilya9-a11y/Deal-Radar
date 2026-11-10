import { test } from "node:test";
import assert from "node:assert/strict";
import { accessFrom, invoicePayload, parsePayload, PLANS, subscriptionFrom, type StarTransaction } from "../lib/subscription";

const T0 = 1_800_000_000; // seconds
const DAY = 86_400;
const pay = (id: string, user: number, plan: "month" | "year", date: number, amount = PLANS[plan].stars, period?: number): StarTransaction => ({
  id, amount, date, source: { type: "user", transaction_type: "invoice_payment", user: { id: user }, invoice_payload: invoicePayload(plan, String(user)), subscription_period: period },
});
const refund = (user: number, amount: number, date: number): StarTransaction => ({ id: "r" + date, amount, date, receiver: { type: "user", user: { id: user } } });

test("payload round trip and rejection of foreign payloads", () => {
  assert.deepEqual(parsePayload(invoicePayload("year", "42")), { plan: "year", userId: "42" });
  assert.equal(parsePayload("dr1:week:42"), null);
  assert.equal(parsePayload("other"), null);
});

test("a monthly payment gives 30 days, a renewal extends them", () => {
  const first = subscriptionFrom([pay("c1", 7, "month", T0, 1000, 2_592_000)], "7", (T0 + 10 * DAY) * 1000);
  assert.equal(first.active, true);
  assert.equal(first.plan, "month");
  assert.equal(first.until, new Date((T0 + 30 * DAY) * 1000).toISOString());
  assert.equal(first.chargeId, "c1");
  const renewed = subscriptionFrom([pay("c1", 7, "month", T0), pay("c2", 7, "month", T0 + 30 * DAY)], "7", (T0 + 45 * DAY) * 1000);
  assert.equal(renewed.active, true);
  assert.equal(renewed.chargeId, "c2");
  const lapsed = subscriptionFrom([pay("c1", 7, "month", T0)], "7", (T0 + 31 * DAY) * 1000);
  assert.equal(lapsed.active, false);
});

test("the yearly plan gives 365 days without renewal", () => {
  const year = subscriptionFrom([pay("y1", 7, "year", T0)], "7", (T0 + 300 * DAY) * 1000);
  assert.deepEqual([year.active, year.plan, year.recurring], [true, "year", false]);
  assert.equal(subscriptionFrom([pay("y1", 7, "year", T0)], "7", (T0 + 366 * DAY) * 1000).active, false);
});

test("other users, underpayments and forged payloads do not count", () => {
  const forged: StarTransaction = { ...pay("x", 7, "year", T0), source: { type: "user", user: { id: 7 }, invoice_payload: invoicePayload("year", "8") } };
  const rows = [pay("o", 8, "year", T0), pay("u", 7, "year", T0, 500), forged];
  assert.equal(subscriptionFrom(rows, "7", (T0 + DAY) * 1000).active, false);
});

test("a refund cancels the payment it returns", () => {
  const rows = [pay("y1", 7, "year", T0), refund(7, 10000, T0 + DAY)];
  assert.equal(subscriptionFrom(rows, "7", (T0 + 2 * DAY) * 1000).active, false);
  const other = [pay("y1", 7, "year", T0), refund(8, 10000, T0 + DAY)];
  assert.equal(subscriptionFrom(other, "7", (T0 + 2 * DAY) * 1000).active, true);
});

test("access: open without paywall, trial for 3 days, then locked until paid", () => {
  const none = subscriptionFrom([], "7");
  const start = T0 * 1000;
  assert.equal(accessFrom({ paywall: false, subscription: none, trialStartedAt: null }).mode, "open");
  assert.equal(accessFrom({ paywall: true, subscription: none, trialStartedAt: start, now: start + 2 * DAY * 1000 }).mode, "trial");
  assert.equal(accessFrom({ paywall: true, subscription: none, trialStartedAt: start, now: start + 3 * DAY * 1000 + 1 }).mode, "locked");
  const paid = subscriptionFrom([pay("y1", 7, "year", T0 + 4 * DAY)], "7", start + 5 * DAY * 1000);
  assert.equal(accessFrom({ paywall: true, subscription: paid, trialStartedAt: start, now: start + 5 * DAY * 1000 }).mode, "subscribed");
});
