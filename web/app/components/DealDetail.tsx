"use client";

import { useEffect, useState } from "react";
import type { Deal } from "@/lib/deals";
import { distanceOf } from "./DealCard";
import { ProductAdvisor } from "./ProductAdvisor";
import { CONFIDENCE_LABEL, STATUS_LABEL, ageLabel, dateLabel, euro, pct } from "./ui";

const REFERENCE_LABEL: Record<string, string> = {
  external_used: "независимые б/у предложения",
  new_retail: "цена нового в магазинах",
  marktplaats: "устаревшая оценка (Marktplaats)",
  web_used: "устаревшая оценка (Marktplaats)",
  insufficient_data: "недостаточно данных",
};

export function DealDetail({ deal, saved, onSave, onClose }: { deal: Deal; saved: boolean; onSave: () => void; onClose: () => void }) {
  const [showAdvisor, setShowAdvisor] = useState(false);
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

          <div className="why-box">
            <b>{status === "candidate" ? "Почему на проверке" : "Почему выгодно"}</b>
            <p>{why}</p>
          </div>

          <dl className="evidence-grid">
            <div><dt>Цена продавца</dt><dd>{euro(deal.price, true)}</dd></div>
            <div><dt>Рыночная стоимость</dt><dd>{euro(marketValue, true)}</dd></div>
            <div><dt>Прибыль / ROI</dt><dd>{deal.estimated_profit != null ? euro(deal.estimated_profit, true) + " · " + pct(deal.profit_roi) : "—"}</dd></div>
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

          <p className="detail-desc">{deal.description || "Описание отсутствует в объявлении."}</p>
          <div className="detail-facts"><span>⌖ {deal.city || "Нидерланды"}{distance != null ? " · " + Math.round(distance) + " км" : ""}</span>{deal.price_type === "MIN_BID" ? <span>Цена «bieden vanaf»</span> : null}</div>
          {deal.warning_flags?.length ? <div className="warning-list"><strong>Обрати внимание</strong>{deal.warning_flags.map((flag) => <span key={flag}>⚠ {flag}</span>)}</div> : null}

          <div className="detail-actions">
            <a className="primary-button" href={deal.listing_url} target="_blank" rel="noopener noreferrer">Открыть на Marktplaats ↗</a>
            <button className="secondary-button" onClick={onSave} aria-pressed={saved}>{saved ? "♥ В избранном" : "♡ В избранное"}</button>
          </div>

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
