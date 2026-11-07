import { NextRequest, NextResponse } from "next/server";
import { looksLikeSpam, MIN_FILL_MS, normalizeContact, validateContact, type ContactInput } from "@/lib/site/contact";
import { siteConfig } from "@/site-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Contact form endpoint. Delivers each message to every configured channel:
 *  - Telegram: TELEGRAM_TOKEN (already used by the Mini App) + CONTACT_TELEGRAM_CHAT_ID
 *  - Email via Resend: RESEND_API_KEY + CONTACT_FROM_EMAIL (verified sender), to CONTACT_TO_EMAIL
 *    or siteConfig.contactEmail
 * With no channel configured it answers 503 instead of pretending the message was sent.
 */

const MAX_BODY_BYTES = 16 * 1024;
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;
// Best-effort per-instance limiter; serverless instances do not share memory.
const hits = new Map<string, number[]>();

function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) { hits.set(ip, recent); return true; }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [key, times] of hits) if (!times.some((time) => now - time < WINDOW_MS)) hits.delete(key);
  return false;
}

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // Non-browser clients; the other checks still apply.
  try { return new URL(origin).host === request.headers.get("host"); } catch { return false; }
}

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function sendTelegram(message: ContactInput, locale: string): Promise<boolean | null> {
  const token = process.env.TELEGRAM_TOKEN?.trim();
  const chatId = process.env.CONTACT_TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return null;
  const text = [
    "<b>Deal Radar — new contact message</b>",
    `<b>From:</b> ${escapeHtml(message.name)} &lt;${escapeHtml(message.email)}&gt;`,
    `<b>Subject:</b> ${escapeHtml(message.subject)}`,
    `<b>Site language:</b> ${escapeHtml(locale)}`,
    "",
    escapeHtml(message.message),
  ].join("\n").slice(0, 4000);
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) console.error("contact: telegram delivery failed with status", response.status);
    return response.ok;
  } catch (error) {
    console.error("contact: telegram delivery error", error instanceof Error ? error.message : error);
    return false;
  }
}

async function sendEmail(message: ContactInput, locale: string): Promise<boolean | null> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.CONTACT_FROM_EMAIL?.trim();
  const to = process.env.CONTACT_TO_EMAIL?.trim() || siteConfig.contactEmail;
  if (!key || !from || !to) return null;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: message.email,
        subject: `[Deal Radar] ${message.subject}`,
        text: `From: ${message.name} <${message.email}>\nSite language: ${locale}\n\n${message.message}`,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) console.error("contact: email delivery failed with status", response.status);
    return response.ok;
  } catch (error) {
    console.error("contact: email delivery error", error instanceof Error ? error.message : error);
    return false;
  }
}

const fail = (error: string, status: number, fields?: string[]) => NextResponse.json({ ok: false, error, fields }, { status });

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail("spam", 403);
  if (!(request.headers.get("content-type") || "").includes("application/json")) return fail("failed", 415);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return fail("failed", 413);
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw) as Record<string, unknown>; } catch { return fail("failed", 400); }
  if (!body || typeof body !== "object") return fail("failed", 400);

  // Honeypot and fill-time checks: bots fill hidden fields and submit instantly.
  const startedAt = Number(body.startedAt);
  if ((typeof body.website === "string" && body.website.trim() !== "")
    || !Number.isFinite(startedAt) || Date.now() - startedAt < MIN_FILL_MS) {
    return fail("spam", 400);
  }

  const message = normalizeContact(body);
  const invalid = validateContact(message);
  if (invalid.length) return fail("invalid", 422, invalid);
  if (looksLikeSpam(message)) return fail("spam", 400);

  if (rateLimited(clientIp(request))) return fail("rate", 429);

  const locale = body.locale === "en" ? "en" : "nl";
  const results = await Promise.all([sendTelegram(message, locale), sendEmail(message, locale)]);
  const configured = results.filter((result) => result !== null);
  if (configured.length === 0) {
    console.error("contact: no delivery channel configured (set CONTACT_TELEGRAM_CHAT_ID and/or RESEND_API_KEY + CONTACT_FROM_EMAIL)");
    return fail("unavailable", 503);
  }
  if (!configured.some(Boolean)) return fail("failed", 502);
  return NextResponse.json({ ok: true });
}

export function GET() {
  return NextResponse.json({ ok: false, error: "method" }, { status: 405, headers: { Allow: "POST" } });
}
