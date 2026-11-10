/**
 * Deal Radar subscription in Telegram Stars.
 *
 * Telegram is the source of truth for payments: who paid is read from the bot's Star transactions
 * (getStarTransactions), so no payment database is needed. Telegram allows a subscription period of
 * exactly 30 days, so the yearly plan is a one-time payment for 365 days of access.
 */

export type PlanKey = "month" | "year";
export type Plan = { key: PlanKey; stars: number; days: number; recurring: boolean; title: string; description: string };

export const PLANS: Record<PlanKey, Plan> = {
  month: { key: "month", stars: 1000, days: 30, recurring: true, title: "Deal Radar · месяц",
    description: "Все выгодные сделки сразу, уведомления в Telegram, поиск модели и AI-советник. Продлевается каждые 30 дней, отмена в любой момент." },
  year: { key: "year", stars: 10000, days: 365, recurring: false, title: "Deal Radar · год",
    description: "365 дней полного доступа одним платежом, без автопродления." },
};
export const TRIAL_DAYS = 3;
/** Telegram accepts only this subscription period. */
export const SUBSCRIPTION_PERIOD = 2_592_000;

const DAY = 86_400;

/** Invoice payload: plan and buyer, so a payment can always be matched to the right user. */
export function invoicePayload(plan: PlanKey, userId: string): string {
  return "dr1:" + plan + ":" + userId;
}

export function parsePayload(payload: unknown): { plan: PlanKey; userId: string } | null {
  const match = typeof payload === "string" ? payload.match(/^dr1:(month|year):(\d{1,20})$/) : null;
  return match ? { plan: match[1] as PlanKey, userId: match[2] } : null;
}

/** The subset of a Bot API StarTransaction this module reads. */
export type StarTransaction = {
  id: string;
  amount: number;
  date: number;
  source?: { type: string; transaction_type?: string; user?: { id: number }; invoice_payload?: string; subscription_period?: number };
  receiver?: { type: string; user?: { id: number } };
};

export type Subscription = {
  active: boolean;
  plan: PlanKey | null;
  /** End of paid access (ISO), the latest of all payments. */
  until: string | null;
  recurring: boolean;
  /** telegram_payment_charge_id of the latest monthly payment, needed to cancel renewal. */
  chargeId: string | null;
  payments: number;
};

/**
 * Paid access of one user from the bot's Star transactions. A payment counts only when its payload
 * names this user and the amount covers the plan. A refund to the user (an outgoing transaction)
 * cancels that user's latest earlier payment of the same amount.
 */
export function subscriptionFrom(transactions: StarTransaction[], userId: string, now = Date.now()): Subscription {
  const sorted = [...transactions].sort((a, b) => a.date - b.date);
  const payments: Array<{ tx: StarTransaction; plan: Plan; end: number; refunded: boolean }> = [];
  for (const tx of sorted) {
    const source = tx.source;
    if (source?.type === "user" && String(source.user?.id) === userId) {
      const payload = parsePayload(source.invoice_payload);
      if (!payload || payload.userId !== userId) continue;
      const plan = PLANS[payload.plan];
      if (tx.amount < plan.stars) continue;
      const seconds = plan.recurring ? (source.subscription_period || SUBSCRIPTION_PERIOD) : plan.days * DAY;
      payments.push({ tx, plan, end: (tx.date + seconds) * 1000, refunded: false });
    } else if (tx.receiver?.type === "user" && String(tx.receiver.user?.id) === userId) {
      const refunded = [...payments].reverse().find((row) => !row.refunded && row.tx.date <= tx.date && row.tx.amount === Math.abs(tx.amount));
      if (refunded) refunded.refunded = true;
    }
  }
  const valid = payments.filter((row) => !row.refunded);
  const latest = valid.reduce<(typeof valid)[number] | null>((best, row) => !best || row.end > best.end ? row : best, null);
  const lastMonthly = [...valid].reverse().find((row) => row.plan.recurring) ?? null;
  return {
    active: Boolean(latest && latest.end > now),
    plan: latest?.plan.key ?? null,
    until: latest ? new Date(latest.end).toISOString() : null,
    recurring: Boolean(latest?.plan.recurring),
    chargeId: lastMonthly?.tx.id ?? null,
    payments: valid.length,
  };
}

export type Access = {
  /** open: paywall switched off; subscribed / trial: full access; locked: overview only. */
  mode: "open" | "subscribed" | "trial" | "locked";
  until: string | null;
  trialEndsAt: string | null;
  plan: PlanKey | null;
  recurring: boolean;
};

export function accessFrom({ paywall, subscription, trialStartedAt, now = Date.now() }: {
  paywall: boolean; subscription: Subscription | null; trialStartedAt: number | null; now?: number;
}): Access {
  const trialEnds = trialStartedAt === null ? null : trialStartedAt + TRIAL_DAYS * DAY * 1000;
  const base = { trialEndsAt: trialEnds === null ? null : new Date(trialEnds).toISOString(), plan: subscription?.plan ?? null, recurring: Boolean(subscription?.recurring) };
  if (!paywall) return { ...base, mode: "open", until: null };
  if (subscription?.active) return { ...base, mode: "subscribed", until: subscription.until };
  if (trialEnds !== null && trialEnds > now) return { ...base, mode: "trial", until: new Date(trialEnds).toISOString() };
  return { ...base, mode: "locked", until: subscription?.until ?? null };
}

export const hasFullAccess = (access: Access) => access.mode !== "locked";

/** Validates a checkout before Telegram charges: plan, buyer and amount must match exactly. */
export function checkoutProblem(query: { from: { id: number }; currency: string; total_amount: number; invoice_payload: string }): string | null {
  const payload = parsePayload(query.invoice_payload);
  if (!payload) return "Неизвестный счёт.";
  if (payload.userId !== String(query.from.id)) return "Этот счёт создан для другого пользователя.";
  if (query.currency !== "XTR" || query.total_amount !== PLANS[payload.plan].stars) return "Сумма счёта не совпадает с тарифом.";
  return null;
}
