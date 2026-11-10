import "server-only";
import type { Deal, ScannerStats } from "@/lib/deals";

import { fetchFeed } from "@/lib/feed-source";
import { paywallEnabled } from "@/lib/access";

/** Showcase deals on the public website are at least this old when the paywall is on. */
const PUBLIC_DELAY_MS = 48 * 60 * 60 * 1000;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** The subset of a deal the public website needs. Keeps page payloads small. */
export type ShowcaseDeal = {
  id: string;
  title: string;
  price: number;
  marketValue: number | null;
  discount: number | null;
  profit: number | null;
  /** Conservative resale price the scanner used for the profit estimate. */
  expectedResale: number | null;
  roi: number | null;
  status: "strong" | "good" | "candidate";
  confidence: "high" | "preliminary" | "retail_proxy" | "none";
  sources: number;
  categoryKey: string;
  city: string | null;
  condition: string | null;
  image: string | null;
  url: string;
  newPrice: number | null;
  usedPrice: number | null;
  refurbishedPrice: number | null;
  detectedAt: string;
};

export type SiteFeed = {
  ok: boolean;
  updatedAt: string | null;
  scannedAt: string | null;
  stats: ScannerStats | null;
  total: number;
  byStatus: { strong: number; good: number; candidate: number };
  byCategory: Record<string, number>;
  /** Evaluated deals (good/strong first, then priced candidates), best profit first. */
  deals: ShowcaseDeal[];
};

export const EMPTY_FEED: SiteFeed = {
  ok: false, updatedAt: null, scannedAt: null, stats: null, total: 0,
  byStatus: { strong: 0, good: 0, candidate: 0 }, byCategory: {}, deals: [],
};

function valid(deal: unknown): deal is Deal {
  if (!deal || typeof deal !== "object") return false;
  const d = deal as Partial<Deal>;
  return typeof d.listing_id === "string" && typeof d.title === "string"
    && typeof d.price === "number" && d.price > 0
    && typeof d.category_key === "string"
    && typeof d.listing_url === "string" && /^https:\/\/(?:www\.)?marktplaats\.nl\//i.test(d.listing_url)
    && typeof d.detected_at === "string";
}

function recent(deal: Deal): boolean {
  const seen = Date.parse(deal.first_detected_at || deal.detected_at);
  return Number.isFinite(seen) && Date.now() - seen <= MAX_AGE_MS;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function marketValueOf(deal: Deal): number | null {
  // Mirrors the app card: only independent valuations count as market value.
  const independent = num(deal.market_value);
  if (independent !== null) return independent;
  return deal.price_reference_type === "external_used" || deal.price_reference_type === "new_retail" ? num(deal.market_price) : null;
}

function slim(deal: Deal): ShowcaseDeal {
  const status = deal.status === "strong" || deal.status === "good" ? deal.status : "candidate";
  const image = typeof deal.image_url === "string" && /^https:\/\//i.test(deal.image_url) ? deal.image_url : null;
  return {
    id: deal.listing_id,
    title: deal.title.slice(0, 140),
    price: deal.price,
    marketValue: marketValueOf(deal),
    discount: num(deal.discount),
    profit: num(deal.estimated_profit),
    expectedResale: num(deal.expected_resale_price),
    roi: num(deal.profit_roi),
    status,
    confidence: deal.market_confidence || "none",
    sources: num(deal.external_sources) ?? 0,
    categoryKey: deal.category_key,
    city: deal.city || null,
    condition: deal.item_condition || null,
    image,
    url: deal.listing_url,
    newPrice: num(deal.new_price),
    usedPrice: num(deal.used_price),
    refurbishedPrice: num(deal.refurbished_price),
    detectedAt: deal.first_detected_at || deal.detected_at,
  };
}

const RANK = { strong: 3, good: 2, candidate: 1 } as const;

// The raw feed is ~5 MB, above Next's 2 MB data-cache limit, so keep one parsed copy per server
// instance for a minute: rendering several pages in a row then costs a single download.
let memo: { at: number; limit: number; value: Promise<SiteFeed> } | null = null;
const MEMO_MS = 60_000;

export function getSiteFeed(limit = 48): Promise<SiteFeed> {
  if (memo && memo.limit === limit && Date.now() - memo.at < MEMO_MS) return memo.value;
  const value = loadSiteFeed(limit);
  memo = { at: Date.now(), limit, value };
  // A failed load must not stick for the whole minute.
  void value.then((feed) => { if (!feed.ok && memo?.value === value) memo = null; });
  return value;
}

async function loadSiteFeed(limit: number): Promise<SiteFeed> {
  try {
    // The page is regenerated every 5 minutes (ISR), so the download happens once per render.
    const feed = await fetchFeed({ next: { revalidate: 300 } });
    if (feed.valuationVersion !== 2 || !Array.isArray(feed.deals)) return EMPTY_FEED;
    const showcaseDelay = paywallEnabled() ? PUBLIC_DELAY_MS : 0;

    // Same availability rules as /api/deals: never show reserved or inactive listings.
    const active = feed.deals.filter(valid).filter((deal) => deal.active !== false && deal.reserved !== true && recent(deal)
      && (deal.status === "strong" || deal.status === "good" || deal.status === "candidate"));

    const byStatus = { strong: 0, good: 0, candidate: 0 };
    const byCategory: Record<string, number> = {};
    for (const deal of active) {
      byStatus[(deal.status || "candidate") as keyof typeof byStatus] += 1;
      byCategory[deal.category_key] = (byCategory[deal.category_key] || 0) + 1;
    }

    const evaluated = active
      .map(slim)
      .filter((deal) => deal.profit !== null && deal.profit > 0 && deal.marketValue !== null && deal.discount !== null && deal.discount > 0)
      // Paid catalogue: the public website shows only deals found at least 48 hours ago.
      .filter((deal) => !showcaseDelay || Date.now() - Date.parse(deal.detectedAt) >= showcaseDelay)
      .sort((a, b) => RANK[b.status] - RANK[a.status] || (b.profit ?? 0) - (a.profit ?? 0));

    // The same listing can be posted twice; keep one card per title + price.
    const seen = new Set<string>();
    const deals: ShowcaseDeal[] = [];
    for (const deal of evaluated) {
      const key = deal.title.toLowerCase().replace(/\W+/g, " ").trim() + "|" + Math.round(deal.price);
      if (seen.has(key)) continue;
      seen.add(key);
      deals.push(deal);
      if (deals.length >= limit) break;
    }

    return {
      ok: true,
      updatedAt: typeof feed.updatedAt === "string" ? feed.updatedAt : null,
      scannedAt: typeof feed.scannedAt === "string" ? feed.scannedAt : null,
      stats: feed.scannerStats && typeof feed.scannerStats === "object" ? feed.scannerStats : null,
      total: active.length,
      byStatus,
      byCategory,
      deals,
    };
  } catch (error) {
    console.error("site feed unavailable:", error);
    return EMPTY_FEED;
  }
}
