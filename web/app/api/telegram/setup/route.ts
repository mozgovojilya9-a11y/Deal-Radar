import { NextRequest, NextResponse } from "next/server";
import { botCall, webhookSecret } from "@/lib/telegram-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-time setup, protected by CRON_SECRET: points the bot's webhook at this deployment and
 * registers the commands Telegram requires for payments. Open /api/telegram/setup?key=<CRON_SECRET>.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET || "";
  if (secret.length < 16 || request.nextUrl.searchParams.get("key") !== secret) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const url = new URL("/api/telegram/webhook", request.nextUrl.origin).href;
  try {
    await botCall("setWebhook", { url, secret_token: webhookSecret(), allowed_updates: ["message", "pre_checkout_query"], drop_pending_updates: false });
    await botCall("setMyCommands", { commands: [
      { command: "start", description: "Открыть Deal Radar" },
      { command: "terms", description: "Условия подписки" },
      { command: "paysupport", description: "Помощь с оплатой" },
    ] });
    const info = await botCall<{ url: string; pending_update_count: number; last_error_message?: string }>("getWebhookInfo");
    return NextResponse.json({ ok: true, webhook: info.url, pending: info.pending_update_count, lastError: info.last_error_message || null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message.replace(/bot\d+:[\w-]+/g, "bot***") : "error" }, { status: 502 });
  }
}
