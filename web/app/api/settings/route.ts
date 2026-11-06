import { NextRequest, NextResponse } from "next/server";
import { telegramUserId } from "@/lib/telegram-request";
import { supabaseRest } from "@/lib/supabase-rest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const DEFAULT = { categories: [] as string[], minDiscount: 0, maxDistanceKm: null as number | null };
const ALLOWED_CATEGORIES = new Set([
  "iphone-16","iphone-15","iphone-14","iphone-13","iphone-12","ps5","ps4","airpods-pro","airpods-max","airpods","rayban",
  "watch-diesel","watch-boss","watch-tommy","watch-casio","watch-tissot","bag-fjallraven","bag-northface","bag-osprey","bag-deuter","bag-eastpak"
]);

function session(request: Request) {
  if (!process.env.TELEGRAM_TOKEN) return { error: NextResponse.json({ error: "Telegram auth is not configured" }, { status: 503 }) };
  const userId = telegramUserId(request);
  if (!userId) return { error: NextResponse.json({ error: "Откройте Mini App из Telegram" }, { status: 401 }) };
  return { userId };
}

export async function GET(request: NextRequest) {
  const s = session(request);
  if (s.error) return s.error;
  try {
    const rows = await supabaseRest<Array<{ categories: string[]; min_discount: number; max_distance_km: number | null }>>("user_settings", {
      query: new URLSearchParams({ select: "categories,min_discount,max_distance_km", telegram_user_id: `eq.${s.userId}`, limit: "1" })
    });
    const row = rows[0];
    return NextResponse.json({ settings: row ? { categories: row.categories ?? [], minDiscount: row.min_discount, maxDistanceKm: row.max_distance_km } : DEFAULT });
  } catch (error) {
    console.error("settings GET", error);
    return NextResponse.json({ error: "Не удалось загрузить настройки" }, { status: 502 });
  }
}

export async function PUT(request: NextRequest) {
  const s = session(request);
  if (s.error) return s.error;
  try {
    const body = await request.json() as { categories?: unknown; minDiscount?: unknown; maxDistanceKm?: unknown };
    if (!Array.isArray(body.categories) || body.categories.length > 21) return NextResponse.json({ error: "Некорректные категории" }, { status: 400 });
    const categories = [...new Set(body.categories.filter((x): x is string => typeof x === "string" && ALLOWED_CATEGORIES.has(x)))];
    const minDiscount = body.minDiscount;
    const maxDistanceKm = body.maxDistanceKm;
    if (typeof minDiscount !== "number" || !Number.isInteger(minDiscount) || minDiscount < 0 || minDiscount > 90) return NextResponse.json({ error: "Скидка должна быть от 0 до 90%" }, { status: 400 });
    if (maxDistanceKm !== null && (typeof maxDistanceKm !== "number" || !Number.isInteger(maxDistanceKm) || maxDistanceKm < 1 || maxDistanceKm > 500)) return NextResponse.json({ error: "Радиус должен быть от 1 до 500 км" }, { status: 400 });
    const rows = await supabaseRest<Array<{ categories: string[]; min_discount: number; max_distance_km: number | null }>>("user_settings", {
      method: "POST",
      query: new URLSearchParams({ on_conflict: "telegram_user_id", select: "categories,min_discount,max_distance_km" }),
      body: { telegram_user_id: s.userId, categories, min_discount: minDiscount, max_distance_km: maxDistanceKm, updated_at: new Date().toISOString() },
      prefer: "resolution=merge-duplicates,return=representation"
    });
    const row = rows[0];
    return NextResponse.json({ settings: { categories: row.categories ?? [], minDiscount: row.min_discount, maxDistanceKm: row.max_distance_km } });
  } catch (error) {
    console.error("settings PUT", error);
    return NextResponse.json({ error: "Не удалось сохранить настройки" }, { status: 502 });
  }
}
