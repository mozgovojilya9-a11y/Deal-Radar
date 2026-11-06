import { createHmac, timingSafeEqual } from "node:crypto";

export function telegramUserId(request: Request): number | null {
  const token = process.env.TELEGRAM_TOKEN;
  if (!token) return null;
  const auth = request.headers.get("authorization") ?? "";
  const match = /^tma\s+(.+)$/i.exec(auth);
  if (!match) return null;

  const raw = match[1];
  if (!raw || raw.length > 8192) return null;
  const params = new URLSearchParams(raw);
  const hash = params.get("hash");
  const authDate = Number(params.get("auth_date"));
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash) || !Number.isFinite(authDate)) return null;

  const maxAge = Number(process.env.TELEGRAM_INITDATA_MAX_AGE_SECONDS) || 86400;
  const now = Math.floor(Date.now() / 1000);
  if (authDate > now + 60 || now - authDate > maxAge) return null;

  params.delete("hash");
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => key + "=" + value)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString).digest();
  const actual = Buffer.from(hash, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    const user = JSON.parse(params.get("user") ?? "null") as { id?: number } | null;
    if (!user || !Number.isSafeInteger(user.id) || !user.id || user.id < 1) return null;
    const allowlist = process.env.ALLOWED_TELEGRAM_USER_IDS?.trim();
    if (allowlist) {
      const allowed = allowlist.split(",").map((x) => Number(x.trim())).filter(Number.isSafeInteger);
      if (!allowed.includes(user.id)) return null;
    }
    return user.id;
  } catch {
    return null;
  }
}
