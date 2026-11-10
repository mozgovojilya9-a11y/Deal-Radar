import { test } from "node:test";
import assert from "node:assert/strict";
import type { Deal } from "../lib/deals";
import type { Purchase } from "../lib/purchases";
import { markSold } from "../lib/purchases";
import { categoryStats, marketPoints, purchaseInsights, scoreBands } from "../lib/analytics";

const deal = (id: string, category: string, extra: Partial<Deal> = {}) => ({
  listing_id: id, title: "T " + id, price: 100, market_value: null, status: "candidate", category_key: category, category_label: category.toUpperCase(),
  listing_url: "https://x/" + id, image_url: null, detected_at: "2026-11-01T00:00:00Z", discount: null, ...extra,
}) as Deal;

const FEED = [
  deal("a", "ps5", { status: "strong", market_value: 400, estimated_profit: 120, deal_score: 80, discount: 0.5 }),
  deal("b", "ps5", { status: "good", market_value: 300, estimated_profit: 60, deal_score: 50, discount: 0.3 }),
  deal("c", "ps5", { market_value: 120 }),
  deal("d", "ps5"),
  deal("e", "ipad"),
  deal("f", "ipad"),
];

test("category stats: totals, waiting listings and averages", () => {
  const [ps5, ipad] = categoryStats(FEED);
  assert.equal(ps5.key, "ps5");
  assert.deepEqual([ps5.total, ps5.valued, ps5.profitable, ps5.best, ps5.good], [4, 3, 2, 1, 1]);
  assert.equal(ps5.profit, 180);
  assert.equal(ps5.avgProfit, 90);
  assert.equal(ps5.avgScore, 65);
  assert.equal(ps5.avgDiscount, 0.4);
  assert.equal(ps5.waiting, 1);
  assert.deepEqual([ipad.waiting, ipad.avgProfit], [2, null]);
});

test("market points: only priced listings, deals first", () => {
  const points = marketPoints(FEED);
  assert.deepEqual(points.map((point) => point.listing_id), ["a", "b", "c"]);
  assert.equal(marketPoints(FEED, 1).length, 1);
});

test("score bands count profitable deals only", () => {
  assert.deepEqual(scoreBands(FEED).map((band) => band.count), [0, 0, 1, 0, 1]);
});

test("purchase insights: realised profit, speed and forecast accuracy", () => {
  const rows: Purchase[] = [
    { id: "1", title: "A", url: "", paid: 200, expectedProfit: 100, boughtAt: "2026-10-01T00:00:00Z", soldFor: 290, soldAt: "2026-10-05T00:00:00Z" },
    { id: "2", title: "B", url: "", paid: 100, expectedProfit: 50, boughtAt: "2026-10-10T00:00:00Z", soldFor: 80, soldAt: "2026-11-12T00:00:00Z" },
    { id: "3", title: "C", url: "", paid: 300, expectedProfit: 70, boughtAt: "2026-11-01T00:00:00Z", soldFor: null },
  ];
  const insights = purchaseInsights(rows);
  assert.deepEqual([insights.bought, insights.sold, insights.invested, insights.inStock], [3, 2, 600, 300]);
  assert.equal(insights.realizedProfit, 70);
  assert.equal(insights.realizedRoi, 0.233);
  assert.equal(insights.expectedOpen, 70);
  assert.equal(insights.avgDaysToSell, 18.5);
  assert.equal(insights.forecastAccuracy, 0.47);
  assert.deepEqual(insights.months, [{ month: "2026-10", profit: 90, sold: 1 }, { month: "2026-11", profit: -20, sold: 1 }]);
  assert.equal(insights.best?.id, "1");
  assert.equal(insights.worst?.id, "2");
});

test("an empty purchase log has no invented numbers", () => {
  const insights = purchaseInsights([]);
  assert.deepEqual([insights.realizedRoi, insights.avgDaysToSell, insights.forecastAccuracy, insights.best], [null, null, null, null]);
});

test("marking a purchase sold records the sale date; undoing clears it", () => {
  const rows: Purchase[] = [{ id: "1", title: "A", url: "", paid: 10, expectedProfit: null, boughtAt: "2026-10-01T00:00:00Z", soldFor: null }];
  const sold = markSold(rows, "1", 20, new Date("2026-10-03T00:00:00Z"));
  assert.equal(sold[0].soldAt, "2026-10-03T00:00:00.000Z");
  assert.equal(markSold(sold, "1", null)[0].soldAt, null);
});
