import { NextRequest, NextResponse } from "next/server";
import type { CatalogCounts, Deal, DealFeed } from "@/lib/deals";
import { haversineKm, parseCoordinate } from "@/lib/geo";
import { dealScore } from "@/lib/score";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FEED_URL = process.env.DEALS_FEED_URL
  || "https://raw.githubusercontent.com/mozgovojilya9-a11y/Deal-Radar/deals-data/data/deals.json";
const MAX_FEED_AGE_HOURS = 720;
const REVALIDATE_SECONDS = 60;

function isDeal(value: unknown): value is Deal {
  if (!value || typeof value !== "object") return false;
  const deal = value as Partial<Deal>;
  return typeof deal.listing_id === "string"
    && typeof deal.title === "string"
    && typeof deal.price === "number" && deal.price > 0
    && (deal.market_price === null || typeof deal.market_price === "number")
    && (deal.discount === null || typeof deal.discount === "number")
    && typeof deal.category_key === "string"
    && typeof deal.listing_url === "string"
    && /^https:\/\//i.test(deal.listing_url)
    && typeof deal.detected_at === "string";
}

function listingTimestamp(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  const direct = new Date(value).getTime();
  if (Number.isFinite(direct)) return direct;

  const text = value.trim().toLowerCase().replace(/\.$/, "");
  const now = Date.now();
  const relativeDays: Record<string, number> = {
    vandaag: 0, today: 0, gisteren: 1, yesterday: 1,
    eergisteren: 2, "day before yesterday": 2
  };
  if (Object.prototype.hasOwnProperty.call(relativeDays, text)) {
    return now - relativeDays[text] * 24 * 60 * 60 * 1000;
  }
  const relative = text.match(/^(\d+)\s+(?:dag|dagen)\s+geleden$/)
    || text.match(/^(\d+)\s+days?\s+ago$/);
  if (relative) return now - Number(relative[1]) * 24 * 60 * 60 * 1000;

  const months: Record<string, number> = {
    jan: 1, januari: 1, feb: 2, februari: 2, mrt: 3, maa: 3, maart: 3, mar: 3,
    apr: 4, april: 4, mei: 5, may: 5, jun: 6, juni: 6, jul: 7, juli: 7,
    aug: 8, augustus: 8, sep: 9, sept: 9, september: 9,
    okt: 10, oktober: 10, oct: 10, october: 10, nov: 11, november: 11,
    dec: 12, december: 12
  };
  const match = text.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{2,4})$/);
  if (match && months[match[2]]) {
    const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
    const endOfDay = Date.UTC(year, months[match[2]] - 1, Number(match[1]), 23, 59, 59);
    return Math.min(endOfDay, now);
  }

  const numeric = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (numeric) {
    const year = Number(numeric[3]) < 100 ? 2000 + Number(numeric[3]) : Number(numeric[3]);
    return Math.min(Date.UTC(year, Number(numeric[2]) - 1, Number(numeric[1]), 23, 59, 59), now);
  }
  return Number.NaN;
}

function isRecent(deal: Deal) {
  // Prefer the original Marktplaats date, including Dutch labels such as "18 okt 26" and "Eergisteren".
  const postedAt = listingTimestamp(deal.posted_at);
  const detectedAt = new Date(deal.detected_at).getTime();
  const publishedAt = Number.isFinite(postedAt) ? postedAt : detectedAt;
  return Number.isFinite(publishedAt)
    && Date.now() - publishedAt <= MAX_FEED_AGE_HOURS * 60 * 60 * 1000
    && publishedAt <= Date.now() + 5 * 60 * 1000;
}

type Sort = "profit" | "distance" | "newest" | "price" | "discount" | "score";

function numberParam(params: URLSearchParams, name: string, min: number, max: number): number | null {
  const raw = params.get(name);
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min && value <= max ? value : null;
}

/** Ranking by deal score (0–100), minus a small penalty per kilometre from the user. */
function score(deal: Deal, distanceWeight: number): number {
  return (deal.deal_score ?? 0) - (deal.user_distance_km ?? 0) * distanceWeight;
}

