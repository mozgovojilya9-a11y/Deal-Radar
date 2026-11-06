import { NextRequest, NextResponse } from "next/server";
import { telegramUserId } from "@/lib/telegram-request";
import { supabaseRest } from "@/lib/supabase-rest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function auth(request: Request) {
  if (!process.env.TELEGRAM_TOKEN) return { error: NextResponse.json({ error: "Telegram auth is not configured" }, { status: 503 }) };
  const userId = telegramUserId(request);
  if (!userId) return { error: NextResponse.json({ error: "Откройте Mini App из Telegram" }, { status: 401 }) };
  return { userId };
}

export async function GET(request: NextRequest) {
  const session = auth(request);
  if (session.error) return session.error;
  try {
    const rows = await supabaseRest<Array<{ deal_id: string }>>("favorites", {
      query: new URLSearchParams({ select: "deal_id", telegram_user_id: `eq.${session.userId}`, order: "created_at.desc", limit: "500" })
    });
    const ids = rows.map((row) => row.deal_id);
    if (!ids.length) return NextResponse.json({ ids: [], deals: [] });
    const deals = await supabaseRest<Array<Record<string, unknown>>>("deals", {
      query: new URLSearchParams({
        select: "listing_id,title,description,price,market_price,discount,category_key,category_label,model_group,city,distance_km,listing_url,image_url,warning_flags,posted_at,detected_at,active",
        listing_id: `in.(${ids.filter((id) => /^[A-Za-z0-9_-]{1,64}$/.test(id)).join(",")})`
      })
    });
    return NextResponse.json({ ids, deals });
  } catch (error) {
    console.error("favorites GET", error);
    return NextResponse.json({ error: "Не удалось загрузить избранное" }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const session = auth(request);
  if (session.error) return session.error;
  try {
    const body = await request.json() as { dealId?: unknown };
    const dealId = typeof body.dealId === "string" ? body.dealId : "";
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(dealId)) return NextResponse.json({ error: "Некорректный ID объявления" }, { status: 400 });
    await supabaseRest("favorites", {
      method: "POST",
      query: new URLSearchParams({ on_conflict: "telegram_user_id,deal_id" }),
      body: { telegram_user_id: session.userId, deal_id: dealId },
      prefer: "resolution=ignore-duplicates,return=minimal"
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("favorites POST", error);
    return NextResponse.json({ error: "Не удалось сохранить избранное" }, { status: 502 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = auth(request);
  if (session.error) return session.error;
  const dealId = request.nextUrl.searchParams.get("dealId") ?? "";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(dealId)) return NextResponse.json({ error: "Некорректный ID объявления" }, { status: 400 });
  try {
    await supabaseRest("favorites", {
      method: "DELETE",
      query: new URLSearchParams({ telegram_user_id: `eq.${session.userId}`, deal_id: `eq.${dealId}` }),
      prefer: "return=minimal"
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("favorites DELETE", error);
    return NextResponse.json({ error: "Не удалось удалить из избранного" }, { status: 502 });
  }
}
