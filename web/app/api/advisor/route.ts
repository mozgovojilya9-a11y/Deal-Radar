import { NextRequest, NextResponse } from "next/server";
import { parseDealContext, runAdvisor } from "@/lib/advisor";
import { rateAllowed, verifyInitData } from "@/lib/telegram-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ChatMessage = { role: "user" | "model"; text: string };
const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

/**
 * Product advisor. Stateless by design: the client sends only the current product's
 * temporary chat; nothing is stored server-side.
 */
export async function POST(request: NextRequest) {
  const token = process.env.TELEGRAM_TOKEN;
  if (!token) return NextResponse.json({ error: "TELEGRAM_TOKEN не настроен." }, { status: 503, headers: HEADERS });

  let body: { initData?: string; product?: Record<string, unknown>; messages?: ChatMessage[]; sessionId?: string };
  try { body = await request.json() as typeof body; }
  catch { return NextResponse.json({ error: "Некорректный запрос." }, { status: 400, headers: HEADERS }); }

  const userId = verifyInitData(body.initData || "", token);
  if (!userId) return NextResponse.json({ error: "Открой приложение внутри Telegram." }, { status: 401, headers: HEADERS });
  if (!rateAllowed("advisor:" + userId, 10)) return NextResponse.json({ error: "Слишком много вопросов. Попробуй через минуту." }, { status: 429, headers: HEADERS });

  const context = body.product && typeof body.product === "object" ? parseDealContext(body.product) : null;
  if (!context) return NextResponse.json({ error: "Не передан товар для консультации." }, { status: 400, headers: HEADERS });

  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((message): message is ChatMessage => Boolean(message) && (message.role === "user" || message.role === "model") && typeof message.text === "string")
    .slice(-8)
    .map((message) => ({ role: message.role, text: message.text.slice(0, 800) }));
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Напиши вопрос о товаре." }, { status: 400, headers: HEADERS });
  }

  try {
    const report = await runAdvisor(context, messages);
    return NextResponse.json({ report, listingId: context.listingId, sessionId: String(body.sessionId || "").slice(0, 80) }, { headers: HEADERS });
  } catch (error) {
    console.error("Deal Radar advisor failed:", error);
    return NextResponse.json({ error: "Не удалось собрать данные по товару. Попробуй ещё раз." }, { status: 502, headers: HEADERS });
  }
}
