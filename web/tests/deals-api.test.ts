import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET } from "../app/api/deals/route";

const now = new Date().toISOString();
const deal = (id: string, price: number, lat: number, lon: number, extra: Record<string, unknown> = {}) => ({
  listing_id: id, title: "PS5 Slim " + id, description: "", price, market_price: price * 1.5, discount: 0.33, category_key: "ps5", category_label: "PS5",
  listing_url: "https://www.marktplaats.nl/v/" + id, detected_at: now, posted_at: now, active: true, status: "good", estimated_profit: 60, profit_roi: 0.3,
  latitude: lat, longitude: lon, model_group: "slim", ...extra,
});
const feed = { valuationVersion: 2, updatedAt: now, scannedAt: now, deals: [
  deal("ams", 300, 52.37, 4.9), deal("utr", 1200, 52.09, 5.12, { item_condition: "Nieuw" }), deal("gro", 4500, 53.22, 6.57), deal("watch", 200, 52.1, 5.1, { status: "candidate", estimated_profit: null, profit_roi: null }),
  deal("noloc", 200, 0, 0, { latitude: null, longitude: null, category_key: "macbook" }),
] };
globalThis.fetch = (async () => new Response(JSON.stringify(feed), { status: 200 })) as typeof fetch;
const call = async (query: string) => (await GET(new NextRequest("http://localhost/api/deals?" + query))).json();

test("radius really filters by distance from the user", async () => {
  const near = await call("lat=52.37&lon=4.90&radiusKm=10");
  assert.deepEqual(near.deals.map((d: { listing_id: string }) => d.listing_id), ["ams"]);
  assert.equal(near.counts.unknownLocation, 1);
  const wide = await call("lat=52.37&lon=4.90&radiusKm=50");
  assert.deepEqual(wide.deals.map((d: { listing_id: string }) => d.listing_id).sort(), ["ams", "utr"]);
  const country = await call("lat=52.37&lon=4.90");
  assert.equal(country.deals.length, 4); // no hidden distance limit
});

test("no hidden price cap and user price range is applied", async () => {
  assert.ok((await call("")).deals.some((d: { price: number }) => d.price === 4500));
  const ranged = await call("minPrice=250&maxPrice=1500");
  assert.deepEqual(ranged.deals.map((d: { listing_id: string }) => d.listing_id).sort(), ["ams", "utr"]);
});

test("profit, ROI, category, condition and favourites filters", async () => {
  assert.equal((await call("minProfit=50")).deals.length, 4);
  assert.equal((await call("minRoi=40")).deals.length, 0);
  assert.deepEqual((await call("categories=macbook")).deals.map((d: { listing_id: string }) => d.listing_id), ["noloc"]);
  assert.deepEqual((await call("condition=new")).deals.map((d: { listing_id: string }) => d.listing_id), ["utr"]);
  assert.deepEqual((await call("ids=gro&maxPrice=10")).deals.map((d: { listing_id: string }) => d.listing_id), ["gro"]);
});

test("the catalog holds only confirmed profit, a saved listing still opens by id", async () => {
  assert.ok(!(await call("")).deals.some((d: { listing_id: string }) => d.listing_id === "watch"));
  assert.deepEqual((await call("ids=watch")).deals.map((d: { listing_id: string }) => d.listing_id), ["watch"]);
});
