import { NextRequest, NextResponse } from "next/server";
import type { Deal, DealFeed } from "@/lib/deals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FEED_URL = "https://raw.githubusercontent.com/mozgovojilya9-a11y/Deal-Radar/deals-data/data/deals.json";
const MAX_FEED_AGE_HOURS = 72;

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
    && typeof deal.detected_at === "string";
}

function isRecent(deal: Deal) {
  const detectedAt = new Date(deal.detected_at).getTime();
  return Number.isFinite(detectedAt)
    && Date.now() - detectedAt <= MAX_FEED_AGE_HOURS * 60 * 60 * 1000
    && detectedAt <= Date.now() + 5 * 60 * 1000;
}

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(FEED_URL, {
      headers: { Accept: "application/json" },
      next: { revalidate: 180 }
    });

    if (!response.ok) {
      throw new Error(`GitHub feed returned HTTP ${response.status}`);
    }

    const feed = await response.json() as Partial<DealFeed>;
    const category = request.nextUrl.searchParams.get("category") || "";
    const sortParam = request.nextUrl.searchParams.get("sort");
    const sort = sortParam === "newest" || sortParam === "price" ? sortParam : "discount";

    let deals = Array.isArray(feed.deals) ? feed.deals.filter(isDeal).filter((deal) => deal.active !== false && isRecent(deal)) : [];

    if (category && /^[a-z0-9-]{1,64}$/i.test(category)) {
      deals = deals.filter((deal) => deal.category_key === category);
    }

    deals.sort((a, b) => {
      if (sort === "newest") return Date.parse(b.detected_at) - Date.parse(a.detected_at);
      if (sort === "price") return a.price - b.price;
      return b.discount - a.discount;
    });

    deals = deals.slice(0, 100);

    return NextResponse.json(
      { deals, count: deals.length, updatedAt: typeof feed.updatedAt === "string" ? feed.updatedAt : null },
      {
        headers: {
          "Cache-Control": "public, s-maxage=180, stale-while-revalidate=600",
          "X-Content-Type-Options": "nosniff"
        }
      }
    );
  } catch (error) {
    console.error("GET /api/deals failed:", error);
    return NextResponse.json(
      { error: "Не удалось получить каталог. Попробуйте обновить страницу позже." },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
