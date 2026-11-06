import { NextRequest, NextResponse } from "next/server";
import { telegramUserId } from "@/lib/telegram-request";
import { supabaseRest } from "@/lib/supabase-rest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!process.env.TELEGRAM_TOKEN) return NextResponse.json({ error: "Telegram auth is not configured" }, { status: 503 });
  if (!telegramUserId(request)) return NextResponse.json({ error: "Откройте Mini App из Telegram" }, { status: 401 });
  const { id } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return NextResponse.json({ error: "Некорректный ID" }, { status: 400 });
  try {
    const rows = await supabaseRest<Array<{ price: number; market_price: number | null; discount: number | null; observed_at: string }>>("deal_price_history", {
      query: new URLSearchParams({ select: "price,market_price,discount,observed_at", listing_id: `eq.${id}`, order: "observed_at.asc", limit: "60" })
    });
    return NextResponse.json({ points: rows });
  } catch (error) {
    console.error("price history GET", error);
    return NextResponse.json({ error: "История цены пока недоступна" }, { status: 502 });
  }
}
