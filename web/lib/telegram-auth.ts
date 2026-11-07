import { createHmac, timingSafeEqual } from "node:crypto";

/** Validates Telegram Mini App initData and returns the Telegram user id, or null. */
export function verifyInitData(raw: string, token: string, maxAgeSeconds = 86400): string | null {
  if (!raw || raw.length > 8192 || !token) return null;
  const params = new URLSearchParams(raw);
  const hash = params.get("hash");
  const authDate = Number(params.get("auth_date"));
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash) || !Number.isFinite(authDate)) return null;
  const now = Math.floor(Date.now() / 1000);
  if (authDate > now + 60 || now - authDate > maxAgeSeconds) return null;
  params.delete("hash");
  const check = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => key + "=" + value)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const expected = createHmac("sha256", secret).update(check).digest();
  const actual = Buffer.from(hash, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const user = JSON.parse(params.get("user") || "{}") as { id?: number };
    return Number.isSafeInteger(user.id) && Number(user.id) > 0 ? String(user.id) : null;
  } catch {
    return null;
  }
}

const buckets = new Map<string, number[]>();

/** Small per-instance sliding-window limiter (serverless instances are short-lived). */
export function rateAllowed(key: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const recent = (buckets.get(key) || []).filter((time) => now - time < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  return true;
}
