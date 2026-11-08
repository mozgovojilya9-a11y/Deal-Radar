import { NextRequest, NextResponse } from "next/server";
import type { Deal, DealFeed } from "@/lib/deals";
import { buildIdentity } from "@/lib/product-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FEED_URL = process.env.DEALS_FEED_URL
  || "https://raw.githubusercontent.com/mozgovojilya9-a11y/Deal-Radar/deals-data/data/deals.json";
const RANGES: Record<string, number | null> = { day: 1, week: 7, month: 30, all: null };

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Analytics computed only from the published scanner feed (real listings, real runs).
 * Nothing is estimated or filled in: missing data is returned as null / empty.
 */
export async function GET(request: NextRequest) {
  const rangeKey = request.nextUrl.searchParams.get("range") || "week";
  const days = rangeKey in RANGES ? RANGES[rangeKey] : 7;
  const since = days === null ? 0 : Date.now() - days * 86400000;
  try {
    const response = await fetch(FEED_URL + (FEED_URL.includes("?") ? "&" : "?") + "t=" + Math.floor(Date.now() / 60000), { next: { revalidate: 60 } });
    if (!response.ok) throw new Error("feed HTTP " + response.status);
    const feed = await response.json() as DealFeed;
    const deals = (Array.isArray(feed.deals) ? feed.deals : [])
      .filter((deal: Deal) => deal && deal.active !== false && deal.reserved !== true && deal.status !== "reserved");
    const profitable = deals.filter((deal) => deal.status === "strong" || deal.status === "good");
    const profits = profitable.map((deal) => Number(deal.estimated_profit)).filter(Number.isFinite);
    const discounts = profitable.map((deal) => Number(deal.discount)).filter(Number.isFinite);

    const byCategory = new Map<string, { label: string; best: number; good: number; watchlist: number; profit: number }>();
    const byBrand = new Map<string, { best: number; good: number; watchlist: number; profit: number }>();
    for (const deal of deals) {
      const tier = deal.status === "strong" ? "best" : deal.status === "good" ? "good" : "watchlist";
      const category = byCategory.get(deal.category_key) || { label: deal.category_label, best: 0, good: 0, watchlist: 0, profit: 0 };
      category[tier] += 1;
      if (tier !== "watchlist") category.profit += Number(deal.estimated_profit) || 0;
      byCategory.set(deal.category_key, category);
      const brand = buildIdentity(deal.title).brand || "другое";
      const brandRow = byBrand.get(brand) || { best: 0, good: 0, watchlist: 0, profit: 0 };
      brandRow[tier] += 1;
      if (tier !== "watchlist") brandRow.profit += Number(deal.estimated_profit) || 0;
      byBrand.set(brand, brandRow);
    }

    // When profitable deals first appeared (first detection date), per day.
    const appearances = new Map<string, { best: number; good: number }>();
    for (const deal of profitable) {
      const at = Date.parse(deal.first_detected_at || deal.detected_at);
      if (!Number.isFinite(at) || at < since) continue;
      const day = new Date(at).toISOString().slice(0, 10);
      const row = appearances.get(day) || { best: 0, good: 0 };
      row[deal.status === "strong" ? "best" : "good"] += 1;
      appearances.set(day, row);
    }

    const runs = (feed.runHistory || []).filter((run) => Date.parse(run.startedAt) >= since);
    const totalDuration = runs.reduce((sum, run) => sum + (run.durationSeconds || 0), 0);
    const totalUnique = runs.reduce((sum, run) => sum + (run.unique || 0), 0);

    return NextResponse.json({
      range: rangeKey,
      scannedAt: feed.scannedAt || null,
      overview: {
        catalog: deals.length,
        best: deals.filter((deal) => deal.status === "strong").length,
        good: deals.filter((deal) => deal.status === "good").length,
        watchlist: deals.filter((deal) => deal.status === "candidate").length,
        rejectedLastRun: feed.scannerStats?.rejectedTotal ?? null,
      },
      finance: {
        totalProfit: profits.length ? round(profits.reduce((a, b) => a + b, 0)) : null,
        averageProfit: profits.length ? round(profits.reduce((a, b) => a + b, 0) / profits.length) : null,
        maxProfit: profits.length ? round(Math.max(...profits)) : null,
        averageDiscount: discounts.length ? round(discounts.reduce((a, b) => a + b, 0) / discounts.length) : null,
        profitableCount: profitable.length,
      },
      byCategory: [...byCategory.entries()].map(([key, row]) => ({ key, ...row, profit: round(row.profit) }))
        .sort((a, b) => (b.best + b.good) - (a.best + a.good) || b.watchlist - a.watchlist),
      byBrand: [...byBrand.entries()].map(([brand, row]) => ({ brand, ...row, profit: round(row.profit) }))
        .sort((a, b) => (b.best + b.good) - (a.best + a.good) || b.watchlist - a.watchlist).slice(0, 15),
      appearances: [...appearances.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, row]) => ({ day, ...row })),
      funnel: feed.funnel || [],
      runs,
      performance: {
        runs: runs.length,
        lastDurationSeconds: feed.scannerStats?.durationSeconds ?? null,
        lastListingsPerMinute: feed.scannerStats?.listingsPerMinute ?? null,
        lastAvgMsPerListing: feed.scannerStats?.avgMsPerListing ?? null,
        averageDurationSeconds: runs.length ? round(totalDuration / runs.length) : null,
        listingsPerMinute: totalDuration ? round(totalUnique / totalDuration * 60) : null,
        errors: runs.reduce((sum, run) => sum + (run.errors || 0), 0),
        retries: runs.reduce((sum, run) => sum + (run.retries || 0), 0),
      },
      priceChanges: feed.priceChanges || [],
      rejected: feed.rejected || [],
    }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } });
  } catch (error) {
    console.error("GET /api/analytics failed:", error);
    return NextResponse.json({ error: "Аналитика временно недоступна." }, { status: 502 });
  }
}
