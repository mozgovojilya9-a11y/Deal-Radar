import { NextRequest, NextResponse } from "next/server";
import { rateAllowed, verifyInitData } from "@/lib/telegram-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: Record<string, string> = {
  wrong_model: "Не та модель в оценке",
  wrong_price: "Неверная рыночная цена",
  sold: "Продано или зарезервировано",
  fake: "Подделка или мошенничество",
  other: "Другое",
};
const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const LISTING_URL = /^https:\/\/(?:www\.)?marktplaats\.nl\/[^\s"<>]{1,400}$/;

/** "Wrong valuation" report from a listing: goes to the owner's Telegram (or back to the reporter). */
export async function POST(request: NextRequest) {
  const token = process.env.TELEGRAM_TOKEN?.trim();
  if (!token) return NextResponse.json({ error: "TELEGRAM_TOKEN не настроен." }, { status: 503 });
  let body: { initData?: string; title?: string; url?: string; price?: number; marketValue?: number | null; kind?: string };
  try { body = await request.json() as typeof body; }
  catch { return NextResponse.json({ error: "Некорректный JSON." }, { status: 400 }); }
  const userId = verifyInitData(body.initData || "", token);
  if (!userId) return NextResponse.json({ error: "Сообщить об ошибке можно внутри Telegram." }, { status: 401 });
  if (!rateAllowed("feedback:" + userId, 10)) return NextResponse.json({ error: "Слишком много сообщений, попробуйте через минуту." }, { status: 429 });
  const kind = KINDS[String(body.kind || "")];
  const title = String(body.title || "").trim().slice(0, 200);
  const url = String(body.url || "");
  if (!kind || !title || !LISTING_URL.test(url)) return NextResponse.json({ error: "Некорректные данные." }, { status: 400 });
  const price = Number.isFinite(Number(body.price)) ? "€" + Number(body.price) : "—";
  const market = body.marketValue != null && Number.isFinite(Number(body.marketValue)) ? "€" + Number(body.marketValue) : "—";
  const text = ["<b>Deal Radar — ошибка в оценке</b>", escapeHtml(kind), "", escapeHtml(title), `Цена: ${price} · рынок: ${market}`, escapeHtml(url)].join("\n");
  const chatId = process.env.CONTACT_TELEGRAM_CHAT_ID?.trim() || userId;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) { console.error("feedback: telegram status", response.status); return NextResponse.json({ error: "Telegram не принял сообщение." }, { status: 502 }); }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("feedback: telegram error", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Telegram недоступен." }, { status: 502 });
  }
}
