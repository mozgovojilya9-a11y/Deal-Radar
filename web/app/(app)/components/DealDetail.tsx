"use client";

import { useEffect, useState } from "react";
import { sellerMessage } from "@/lib/purchases";
import type { Deal } from "@/lib/deals";
import { distanceOf } from "./DealCard";
import { ProductAdvisor } from "./ProductAdvisor";
import { SCORE_MAX, type ScoreParts } from "@/lib/score";
import { CONFIDENCE_LABEL, STATUS_LABEL, ScoreRing, ageLabel, dateLabel, euro, pct } from "./ui";

const SCORE_ROWS: Array<[keyof ScoreParts, string, string]> = [
  ["profit", "Прибыль", "чистая прибыль после торга и комиссий"],
  ["roi", "Окупаемость", "прибыль относительно вложенного"],
  ["evidence", "Доказательность", "сколько независимых цен и площадок за оценкой"],
  ["liquidity", "Ликвидность", "насколько активно модель продаётся"],
  ["freshness", "Свежесть", "как давно опубликовано объявление"],
  ["risk", "Риски", "предупреждения, bieden, одна площадка"],
];

const REFERENCE_LABEL: Record<string, string> = {
  external_used: "независимые б/у предложения",
  new_retail: "цена нового в магазинах",
  marktplaats: "устаревшая оценка (Marktplaats)",
  web_used: "устаревшая оценка (Marktplaats)",
  insufficient_data: "недостаточно данных",
};

const REPORTS: Array<[string, string]> = [["wrong_model", "Не та модель"], ["wrong_price", "Неверная цена рынка"], ["sold", "Продано / резерв"], ["fake", "Подделка / обман"], ["other", "Другое"]];

async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* older WebViews */ }
  try {
    const area = document.createElement("textarea");
    area.value = text; area.style.position = "fixed"; area.style.opacity = "0";
    document.body.appendChild(area); area.select();
    const done = document.execCommand("copy");
    area.remove();
    return done;
  } catch { return false; }
}

