/**
 * Analytics computed from real data only: the published scanner feed and the user's own purchase log.
 * Nothing is estimated here; a value without data is null.
 */
import type { Deal, RunDay, RunRecord } from "./deals";
import type { Purchase } from "./purchases";

const round2 = (value: number) => Math.round(value * 100) / 100;
const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const isProfitable = (deal: Deal) => deal.status === "strong" || deal.status === "good";

export type CategoryStat = {
  key: string; label: string;
  /** Listings in the feed for this category. */
  total: number;
  /** Listings with an independent market value. */
  valued: number;
  profitable: number; best: number; good: number;
  profit: number; avgProfit: number | null; avgScore: number | null; avgDiscount: number | null;
  /** Listings still without an independent market value (the scanner drops listings priced as unprofitable). */
  waiting: number;
};

export function categoryStats(deals: Deal[]): CategoryStat[] {
  const groups = new Map<string, Deal[]>();
  for (const deal of deals) groups.set(deal.category_key, [...(groups.get(deal.category_key) || []), deal]);
  return [...groups.entries()].map(([key, rows]) => {
    const valued = rows.filter((deal) => deal.market_value != null);
    const profitable = rows.filter(isProfitable);
    const profits = profitable.map((deal) => Number(deal.estimated_profit)).filter(Number.isFinite);
    const scores = profitable.map((deal) => Number(deal.deal_score)).filter(Number.isFinite);
    const discounts = profitable.map((deal) => Number(deal.discount)).filter(Number.isFinite);
    const avgProfit = mean(profits), avgScore = mean(scores), avgDiscount = mean(discounts);
    return {
      key, label: rows[0].category_label || key, total: rows.length, valued: valued.length,
      profitable: profitable.length, best: profitable.filter((deal) => deal.status === "strong").length, good: profitable.filter((deal) => deal.status === "good").length,
      profit: round2(profits.reduce((a, b) => a + b, 0)),
      avgProfit: avgProfit === null ? null : round2(avgProfit),
      avgScore: avgScore === null ? null : Math.round(avgScore),
      avgDiscount: avgDiscount === null ? null : Math.round(avgDiscount * 1000) / 1000,
      waiting: rows.filter((deal) => deal.market_value == null && !isProfitable(deal)).length,
    };
  }).sort((a, b) => b.profit - a.profit || b.profitable - a.profitable || b.total - a.total);
}

export type MarketPoint = Pick<Deal, "listing_id" | "title" | "price" | "market_value" | "status" | "category_key" | "category_label"
  | "estimated_profit" | "deal_score" | "listing_url" | "image_url" | "detected_at" | "discount">;

/** Listings that have both an asking price and an independent market value, for the price-vs-market chart. */
export function marketPoints(deals: Deal[], limit = 400): MarketPoint[] {
  return deals
    .filter((deal) => deal.market_value != null && deal.market_value > 0 && deal.price > 0)
    .sort((a, b) => Number(isProfitable(b)) - Number(isProfitable(a)) || (b.deal_score ?? 0) - (a.deal_score ?? 0))
    .slice(0, limit)
    .map((deal) => ({
      listing_id: deal.listing_id, title: deal.title, price: deal.price, market_value: deal.market_value, status: deal.status,
      category_key: deal.category_key, category_label: deal.category_label, estimated_profit: deal.estimated_profit ?? null,
      deal_score: deal.deal_score, listing_url: deal.listing_url, image_url: deal.image_url, detected_at: deal.detected_at, discount: deal.discount,
    }));
}

/** Profitable deals per score band (0–19, 20–39, …, 80–100). */
export function scoreBands(deals: Deal[]): Array<{ band: string; count: number }> {
  const bands = [0, 20, 40, 60, 80];
  const counts = bands.map(() => 0);
  for (const deal of deals.filter(isProfitable)) {
    if (deal.deal_score == null) continue;
    counts[Math.min(4, Math.floor(Math.max(0, deal.deal_score) / 20))] += 1;
  }
  return bands.map((start, index) => ({ band: start + "–" + (index === 4 ? 100 : start + 19), count: counts[index] }));
}

export type PurchaseInsights = {
  bought: number; sold: number; invested: number; inStock: number;
  realizedProfit: number; realizedRoi: number | null;
  expectedOpen: number;
  /** Average days from purchase to sale, for sold items that have a sale date. */
  avgDaysToSell: number | null;
  /** Realised profit as a share of the radar's forecast, for sold items that had one (1 = as forecast). */
  forecastAccuracy: number | null;
  months: Array<{ month: string; profit: number; sold: number }>;
  best: Purchase | null; worst: Purchase | null;
};

