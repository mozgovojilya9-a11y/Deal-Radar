import { NextRequest, NextResponse } from "next/server";
import type { Deal, DealFeed } from "@/lib/deals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FEED_URL = process.env.DEALS_FEED_URL
  || "https://raw.githubusercontent.com/mozgovojilya9-a11y/Deal-Radar/deals-data/data/deals.json";
const MAX_FEED_AGE_HOURS = 168;
const MAX_DEALS = 200;
const REVALIDATE_SECONDS = 60;

function isDeal(value: unknown): value is Deal {
  if (!value || typeof value !== "object") return false;
  const deal = value as Partial<Deal>;
  return typeof deal.listing_id === "string"
    && typeof deal.title === "string"
    && typeof deal.price === "number"
    && typeof deal.market_price === "number"
    && typeof deal.discount === "number"
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

export async function GET(request: NextRequest) {
  try {
    const minuteBucket = Math.floor(Date.now() / (REVALIDATE_SECONDS * 1000));
    const response = await fetch(`${FEED_URL}${FEED_URL.includes("?") ? "&" : "?"}t=${minuteBucket}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: REVALIDATE_SECONDS }
    });

    if (!response.ok) throw new Error(`GitHub feed returned HTTP ${response.status}`);
    const feed = await response.json() as Partial<DealFeed>;
    const category = request.nextUrl.searchParams.get("category") || "";
    const sortParam = request.nextUrl.searchParams.get("sort");
    const sort = sortParam === "newest" || sortParam === "price" ? sortParam : "discount";

    let deals = Array.isArray(feed.deals) ? feed.deals.filter(isDeal).filter((deal) => deal.active !== false && isRecent(deal)) : [];
    if (category && /^[a-z0-9-]{1,64}$/i.test(category)) deals = deals.filter((deal) => deal.category_key === category);

    deals.sort((a, b) => {
      if (sort === "newest") return Date.parse(b.detected_at) - Date.parse(a.detected_at);
      if (sort === "price") return a.price - b.price;
      return b.discount - a.discount;
    });
    deals = deals.slice(0, MAX_DEALS);

    return NextResponse.json({
      deals,
      count: deals.length,
      updatedAt: typeof feed.updatedAt === "string" ? feed.updatedAt : null,
      scannedAt: typeof feed.scannedAt === "string" ? feed.scannedAt : null
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