export function DealDetail({ deal: initial, saved, bought, onSave, onClose, onHide, onBuy }: {
  deal: Deal; saved: boolean; bought: boolean; onSave: () => void; onClose: () => void; onHide: () => void; onBuy: (deal: Deal, paid: number) => void;
}) {
  const [showAdvisor, setShowAdvisor] = useState(false);
  const [full, setFull] = useState<Deal | null>(null);
  const [panel, setPanel] = useState<"" | "report" | "buy">("");
  const [paid, setPaid] = useState(String(initial.opening_offer_price ?? initial.price));
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const deal = full ?? initial;
  // Catalogue cards arrive without description and sources: load them when the listing is opened.
  useEffect(() => {
    if (initial.description !== undefined) return;
    let cancelled = false;
    fetch("/api/deals?ids=" + encodeURIComponent(initial.listing_id), { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (!cancelled && data?.deals?.[0]) setFull({ ...initial, ...data.deals[0] }); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [initial]);

  async function report(kind: string) {
    setPanel("");
    onHide();
    try {
      const response = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: window.Telegram?.WebApp?.initData || "", kind, title: deal.title, url: deal.listing_url, price: deal.price, marketValue: deal.market_value ?? null }) });
      const data = await response.json().catch(() => ({}));
      setNotice(response.ok ? "Спасибо, сообщение отправлено. Объявление скрыто." : "Объявление скрыто, но сообщение не ушло: " + (data.error || "ошибка"));
    } catch { setNotice("Объявление скрыто, но сообщение не ушло: нет связи."); }
  }

  function buy(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(paid.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) { setNotice("Укажите цену покупки."); return; }
    onBuy(deal, value);
    setPanel("");
    setNotice("Добавлено в «Мои покупки».");
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [onClose]);

  const status = deal.status || "candidate";
  const distance = distanceOf(deal);
  // Only independent sources are evidence; legacy Marktplaats comparables are not shown as such.
  const sources = (deal.market_sources || []).filter((source) => /^https:\/\//.test(source.url) && !/marktplaats\.nl|2dehands\.be/.test(source.url));
  const marketValue = deal.market_value ?? (deal.price_reference_type === "external_used" || deal.price_reference_type === "new_retail" ? deal.market_price : null);
  const why = status === "candidate"
    ? deal.evaluation_reason || "Модель распознана, но сопоставимых цен пока мало — сканер перепроверит позже."
    : deal.evaluation_reason || "Цена ниже осторожной рыночной оценки, прибыль покрывает торг и комиссию.";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="detail-modal" role="dialog" aria-modal="true" aria-label={deal.title} onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Закрыть">×</button>
        <div className="detail-photo">
          {deal.image_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={deal.image_url} alt={deal.title} referrerPolicy="no-referrer" />
            : <span>✦</span>}
        </div>
        <div className="detail-body">
          <div className="eyebrow">{deal.category_label} · {STATUS_LABEL[status]}</div>
          <h2>{deal.title}</h2>
          <div className="detail-price">
            <strong>{euro(deal.price, true)}</strong>
            <span>{marketValue != null ? "Рыночная стоимость ≈ " + euro(marketValue, true) : "Рыночная стоимость не подтверждена"}</span>
          </div>

          {deal.previous_price != null && deal.previous_price !== deal.price ? (
            <p className={"price-change " + (deal.price_dropped_at ? "down" : "up")}>
              {deal.price_dropped_at ? "↓ Продавец снизил цену" : "↑ Продавец поднял цену"}: {euro(deal.previous_price, true)} → {euro(deal.price, true)}
              {deal.price_dropped_at ? " · " + ageLabel(deal.price_dropped_at) : ""}
            </p>
          ) : null}

          <div className="why-box">
            <b>{status === "candidate" ? "Почему на проверке" : "Почему выгодно"}</b>
            <p>{why}</p>
          </div>

          {deal.deal_score != null && deal.score_parts ? (
            <details className="score-box" open={status !== "candidate"}>
              <summary><ScoreRing score={deal.deal_score} size={44} /><span><b>Балл сделки {deal.deal_score} из 100</b><small>из чего он складывается</small></span></summary>
              <ul>{SCORE_ROWS.map(([key, label, hint]) => {
                const value = deal.score_parts![key];
                const max = SCORE_MAX[key];
                return (
                  <li key={key} className={key === "risk" ? "penalty" : ""}>
                    <span>{label}<small>{hint}</small></span>
                    <i aria-hidden="true"><em style={{ width: Math.min(100, Math.abs(value / max) * 100) + "%" }} /></i>
                    <b>{key === "risk" ? (value ? "−" + Math.abs(value) : "0") : value + " / " + max}</b>
                  </li>
                );
              })}</ul>
            </details>
          ) : null}

          {status !== "candidate" && deal.max_offer_price ? (
            <div className="offer-box">
              <b>Как торговаться</b>
              <div className="offer-steps">
                <div><span>Начните с</span><strong>{euro(deal.opening_offer_price)}</strong></div>
                <div><span>Максимум</span><strong>{euro(deal.max_offer_price)}</strong></div>
              </div>
              <p>Дороже максимума сделка перестаёт быть выгодной с учётом торга при перепродаже, комиссии и расходов.</p>
              {deal.opening_offer_price ? <button type="button" className="link-button" onClick={() => { void copyText(sellerMessage(deal.title, deal.opening_offer_price as number)).then((ok) => { setCopied(ok); setNotice(ok ? "" : "Не удалось скопировать."); }); }}>{copied ? "Скопировано ✓" : "Скопировать сообщение продавцу"}</button> : null}
            </div>
          ) : null}

          <dl className="evidence-grid">
            <div><dt>Цена продавца</dt><dd>{euro(deal.price, true)}</dd></div>
            <div><dt>Рыночная стоимость</dt><dd>{euro(marketValue, true)}</dd></div>
            <div><dt>Прибыль / ROI</dt><dd>{deal.estimated_profit != null ? euro(deal.estimated_profit, true) + " · " + pct(deal.profit_roi) : "—"}</dd></div>
            {deal.expected_resale_price != null ? <div><dt>Ожидаемая продажа</dt><dd>{euro(deal.expected_resale_price, true)}</dd></div> : null}
            <div><dt>Новый (магазины)</dt><dd>{euro(deal.new_price, true)}</dd></div>
            <div><dt>Б/у (вне Marktplaats)</dt><dd>{euro(deal.used_price, true)}</dd></div>
            <div><dt>Восстановленный</dt><dd>{euro(deal.refurbished_price, true)}</dd></div>
            <div><dt>Независимых источников</dt><dd>{deal.external_sources ?? 0}{deal.external_domains ? " · сайтов " + deal.external_domains : ""}</dd></div>
            <div><dt>Надёжность</dt><dd>{CONFIDENCE_LABEL[deal.market_confidence || "none"] || "—"}</dd></div>
            <div><dt>Проверено</dt><dd>{deal.market_checked_at ? dateLabel(deal.market_checked_at) + (deal.market_stale ? " (устарело)" : "") : "—"}</dd></div>
            <div><dt>Основа оценки</dt><dd>{REFERENCE_LABEL[deal.price_reference_type || "insufficient_data"] || "—"}</dd></div>
            {deal.market_spread != null ? <div><dt>Разброс цен</dt><dd>{pct(deal.market_spread)}</dd></div> : null}
            {deal.marktplaats_samples ? <div><dt>Marktplaats (контекст)</dt><dd>{euro(deal.marktplaats_median, true)} · {deal.marktplaats_samples} объявл.</dd></div> : null}
            <div><dt>Состояние</dt><dd>{deal.item_condition || "не указано"}</dd></div>
            <div><dt>Оценка обновлена</dt><dd>{deal.evaluated_at ? ageLabel(deal.evaluated_at) : "—"}</dd></div>
            <div><dt>Найдено</dt><dd>{dateLabel(deal.first_detected_at || deal.detected_at)}</dd></div>
            {deal.price_history && deal.price_history.length > 1 ? <div><dt>История цены</dt><dd>{deal.price_history.map((point) => euro(point.price)).join(" → ")}</dd></div> : null}
            {deal.next_check_at && status === "candidate" ? <div><dt>След. проверка</dt><dd>{dateLabel(deal.next_check_at)} {new Date(deal.next_check_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</dd></div> : null}
          </dl>

          {sources.length ? (
            <details className="source-list" open={sources.length <= 4}>
              <summary>Независимые источники цены · {sources.length}</summary>
              <ul>{sources.map((source) => (
                <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">
                  <span>{source.title || source.domain || "Источник"}</span>
                  <b>{euro(source.price ?? source.price_eur ?? null, true)}</b>
                  <small>{[source.domain || "marktplaats.nl", source.item_condition || source.condition, source.city].filter(Boolean).join(" · ")}</small>
                </a></li>
              ))}</ul>
            </details>
          ) : <p className="detail-muted">Независимых источников цены пока нет{deal.valuation_reason ? ": " + deal.valuation_reason : ""}. Цены Marktplaats не используются как рыночная стоимость.</p>}

          <p className="detail-desc">{deal.description === undefined ? "Загружаю описание…" : deal.description || "Описание отсутствует в объявлении."}</p>
          <div className="detail-facts"><span>⌖ {deal.city || "Нидерланды"}{distance != null ? " · " + Math.round(distance) + " км" : ""}</span>{deal.price_type === "MIN_BID" ? <span>Цена «bieden vanaf»</span> : null}</div>
          {deal.warning_flags?.length ? <div className="warning-list"><strong>Обрати внимание</strong>{deal.warning_flags.map((flag) => <span key={flag}>⚠ {flag}</span>)}</div> : null}

          <div className="detail-actions">
            <a className="primary-button" href={deal.listing_url} target="_blank" rel="noopener noreferrer">Открыть на Marktplaats ↗</a>
            <button className="secondary-button" onClick={onSave} aria-pressed={saved}>{saved ? "♥ В избранном" : "♡ В избранное"}</button>
          </div>

          <div className="detail-tools">
            <button type="button" className="tool-button" aria-expanded={panel === "buy"} onClick={() => setPanel(panel === "buy" ? "" : "buy")}>{bought ? "✓ Куплено" : "Я купил"}</button>
            <button type="button" className="tool-button" aria-expanded={panel === "report"} onClick={() => setPanel(panel === "report" ? "" : "report")}>Неверная оценка</button>
            <button type="button" className="tool-button" onClick={() => { onHide(); setNotice("Объявление скрыто. Вернуть можно в профиле."); }}>Скрыть</button>
          </div>
          {panel === "buy" ? (
            <form className="tool-panel" onSubmit={buy}>
              <label>За сколько купили, €<input inputMode="decimal" value={paid} onChange={(event) => setPaid(event.target.value)} autoFocus /></label>
              <button type="submit" className="primary-button">Сохранить</button>
            </form>
          ) : null}
          {panel === "report" ? <div className="tool-panel report-reasons">{REPORTS.map(([kind, label]) => <button type="button" key={kind} className="preference-chip" onClick={() => void report(kind)}>{label}</button>)}</div> : null}
          {notice ? <p className="tool-notice" role="status">{notice}</p> : null}

          {showAdvisor
            ? <ProductAdvisor key={deal.listing_id} deal={deal} />
            : <button className="advisor-toggle full-button" type="button" onClick={() => setShowAdvisor(true)}>
                <span className="advisor-toggle-mark">✳</span>
                <span><strong>Спросить AI об этом товаре</strong><small>Новая и б/у цена, прибыль, риски — с источниками</small></span>
                <span className="advisor-toggle-arrow">+</span>
              </button>}
        </div>
      </section>
    </div>
  );
}
