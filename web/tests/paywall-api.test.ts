import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { invoicePayload } from "../lib/subscription";

const TOKEN = "123:test";
Object.assign(process.env, { TELEGRAM_TOKEN: TOKEN, PAYWALL_ENABLED: "1", UPSTASH_REDIS_REST_URL: "https://kv.test", UPSTASH_REDIS_REST_TOKEN: "t" });

const now = new Date().toISOString();
const feed = { valuationVersion: 2, updatedAt: now, scannedAt: now, deals: [{
  listing_id: "m1", title: "PS5 Slim", description: "", price: 300, market_price: 450, discount: 0.33, category_key: "ps5", category_label: "PS5",
  listing_url: "https://www.marktplaats.nl/v/m1", detected_at: now, posted_at: now, active: true, status: "good", estimated_profit: 60, profit_roi: 0.3 }] };
const trials = new Map<string, string>();
let transactions: unknown[] = [];

globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  const href = String(url);
  if (href.startsWith("https://kv.test")) {
    const [command, key, value] = JSON.parse(String(init?.body)) as string[];
    if (command === "SET" && !trials.has(key)) trials.set(key, value);
    return Response.json({ result: command === "GET" ? trials.get(key) ?? null : "OK" });
  }
  if (href.includes("api.telegram.org")) return Response.json({ ok: true, result: { transactions } });
  return Response.json(feed);
}) as typeof fetch;

const { GET: deals } = await import("../app/api/deals/route");
const { POST: subscription } = await import("../app/api/subscription/route");

function initData(userId: number): string {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: userId }) });
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => k + "=" + v).join("\n");
  params.set("hash", createHmac("sha256", createHmac("sha256", "WebAppData").update(TOKEN).digest()).update(check).digest("hex"));
  return params.toString();
}
const catalogue = async (userId?: number) => {
  const response = await deals(new NextRequest("http://localhost/api/deals", { headers: userId ? { "x-telegram-init-data": initData(userId) } : {} }));
  return { response, data: await response.json() };
};

test("without Telegram identity the catalogue gives counts only and is never cached publicly", async () => {
  const { response, data } = await catalogue();
  assert.equal(data.locked, true);
  assert.deepEqual(data.deals, []);
  assert.equal(data.counts.byStatus.good, 1);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
});

test("a new user gets the trial on first visit and sees the deals", async () => {
  const status = await (await subscription(new NextRequest("http://localhost/api/subscription", { method: "POST", body: JSON.stringify({ initData: initData(41) }) }))).json();
  assert.equal(status.access.mode, "trial");
  const { data } = await catalogue(41);
  assert.equal(data.locked, false);
  assert.equal(data.deals.length, 1);
});

test("after the trial the catalogue locks until a payment arrives", async () => {
  trials.set("trial:42", String(Date.now() - 4 * 86_400_000));
  assert.equal((await catalogue(42)).data.locked, true);
  await new Promise((resolve) => setTimeout(resolve, 10_050));
  transactions = [{ id: "c1", amount: 10000, date: Math.floor(Date.now() / 1000), source: { type: "user", user: { id: 43 }, invoice_payload: invoicePayload("year", "43") } }];
  trials.set("trial:43", String(Date.now() - 4 * 86_400_000));
  const { data } = await catalogue(43);
  assert.equal(data.locked, false);
  assert.equal(data.access.mode, "subscribed");
});
