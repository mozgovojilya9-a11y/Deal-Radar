import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { checkoutProblem, invoicePayload } from "../lib/subscription";

process.env.TELEGRAM_TOKEN = "123:test";
const calls: Array<{ method: string; body: Record<string, unknown> }> = [];
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  const method = String(url).split("/").pop() as string;
  calls.push({ method, body: JSON.parse(String(init?.body || "{}")) });
  return new Response(JSON.stringify({ ok: true, result: method === "createInvoiceLink" ? "https://t.me/$invoice" : true }), { status: 200 });
}) as typeof fetch;

const { POST: webhook } = await import("../app/api/telegram/webhook/route");
const { POST: subscription } = await import("../app/api/subscription/route");
const { webhookSecret } = await import("../lib/telegram-bot");

const update = (body: unknown, secret = webhookSecret()) => new NextRequest("http://localhost/api/telegram/webhook",
  { method: "POST", headers: { "x-telegram-bot-api-secret-token": secret, "content-type": "application/json" }, body: JSON.stringify(body) });

test("checkout is accepted only for the buyer's own invoice at the plan price", () => {
  const ok = { from: { id: 7 }, currency: "XTR", total_amount: 1000, invoice_payload: invoicePayload("month", "7") };
  assert.equal(checkoutProblem(ok), null);
  assert.match(String(checkoutProblem({ ...ok, from: { id: 8 } })), /другого/);
  assert.match(String(checkoutProblem({ ...ok, total_amount: 1 })), /Сумма/);
  assert.match(String(checkoutProblem({ ...ok, invoice_payload: "x" })), /Неизвестный/);
  assert.equal(checkoutProblem({ ...ok, total_amount: 10000, invoice_payload: invoicePayload("year", "7") }), null);
});

test("the webhook rejects requests without the secret header", async () => {
  assert.equal((await webhook(update({}, "wrong"))).status, 403);
});

test("the webhook answers checkouts and the /terms command", async () => {
  calls.length = 0;
  await webhook(update({ pre_checkout_query: { id: "q1", from: { id: 7 }, currency: "XTR", total_amount: 1000, invoice_payload: invoicePayload("month", "7") } }));
  assert.deepEqual(calls.map((call) => [call.method, call.body.ok]), [["answerPreCheckoutQuery", true]]);
  calls.length = 0;
  await webhook(update({ pre_checkout_query: { id: "q2", from: { id: 9 }, currency: "XTR", total_amount: 1000, invoice_payload: invoicePayload("month", "7") } }));
  assert.equal(calls[0].body.ok, false);
  calls.length = 0;
  await webhook(update({ message: { chat: { id: 7 }, from: { id: 7 }, text: "/terms" } }));
  assert.equal(calls[0].method, "sendMessage");
  assert.match(String(calls[0].body.text), /1000 ⭐/);
});

test("without PAYWALL_ENABLED the app stays open", async () => {
  delete process.env.PAYWALL_ENABLED;
  const response = await subscription(new NextRequest("http://localhost/api/subscription", { method: "POST", body: "{}" }));
  const data = await response.json();
  assert.equal(data.paywall, false);
  assert.equal(data.access.mode, "open");
  assert.equal(createHmac("sha256", "123:test").update("deal-radar-webhook").digest("hex"), webhookSecret());
});
