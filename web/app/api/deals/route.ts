import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured, readDeals } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "База данных ещё не подключена. Добавьте SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY." },
      { status: 503 }
    );
  }

  const category = request.nextUrl.searchParams.get("category") || undefined;
  const sortParam = request.nextUrl.searchParams.get("sort");
  const sort = sortParam === "newest" || sortParam === "price" ? sortParam : "discount";

  try {
    const deals = await readDeals({ category, sort, limit: 100 });
    return NextResponse.json(
      { deals, count: deals.length, updatedAt: new Date().toISOString() },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "X-Content-Type-Options": "nosniff"
        }
      }
    );
  } catch (error) {
    console.error("GET /api/deals failed:", error);
    return NextResponse.json({ error: "Не удалось загрузить предложения." }, { status: 502 });
  }
}
