import { NextRequest, NextResponse } from "next/server";
import { forgetAccess, paywallEnabled, requestInitData, telegramUser } from "@/lib/access";
import { subscriptionFrom } from "@/lib/subscription";
import { botCall, forgetStarTransactions, starTransactions } from "@/lib/telegram-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

/** Stops (or resumes) automatic renewal of the monthly plan; paid days stay available. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { initData?: string; resume?: boolean };
  if (!paywallEnabled()) return NextResponse.json({ error: "Подписка не включена." }, { status: 409, headers: HEADERS });
  const userId = telegramUser(requestInitData(request, body));
  if (!userId) return NextResponse.json({ error: "Откройте Deal Radar в Telegram." }, { status: 401, headers: HEADERS });
  try {
    const subscription = subscriptionFrom(await starTransactions(), userId);
    if (!subscription.chargeId) return NextResponse.json({ error: "Ежемесячной подписки не найдено." }, { status: 404, headers: HEADERS });
    await botCall("editUserStarSubscription", { user_id: Number(userId), telegram_payment_charge_id: subscription.chargeId, is_canceled: body.resume !== true });
    forgetStarTransactions();
    forgetAccess(userId);
    return NextResponse.json({ ok: true, canceled: body.resume !== true, until: subscription.until }, { headers: HEADERS });
  } catch (error) {
    console.error("editUserStarSubscription failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Не удалось изменить подписку. Это можно сделать и в настройках Telegram." }, { status: 502, headers: HEADERS });
  }
}
