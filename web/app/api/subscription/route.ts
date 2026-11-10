import { NextRequest, NextResponse } from "next/server";
import { accessFor, paywallEnabled, requestInitData, telegramUser } from "@/lib/access";
import { PLANS, TRIAL_DAYS } from "@/lib/subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

/** The caller's access. The first call of a new Telegram user starts the free trial. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { initData?: string };
  const plans = Object.values(PLANS).map(({ key, stars, days, recurring, title }) => ({ key, stars, days, recurring, title }));
  if (!paywallEnabled()) return NextResponse.json({ paywall: false, access: { mode: "open" }, plans, trialDays: TRIAL_DAYS }, { headers: HEADERS });
  const userId = telegramUser(requestInitData(request, body));
  if (!userId) return NextResponse.json({ paywall: true, access: { mode: "locked" }, plans, trialDays: TRIAL_DAYS, error: "Откройте Deal Radar в Telegram." }, { status: 401, headers: HEADERS });
  try {
    return NextResponse.json({ paywall: true, access: await accessFor(userId, { startTrial: true }), plans, trialDays: TRIAL_DAYS }, { headers: HEADERS });
  } catch (error) {
    console.error("subscription status failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Не удалось проверить подписку. Попробуйте через минуту." }, { status: 503, headers: HEADERS });
  }
}
