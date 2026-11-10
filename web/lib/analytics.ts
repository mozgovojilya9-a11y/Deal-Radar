/**
 * Analytics computed from real data only: the published scanner feed and the user's own purchase log.
 * Nothing is estimated here; a value without data is null.
 */
import type { Deal } from "./deals";
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
