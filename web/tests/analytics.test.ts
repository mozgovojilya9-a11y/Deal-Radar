import { test } from "node:test";
import assert from "node:assert/strict";
import type { Deal } from "../lib/deals";
import type { Purchase } from "../lib/purchases";
import { markSold } from "../lib/purchases";
import { categoryStats, marketPoints, periodSummary, purchaseInsights, scoreBands } from "../lib/analytics";

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

const NOW = Date.parse("2026-11-20T12:00:00Z");
const run = (startedAt: string, extra: Record<string, number> = {}) => ({ startedAt, finishedAt: null, durationSeconds: 200, fetchSeconds: null, received: 100, unique: 90,
  evaluated: 0, valued: 0, best: 1, good: 2, watchlist: 0, rejected: 0, newListings: 5, newDeals: 1, errors: 0, retries: 0, externalResearched: 0,
  reservedRemoved: 0, catalogSize: 10, catalogProfit: 300, ...extra });
const day = (date: string, extra: Record<string, number> = {}) => ({ day: date, runs: 100, received: 10000, unique: 9000, newListings: 50, newDeals: 3,
  errors: 4, durationSeconds: 210, best: 1, good: 2, catalogSize: 10, catalogProfit: 300, ...extra });

test("periods differ: day uses recent runs, week and month use daily totals", () => {
  const runs = [run("2026-11-19T08:00:00Z"), run("2026-11-20T09:10:00Z"), run("2026-11-20T09:40:00Z", { newDeals: 2, catalogProfit: 500 })];
  const daily = [day("2026-10-01"), day("2026-11-01"), day("2026-11-15"), day("2026-11-20", { newDeals: 7 })];
  const dayView = periodSummary(runs, daily, "day", NOW);
  assert.deepEqual([dayView.runs, dayView.newDeals, dayView.series.length], [2, 3, 1]);
  assert.equal(dayView.series[0].catalogProfit, 500);
  const week = periodSummary(runs, daily, "week", NOW);
  assert.deepEqual([week.runs, week.newDeals, week.series.length], [200, 10, 2]);
  const month = periodSummary(runs, daily, "month", NOW);
  assert.deepEqual([month.runs, month.series.length], [300, 3]);
  assert.equal(periodSummary(runs, daily, "all", NOW).runs, 400);
  assert.equal(month.complete, true);
});

test("a period longer than the history is reported as incomplete", () => {
  const daily = [day("2026-11-18"), day("2026-11-19"), day("2026-11-20")];
  const month = periodSummary([], daily, "month", NOW);
  assert.equal(month.complete, false);
  assert.equal(month.historyStart, "2026-11-18T00:00:00.000Z");
  assert.equal(periodSummary([], daily, "all", NOW).complete, true);
});

test("old feeds without daily totals fall back to the run list", () => {
  const runs = [run("2026-11-18T08:00:00Z"), run("2026-11-19T08:00:00Z"), run("2026-11-19T09:00:00Z")];
  const week = periodSummary(runs, [], "week", NOW);
  assert.deepEqual([week.runs, week.series.length, week.avgDurationSeconds], [3, 2, 200]);
});
