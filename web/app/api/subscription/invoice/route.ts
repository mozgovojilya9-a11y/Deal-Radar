import { NextRequest, NextResponse } from "next/server";
import { paywallEnabled, requestInitData, telegramUser } from "@/lib/access";
import { invoicePayload, PLANS, SUBSCRIPTION_PERIOD, type PlanKey } from "@/lib/subscription";
import { botCall } from "@/lib/telegram-bot";
import { rateAllowed } from "@/lib/telegram-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

/** A Telegram Stars invoice link for the chosen plan, opened in the Mini App with WebApp.openInvoice. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { initData?: string; plan?: string };
  if (!paywallEnabled()) return NextResponse.json({ error: "Подписка сейчас не требуется." }, { status: 409, headers: HEADERS });
  const userId = telegramUser(requestInitData(request, body));
  if (!userId) return NextResponse.json({ error: "Откройте Deal Radar в Telegram." }, { status: 401, headers: HEADERS });
  if (body.plan !== "month" && body.plan !== "year") return NextResponse.json({ error: "Неизвестный тариф." }, { status: 400, headers: HEADERS });
  if (!rateAllowed("invoice:" + userId, 6)) return NextResponse.json({ error: "Слишком часто. Попробуйте через минуту." }, { status: 429, headers: HEADERS });
  const plan = PLANS[body.plan as PlanKey];
  try {
    const link = await botCall<string>("createInvoiceLink", {
      title: plan.title, description: plan.description, payload: invoicePayload(plan.key, userId),
      currency: "XTR", prices: [{ label: plan.title, amount: plan.stars }],
      ...(plan.recurring ? { subscription_period: SUBSCRIPTION_PERIOD } : {}),
    });
    return NextResponse.json({ link }, { headers: HEADERS });
  } catch (error) {
    console.error("createInvoiceLink failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Не удалось создать счёт. Попробуйте позже." }, { status: 502, headers: HEADERS });
  }
}
