import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { forgetAccess } from "@/lib/access";
import { checkoutProblem, parsePayload } from "@/lib/subscription";
import { PAYSUPPORT_TEXT, TERMS_TEXT } from "@/lib/terms";
import { botCall, forgetStarTransactions, webhookSecret } from "@/lib/telegram-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Update = {
  pre_checkout_query?: { id: string; from: { id: number }; currency: string; total_amount: number; invoice_payload: string };
  message?: { chat: { id: number }; from?: { id: number }; text?: string;
    successful_payment?: { currency: string; total_amount: number; invoice_payload: string; is_recurring?: boolean; is_first_recurring?: boolean; subscription_expiration_date?: number } };
};

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const send = (chatId: number, text: string) => botCall("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true });

/**
 * Bot webhook: answers checkouts (Telegram allows 10 seconds), confirms payments and replies to
 * /start, /terms, /paysupport and /support. Requests without the secret header are rejected.
 */
export async function POST(request: NextRequest) {
  if (!sameSecret(request.headers.get("x-telegram-bot-api-secret-token") || "", webhookSecret())) return new NextResponse("forbidden", { status: 403 });
  const update = await request.json().catch(() => null) as Update | null;
  if (!update) return NextResponse.json({ ok: true });
  try {
    if (update.pre_checkout_query) {
      const problem = checkoutProblem(update.pre_checkout_query);
      await botCall("answerPreCheckoutQuery", { pre_checkout_query_id: update.pre_checkout_query.id, ok: !problem, ...(problem ? { error_message: problem } : {}) });
    }
    const message = update.message;
    const payment = message?.successful_payment;
    if (message && payment) {
      forgetStarTransactions();
      if (message.from) forgetAccess(String(message.from.id));
      const plan = parsePayload(payment.invoice_payload)?.plan;
      const until = payment.subscription_expiration_date ? new Date(payment.subscription_expiration_date * 1000).toLocaleDateString("ru-RU") : null;
      await send(message.chat.id, payment.is_recurring && !payment.is_first_recurring
        ? "⭐ Подписка Deal Radar продлена" + (until ? " до " + until : "") + ". Спасибо!"
        : "⭐ Спасибо! Подписка Deal Radar «" + (plan === "year" ? "год" : "месяц") + "» активна" + (until ? " до " + until : "") + ". Откройте приложение — все сделки уже доступны.");
    } else if (message?.text) {
      const command = message.text.trim().split(/[\s@]/)[0].toLowerCase();
      if (command === "/terms") await send(message.chat.id, TERMS_TEXT);
      else if (command === "/paysupport" || command === "/support") await send(message.chat.id, PAYSUPPORT_TEXT);
      else if (command === "/start") await send(message.chat.id, "👋 <b>Deal Radar</b> находит на Marktplaats объявления дешевле рынка. Откройте приложение кнопкой меню.\n\n/terms — условия подписки\n/paysupport — помощь с оплатой");
    }
  } catch (error) {
    console.error("telegram webhook failed:", error instanceof Error ? error.message : error);
  }
  // Always 200: a failing answer must not make Telegram retry the same update forever.
  return NextResponse.json({ ok: true });
}
