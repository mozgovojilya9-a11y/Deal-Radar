"use client";

import { useCallback, useEffect, useState } from "react";
import type { Access, PlanKey } from "@/lib/subscription";
import { dateLabel } from "./ui";

type PlanInfo = { key: PlanKey; stars: number; days: number; recurring: boolean; title: string };
export type SubscriptionState = { paywall: boolean; access: Access | null; plans: PlanInfo[]; trialDays: number; error: string; loading: boolean };

const initData = () => (typeof window !== "undefined" ? window.Telegram?.WebApp?.initData : "") || "";
const daysLeft = (until: string | null) => until ? Math.max(0, Math.ceil((Date.parse(until) - Date.now()) / 86_400_000)) : 0;

/** Access of the current Telegram user; the first call starts the free trial. */
export function useSubscription() {
  const [state, setState] = useState<SubscriptionState>({ paywall: false, access: null, plans: [], trialDays: 3, error: "", loading: true });
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((value) => value + 1), []);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/subscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData: initData() }), cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!cancelled) setState({ paywall: Boolean(data.paywall), access: data.access || null, plans: data.plans || [], trialDays: data.trialDays || 3, error: response.ok ? "" : data.error || "", loading: false });
      })
      .catch(() => { if (!cancelled) setState((current) => ({ ...current, loading: false, error: "Нет связи. Проверьте интернет." })); });
    return () => { cancelled = true; };
  }, [version]);
  const locked = state.paywall && state.access?.mode === "locked";
  return { ...state, locked, refresh };
}