export function purchaseInsights(rows: Purchase[]): PurchaseInsights {
  const sold = rows.filter((row) => row.soldFor !== null);
  const open = rows.filter((row) => row.soldFor === null);
  const profit = (row: Purchase) => (row.soldFor as number) - row.paid;
  const soldPaid = sold.reduce((sum, row) => sum + row.paid, 0);
  const realized = sold.reduce((sum, row) => sum + profit(row), 0);
  const days = sold.filter((row) => row.soldAt).map((row) => (Date.parse(row.soldAt as string) - Date.parse(row.boughtAt)) / 86_400_000).filter((value) => Number.isFinite(value) && value >= 0);
  const forecast = sold.filter((row) => row.expectedProfit != null && row.expectedProfit > 0);
  const expectedSum = forecast.reduce((sum, row) => sum + (row.expectedProfit as number), 0);
  const months = new Map<string, { profit: number; sold: number }>();
  for (const row of sold) {
    const month = (row.soldAt || row.boughtAt).slice(0, 7);
    const entry = months.get(month) || { profit: 0, sold: 0 };
    entry.profit += profit(row); entry.sold += 1;
    months.set(month, entry);
  }
  const ranked = [...sold].sort((a, b) => profit(b) - profit(a));
  const avgDays = mean(days);
  return {
    bought: rows.length, sold: sold.length,
    invested: round2(rows.reduce((sum, row) => sum + row.paid, 0)),
    inStock: round2(open.reduce((sum, row) => sum + row.paid, 0)),
    realizedProfit: round2(realized),
    realizedRoi: soldPaid > 0 ? Math.round((realized / soldPaid) * 1000) / 1000 : null,
    expectedOpen: round2(open.reduce((sum, row) => sum + (row.expectedProfit ?? 0), 0)),
    avgDaysToSell: avgDays === null ? null : Math.round(avgDays * 10) / 10,
    forecastAccuracy: expectedSum > 0 ? Math.round((forecast.reduce((sum, row) => sum + profit(row), 0) / expectedSum) * 100) / 100 : null,
    months: [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, entry]) => ({ month, profit: round2(entry.profit), sold: entry.sold })),
    best: ranked[0] ?? null,
    worst: ranked.length > 1 ? ranked[ranked.length - 1] : null,
  };
}

export type PeriodKey = "day" | "week" | "month" | "all";
const PERIOD_DAYS: Record<PeriodKey, number | null> = { day: 1, week: 7, month: 30, all: null };

export type PeriodSummary = {
  period: PeriodKey;
  /** Start of the requested period (ISO), null for "all". */
  from: string | null;
  /** Oldest data the scanner still has; later than `from` when history is shorter than the period. */
  historyStart: string | null;
  /** False when the scanner's history does not reach back to the start of the period. */
  complete: boolean;
  runs: number; received: number; newListings: number; newDeals: number; errors: number;
  avgDurationSeconds: number | null;
  /** Hourly points for a day, daily points otherwise. */
  series: Array<{ at: string; newDeals: number; newListings: number; best: number; good: number; catalogProfit: number }>;
};

/**
 * Scanner activity over a period. A day uses the detailed run list (hourly points); longer periods use
 * the daily totals, which go back 90 days. Older feeds without daily totals fall back to the run list.
 */
export function periodSummary(runs: RunRecord[], daily: RunDay[], period: PeriodKey, now = Date.now()): PeriodSummary {
  const days = PERIOD_DAYS[period];
  const since = days === null ? -Infinity : now - days * 86_400_000;
  const useRuns = period === "day" || !daily.length;
  type Bucket = PeriodSummary["series"][number] & { runs: number; received: number; errors: number; duration: number };
  const buckets = new Map<string, Bucket>();
  const add = (key: string, row: { runs: number; received: number; newListings: number; newDeals: number; errors: number; duration: number; best: number; good: number; catalogProfit: number }) => {
    const bucket = buckets.get(key) || { at: key, runs: 0, received: 0, newListings: 0, newDeals: 0, errors: 0, duration: 0, best: 0, good: 0, catalogProfit: 0 };
    bucket.runs += row.runs; bucket.received += row.received; bucket.newListings += row.newListings; bucket.newDeals += row.newDeals;
    bucket.errors += row.errors; bucket.duration += row.duration;
    // Catalogue state of the bucket: its latest run.
    bucket.best = row.best; bucket.good = row.good; bucket.catalogProfit = row.catalogProfit;
    buckets.set(key, bucket);
  };
  let historyStart: string | null = null;
  if (useRuns) {
    const sorted = [...runs].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    historyStart = sorted[0]?.startedAt ?? null;
    for (const run of sorted) {
      const at = Date.parse(run.startedAt);
      if (!(at >= since)) continue;
      const key = period === "day" ? new Date(Math.floor(at / 3_600_000) * 3_600_000).toISOString() : run.startedAt.slice(0, 10);
      add(key, { runs: 1, received: run.received || 0, newListings: run.newListings || 0, newDeals: run.newDeals || 0, errors: run.errors || 0,
        duration: run.durationSeconds || 0, best: run.best || 0, good: run.good || 0, catalogProfit: run.catalogProfit || 0 });
    }
  } else {
    const sorted = [...daily].sort((a, b) => a.day.localeCompare(b.day));
    historyStart = sorted[0] ? sorted[0].day + "T00:00:00.000Z" : null;
    // A day counts when any part of it falls inside the period.
    for (const day of sorted) {
      if (!(Date.parse(day.day + "T00:00:00Z") + 86_400_000 > since)) continue;
      add(day.day, { runs: day.runs, received: day.received, newListings: day.newListings, newDeals: day.newDeals, errors: day.errors,
        duration: day.durationSeconds * day.runs, best: day.best, good: day.good, catalogProfit: day.catalogProfit });
    }
  }
  const series = [...buckets.values()];
  const total = (key: "runs" | "received" | "newListings" | "newDeals" | "errors") => series.reduce((sum, bucket) => sum + bucket[key], 0);
  const runCount = total("runs");
  return {
    period,
    from: days === null ? null : new Date(since).toISOString(),
    historyStart,
    complete: days === null || (historyStart !== null && Date.parse(historyStart) <= since + 3_600_000),
    runs: runCount, received: total("received"), newListings: total("newListings"), newDeals: total("newDeals"), errors: total("errors"),
    avgDurationSeconds: runCount ? Math.round(series.reduce((sum, bucket) => sum + bucket.duration, 0) / runCount) : null,
    series: series.map(({ at, newDeals, newListings, best, good, catalogProfit }) => ({ at, newDeals, newListings, best, good, catalogProfit })),
  };
}