/** Feeds written before the scanner computed scores get the same score here. */
function withScore(deal: Deal): Deal {
  if (typeof deal.deal_score === "number" && deal.score_parts) return deal;
  const published = listingTimestamp(deal.posted_at) || Date.parse(deal.first_detected_at || deal.detected_at);
  const computed = dealScore(deal, Number.isFinite(published) ? Math.max(0, (Date.now() - published) / 3_600_000) : null);
  return { ...deal, deal_score: typeof deal.deal_score === "number" ? deal.deal_score : computed.total, score_parts: deal.score_parts ?? computed.parts };
}

function isNewCondition(deal: Deal): boolean {
  return /^nieuw$/i.test(String(deal.item_condition || "").trim());
}

/** A list row without the heavy fields a card does not show. */
function cardOnly(deal: Deal): Record<string, unknown> {
  const card: Record<string, unknown> = { ...deal };
  for (const field of ["description", "market_sources", "ai_review", "valuation_reason", "evaluated_at", "last_seen_at", "next_check_at", "market_checked_at", "price_history"]) delete card[field];
  return card;
}

/**
 * Catalogue API. All user settings are applied here, on the server:
 * location + radius (haversine on listing coordinates), price range, discount, profit, ROI,
 * categories, condition, exact-model only and sort priority. No hidden price caps.
 */
