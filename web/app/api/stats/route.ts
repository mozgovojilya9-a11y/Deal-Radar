import { NextResponse } from "next/server";
import { telegramUserId } from "@/lib/telegram-request";
import { supabaseRest } from "@/lib/supabase-rest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!process.env.TELEGRAM_TOKEN) return NextResponse.json({ error: "Telegram auth is not configured" }, { status: 503 });
  if (!telegramUserId(request)) return NextResponse.json({ error: "Откройте Mini App из Telegram" }, { status: 401 });
  try {
    const rows = await supabaseRest<Array<{ last_run_at: string; last_run_found: number; last_run_new: number; last_run_errors: number }>>("bot_status", {
      query: new URLSearchParams({ select: "last_run_at,last_run_found,last_run_new,last_run_errors", id: "eq.1", limit: "1" })
    });
    const row = rows[0];
    return NextResponse.json({ status: row ?? null });
  } catch (error) {
    console.error("stats GET", error);
    return NextResponse.json({ error: "Статистика пока недоступна" }, { status: 502 });
  }
}