/** Buys a plan with Telegram Stars inside the Mini App. */
function useCheckout(onPaid: () => void) {
  const [busy, setBusy] = useState<PlanKey | null>(null);
  const [message, setMessage] = useState("");
  async function buy(plan: PlanKey) {
    const webApp = window.Telegram?.WebApp;
    if (!webApp?.openInvoice || !initData()) { setMessage("Оплата работает только внутри Telegram: откройте Deal Radar через бота."); return; }
    setBusy(plan); setMessage("");
    try {
      const response = await fetch("/api/subscription/invoice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData: initData(), plan }) });
      const data = await response.json();
      if (!response.ok || !data.link) throw new Error(data.error || "Не удалось создать счёт.");
      webApp.openInvoice(data.link, (status) => {
        setBusy(null);
        if (status === "paid") {
          setMessage("Оплата прошла — открываю доступ…");
          webApp.HapticFeedback?.notificationOccurred("success");
          // Telegram confirms the payment to the server a moment later.
          window.setTimeout(onPaid, 1500);
          window.setTimeout(onPaid, 6000);
        } else if (status === "failed") setMessage("Оплата не прошла. Попробуйте ещё раз или напишите /paysupport боту.");
        else if (status === "pending") setMessage("Платёж обрабатывается — доступ откроется автоматически.");
      });
    } catch (error) {
      setBusy(null);
      setMessage(error instanceof Error ? error.message : "Ошибка оплаты.");
    }
  }
  return { busy, message, buy };
}

const TERMS = [
  "Месяц продлевается автоматически каждые 30 дней; отменить можно в профиле Deal Radar или в настройках Telegram — доступ останется до конца оплаченного периода.",
  "Год — один платёж за 365 дней, без автопродления.",
  "Deal Radar показывает объявления и оценку рынка; это информация, а не гарантия прибыли.",
  "Проблемы с оплатой — команда /paysupport в боте.",
];

export function Paywall({ subscription, title, onPaid }: { subscription: ReturnType<typeof useSubscription>; title?: string; onPaid: () => void }) {
  const { busy, message, buy } = useCheckout(onPaid);
  const plans = subscription.plans.length ? subscription.plans : [
    { key: "month" as const, stars: 1000, days: 30, recurring: true, title: "" }, { key: "year" as const, stars: 10000, days: 365, recurring: false, title: "" }];
  // Locked with a trial date means the trial has already ended.
  const trialOver = subscription.access?.mode === "locked" && Boolean(subscription.access.trialEndsAt);
  return (
    <section className="paywall" aria-label="Подписка Deal Radar">
      <div className="paywall-head">
        <span className="paywall-badge">⭐ Deal Radar Pro</span>
        <h2>{title || (trialOver ? "Пробный период закончился" : "Откройте все сделки")}</h2>
        <p>Выгодные объявления сразу после появления, оценка по независимым ценам, разбор прибыли и торга, поиск модели, AI-советник и уведомления в Telegram.</p>
      </div>
      <div className="plan-grid">
        {plans.map((plan) => {
          const monthly = plan.key === "year" ? Math.round(plan.stars / 12) : null;
          return (
            <button type="button" key={plan.key} className={"plan-card" + (plan.key === "year" ? " best" : "")} onClick={() => void buy(plan.key)} disabled={busy !== null}>
              {plan.key === "year" ? <span className="plan-tag">выгоднее на 2 месяца</span> : null}
              <strong>{plan.key === "year" ? "Год" : "Месяц"}</strong>
              <span className="plan-price">{plan.stars.toLocaleString("ru-RU")} ⭐</span>
              <small>{plan.key === "year" ? "≈ " + monthly?.toLocaleString("ru-RU") + " ⭐ в месяц · без автопродления" : "автопродление, отмена в любой момент"}</small>
              <span className="plan-cta">{busy === plan.key ? "Открываю оплату…" : "Оформить"}</span>
            </button>
          );
        })}
      </div>
      {message ? <p className="tool-notice" role="status">{message}</p> : null}
      <details className="paywall-terms"><summary>Условия подписки</summary><ul>{TERMS.map((line) => <li key={line}>{line}</li>)}</ul></details>
      <p className="paywall-note">Оплата в Telegram Stars. Нажимая «Оформить», вы соглашаетесь с условиями (/terms в боте).</p>
    </section>
  );
}

/** Small strip on top of the app while the trial runs. */
export function TrialBanner({ subscription, onUpgrade }: { subscription: ReturnType<typeof useSubscription>; onUpgrade: () => void }) {
  const access = subscription.access;
  if (!subscription.paywall || access?.mode !== "trial") return null;
  const left = daysLeft(access.until);
  return (
    <button type="button" className="trial-banner" onClick={onUpgrade}>
      <span>Пробный доступ · {left > 1 ? "осталось " + left + " дн." : "последний день"}</span><b>Оформить подписку ›</b>
    </button>
  );
}

/** Subscription block in the profile: status, renewal and plan purchase. */
export function SubscriptionCard({ subscription, onOpenPaywall }: { subscription: ReturnType<typeof useSubscription>; onOpenPaywall: () => void }) {
  const [notice, setNotice] = useState("");
  const access = subscription.access;
  if (!subscription.paywall) return null;
  async function cancel() {
    const response = await fetch("/api/subscription/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData: initData() }) });
    const data = await response.json().catch(() => ({}));
    setNotice(response.ok ? "Автопродление выключено. Доступ сохранится до " + dateLabel(data.until) + "." : data.error || "Не удалось изменить подписку.");
    if (response.ok) subscription.refresh();
  }
  const status = access?.mode === "subscribed"
    ? (access.plan === "year" ? "Годовая" : "Ежемесячная") + " подписка до " + dateLabel(access.until)
    : access?.mode === "trial" ? "Пробный доступ до " + dateLabel(access.until) : "Подписка не оформлена";
  return (
    <div className="v2-card">
      <div className="v2-card-head"><h3>Подписка</h3></div>
      <p className="v2-hint"><b>{status}</b>{access?.mode === "subscribed" && access.recurring ? " · продлевается автоматически" : ""}</p>
      <div className="detail-tools">
        <button type="button" className="tool-button" onClick={onOpenPaywall}>{access?.mode === "subscribed" ? "Продлить или сменить тариф" : "Оформить подписку"}</button>
        {access?.mode === "subscribed" && access.recurring ? <button type="button" className="tool-button" onClick={() => void cancel()}>Отменить автопродление</button> : null}
      </div>
      {notice ? <p className="tool-notice" role="status">{notice}</p> : null}
    </div>
  );
}
