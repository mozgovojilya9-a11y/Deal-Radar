import { createHmac } from "node:crypto";
import type { StarTransaction } from "./subscription";

/** Calls the Telegram Bot API with the server-side token; the token is never logged or returned. */
export async function botCall<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const token = process.env.TELEGRAM_TOKEN;
  if (!token) throw new Error("TELEGRAM_TOKEN не настроен");
  // TELEGRAM_API_BASE exists only for local testing against a stub; production uses Telegram itself.
  const base = process.env.TELEGRAM_API_BASE || "https://api.telegram.org";
  const response = await fetch(base + "/bot" + token + "/" + method, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params), cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const data = await response.json().catch(() => null) as { ok?: boolean; result?: T; description?: string } | null;
  if (!data?.ok) throw new Error("Telegram " + method + ": " + (data?.description || "HTTP " + response.status));
  return data.result as T;
}

/** Secret for the webhook header, derived from the bot token so no extra variable is needed. */
export function webhookSecret(): string {
  const token = process.env.TELEGRAM_TOKEN || "";
  return process.env.TELEGRAM_WEBHOOK_SECRET || createHmac("sha256", token).update("deal-radar-webhook").digest("hex");
}

let cache: { at: number; rows: StarTransaction[] } | null = null;
const CACHE_MS = 60_000;

/**
 * All Star transactions of the bot (newest pages first, up to 10,000). Cached for a minute per server
 * instance; after a payment the webhook clears the cache. When Telegram is unreachable the last good
 * list is used, so paying users are not locked out by an outage.
 */
export async function starTransactions({ fresh = false } = {}): Promise<StarTransaction[]> {
  // "fresh" still reuses a list fetched in the last 10 seconds, so locked users cannot flood Telegram.
  if (cache && Date.now() - cache.at < (fresh ? 10_000 : CACHE_MS)) return cache.rows;
  try {
    const rows: StarTransaction[] = [];
    for (let offset = 0; offset < 10_000; offset += 100) {
      const page = await botCall<{ transactions: StarTransaction[] }>("getStarTransactions", { offset, limit: 100 });
      rows.push(...page.transactions);
      if (page.transactions.length < 100) break;
    }
    cache = { at: Date.now(), rows };
    return rows;
  } catch (error) {
    if (cache) return cache.rows;
    throw error;
  }
}

export function forgetStarTransactions(): void {
  cache = null;
}