export async function GET(request: NextRequest) {
  try {
    const minuteBucket = Math.floor(Date.now() / (REVALIDATE_SECONDS * 1000));
    const response = await fetch(`${FEED_URL}${FEED_URL.includes("?") ? "&" : "?"}t=${minuteBucket}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: REVALIDATE_SECONDS }
    });
    if (!response.ok) throw new Error(`GitHub feed returned HTTP ${response.status}`);
    const feed = await response.json() as Partial<DealFeed>;
    const valuationReady = feed.valuationVersion === 2;
    const params = request.nextUrl.searchParams;

    const all = valuationReady && Array.isArray(feed.deals)
      // Reserved ("Gereserveerd"), removed or inactive listings are never offered as available deals.
      // Confirmed profit, plus listings the radar could not price yet. A candidate that has a market
      // value was judged not worth buying and stays hidden, unless the user saved it.
      ? feed.deals.filter(isDeal).filter((deal) => deal.active !== false && deal.reserved !== true && isRecent(deal)
        && (deal.status === "strong" || deal.status === "good" || (deal.status === "candidate" && (deal.market_value == null || deal.needs_confirmation === true || params.has("ids")))))
      : [];

    const lat = parseCoordinate(params.get("lat"), -90, 90);
    const lon = parseCoordinate(params.get("lon"), -180, 180);
    const radiusKm = numberParam(params, "radiusKm", 1, 2000);
    const minPrice = numberParam(params, "minPrice", 0, 1_000_000);
    const maxPrice = numberParam(params, "maxPrice", 0.01, 1_000_000);
    const minDiscount = numberParam(params, "minDiscount", 0, 100);
    const minProfit = numberParam(params, "minProfit", -100_000, 1_000_000);
    const minRoi = numberParam(params, "minRoi", -100, 10_000);
    const maxAgeDays = numberParam(params, "maxAgeDays", 1, 365);
    const textQuery = (params.get("q") || "").trim().toLowerCase().slice(0, 80);
    const categories = new Set((params.get("categories") || params.get("category") || "").split(",").map((key) => key.trim()).filter((key) => /^[a-z0-9-]{1,64}$/i.test(key)));
    const condition = params.get("condition") === "new" || params.get("condition") === "used" ? params.get("condition") : "all";
    const exactOnly = params.get("exactOnly") === "1";
    const priceDropOnly = params.get("priceDrop") === "1";
    const sortParam = params.get("sort") as Sort | null;
    const sort: Sort = sortParam && ["profit", "distance", "newest", "price", "discount", "score"].includes(sortParam) ? sortParam : "profit";
    const hasLocation = lat !== null && lon !== null;
    // Favourites are requested by id and are never hidden by filters.
    const ids = new Set((params.get("ids") || "").split(",").map((id) => id.trim()).filter((id) => /^[a-z0-9_-]{1,40}$/i.test(id)).slice(0, 300));

    let unknownLocation = 0;
    let outsideRadius = 0;
    const deals: Deal[] = [];
    for (const original of all) {
      const deal: Deal = withScore(original);
      if (hasLocation && typeof deal.latitude === "number" && typeof deal.longitude === "number") {
        deal.user_distance_km = Math.round(haversineKm(lat, lon, deal.latitude, deal.longitude) * 10) / 10;
      } else {
        deal.user_distance_km = null;
      }
      if (ids.size) {
        if (ids.has(deal.listing_id)) deals.push(deal);
        continue;
      }
      if (hasLocation && radiusKm !== null) {
        if (deal.user_distance_km == null) { unknownLocation += 1; continue; }
        if (deal.user_distance_km > radiusKm) { outsideRadius += 1; continue; }
      }
      if (minPrice !== null && deal.price < minPrice) continue;
      if (maxPrice !== null && deal.price > maxPrice) continue;
      if (minDiscount !== null && minDiscount > 0 && !(deal.discount != null && deal.discount * 100 >= minDiscount)) continue;
      if (minProfit !== null && !(deal.estimated_profit != null && deal.estimated_profit >= minProfit)) continue;
      if (minRoi !== null && !(deal.profit_roi != null && deal.profit_roi * 100 >= minRoi)) continue;
      if (categories.size && !categories.has(deal.category_key)) continue;
      if (condition === "new" && !isNewCondition(deal)) continue;
      if (condition === "used" && isNewCondition(deal)) continue;
      if (maxAgeDays !== null) {
        const published = listingTimestamp(deal.posted_at) || Date.parse(deal.first_detected_at || deal.detected_at);
        if (Number.isFinite(published) && Date.now() - published > maxAgeDays * 86400000) continue;
      }
      // Brand / model words, e.g. "sony a7" or "airpods pro 2": every word must appear in the title.
      if (textQuery && !textQuery.split(/\s+/).every((word) => (deal.title + " " + deal.category_label).toLowerCase().includes(word))) continue;
      if (priceDropOnly && !deal.price_dropped_at) continue;
      if (exactOnly && (deal.match_level ? deal.match_level !== "exact" : !deal.model_group || deal.model_group === "unknown")) continue;
      deals.push(deal);
    }

    const distanceWeight = params.get("priority") === "distance" ? 0.5 : 0.05;
    const rank = (deal: Deal) => deal.status === "strong" ? 3 : deal.status === "good" ? 2 : 1;
    deals.sort((a, b) => {
      if (sort !== "distance" && sort !== "score") {
        const tier = rank(b) - rank(a);
        if (tier) return tier;
      }
      if (sort === "distance") return (a.user_distance_km ?? Infinity) - (b.user_distance_km ?? Infinity) || rank(b) - rank(a);
      if (sort === "score") return score(b, distanceWeight) - score(a, distanceWeight);
      if (sort === "newest") return Date.parse(b.first_detected_at || b.detected_at) - Date.parse(a.first_detected_at || a.detected_at);
      if (sort === "price") return a.price - b.price;
      if (sort === "discount") return (b.discount ?? -1) - (a.discount ?? -1);
      return (b.estimated_profit ?? -Infinity) - (a.estimated_profit ?? -Infinity);
    });

    const byStatus = { strong: 0, good: 0, candidate: 0 };
    for (const deal of deals) {
      const key = (deal.status || "candidate") as keyof typeof byStatus;
      if (key in byStatus) byStatus[key] += 1;
    }
    const counts: CatalogCounts = { feed: all.length, matched: deals.length, unknownLocation, outsideRadius, byStatus };

    // The list needs no descriptions or source lists; a card loads them by id when opened.
    const compact = params.get("compact") === "1" && !params.has("ids");
    return NextResponse.json({
      deals: compact ? deals.map(cardOnly) : deals,
      count: deals.length,
      catalogCount: all.length,
      counts,
      applied: { lat, lon, radiusKm: hasLocation ? radiusKm : null, minPrice, maxPrice, minDiscount, minProfit, minRoi, categories: [...categories], condition, exactOnly, sort },
      valuationReady,
      updatedAt: valuationReady && typeof feed.updatedAt === "string" ? feed.updatedAt : null,
      scannedAt: valuationReady && typeof feed.scannedAt === "string" ? feed.scannedAt : null,
      scannerStats: valuationReady && feed.scannerStats && typeof feed.scannerStats === "object" ? feed.scannerStats : null
    }, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    console.error("GET /api/deals failed:", error);
    return NextResponse.json(
      { error: "Не удалось получить каталог. Попробуйте обновить страницу позже." },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
