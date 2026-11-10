import { NextResponse, type NextRequest } from "next/server";
import { kvConfigured, kvGet, kvSetOnce } from "./kv";
import { accessFrom, hasFullAccess, subscriptionFrom, type Access } from "./subscription";
import { starTransactions } from "./telegram-bot";
import { verifyInitData } from "./telegram-auth";

/**
 * The paywall is on only when explicitly enabled and fully configured (bot token for payments,
 * Upstash for trial dates). Until then the app stays open exactly as before.
 */
export function paywallEnabled(): boolean {
  return process.env.PAYWALL_ENABLED === "1" && Boolean(process.env.TELEGRAM_TOKEN) && kvConfigured();
}

export function requestInitData(request: NextRequest, body?: { initData?: unknown }): string {
  return (typeof body?.initData === "string" ? body.initData : "") || request.headers.get("x-telegram-init-data") || "";
}

export function telegramUser(initData: string): string | null {
  const token = process.env.TELEGRAM_TOKEN;
  return token ? verifyInitData(initData, token) : null;
}

const memo = new Map<string, { at: number; access: Access }>();

/** Access of one Telegram user. `startTrial` begins the 3-day trial on the first visit. */
export async function accessFor(userId: string, { startTrial = false } = {}): Promise<Access> {
  if (!paywallEnabled()) return accessFrom({ paywall: false, subscription: null, trialStartedAt: null });
  const cached = memo.get(userId);
  if (cached && Date.now() - cached.at < 30_000 && (!startTrial || cached.access.trialEndsAt)) return cached.access;
  const key = "trial:" + userId;
  const trialRaw = startTrial ? await kvSetOnce(key, String(Date.now())) : await kvGet(key);
  const trialStartedAt = trialRaw && Number.isFinite(Number(trialRaw)) ? Number(trialRaw) : null;
  let access = accessFrom({ paywall: true, subscription: subscriptionFrom(await starTransactions(), userId), trialStartedAt });
  // A payment may have reached another server instance: before locking, check Telegram again.
  if (!hasFullAccess(access)) access = accessFrom({ paywall: true, subscription: subscriptionFrom(await starTransactions({ fresh: true }), userId), trialStartedAt });
  memo.set(userId, { at: Date.now(), access });
  if (memo.size > 5000) memo.delete(memo.keys().next().value as string);
  return access;
}

export function forgetAccess(userId: string): void {
  memo.delete(userId);
}

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

/**
 * Guard for paid API routes: null when the request may proceed, otherwise the response to return
 * (401 outside Telegram, 402 without a subscription or trial, 503 when the check itself failed).
 */
export async function requireAccess(request: NextRequest, body?: { initData?: unknown }): Promise<NextResponse | null> {
  if (!paywallEnabled()) return null;
  const userId = telegramUser(requestInitData(request, body));
  if (!userId) return NextResponse.json({ error: "Откройте Deal Radar в Telegram.", paywall: true }, { status: 401, headers: HEADERS });
  try {
    const access = await accessFor(userId);
    return hasFullAccess(access) ? null
      : NextResponse.json({ error: "Нужна подписка Deal Radar.", paywall: true, access }, { status: 402, headers: HEADERS });
  } catch (error) {
    console.error("access check failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Не удалось проверить подписку. Попробуйте через минуту." }, { status: 503, headers: HEADERS });
  }
}
