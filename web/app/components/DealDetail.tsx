"use client";

import { useEffect, useState } from "react";
import type { Deal } from "@/lib/deals";
import { distanceOf } from "./DealCard";
import { ProductAdvisor } from "./ProductAdvisor";
import { CONFIDENCE_LABEL, STATUS_LABEL, ageLabel, dateLabel, euro, pct } from "./ui";

const REFERENCE_LABEL: Record<string, string> = {
  marktplaats: "похожие объявления Marktplaats",
  web_used: "Marktplaats + другие площадки",
  new_retail: "цена нового товара в магазинах",
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
  const sources = (deal.market_sources || []).filter((source) => /^https:\/\//.test(source.url));
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
            <span>{deal.market_price != null ? "Рынок ≈ " + euro(deal.market_price, true) : "Рыночная цена не подтверждена"}</span>
          </div>

          <div className="why-box">
            <b>{status === "candidate" ? "Почему на проверке" : "Почему выгодно"}</b>
            <p>{why}</p>
          </div>

          <dl className="evidence-grid">
            <div><dt>Прибыль</dt><dd>{deal.estimated_profit != null ? euro(deal.estimated_profit, true) : "—"}</dd></div>
            <div><dt>ROI</dt><dd>{pct(deal.profit_roi)}</dd></div>
            <div><dt>Сравнений</dt><dd>{deal.market_samples ?? 0}</dd></div>
            <div><dt>Надёжность</dt><dd>{CONFIDENCE_LABEL[deal.market_confidence || "none"] || "—"}</dd></div>
            <div><dt>Основа оценки</dt><dd>{REFERENCE_LABEL[deal.price_reference_type || "insufficient_data"] || "—"}</dd></div>
            <div><dt>Медиана рынка</dt><dd>{euro(deal.market_median_price, true)}</dd></div>
            {deal.market_spread != null ? <div><dt>Разброс цен</dt><dd>{pct(deal.market_spread)}</dd></div> : null}
            {deal.new_price != null ? <div><dt>Новый товар</dt><dd>{euro(deal.new_price, true)}</dd></div> : null}
            <div><dt>Состояние</dt><dd>{deal.item_condition || "не указано"}</dd></div>
            <div><dt>Оценка обновлена</dt><dd>{deal.evaluated_at ? ageLabel(deal.evaluated_at) : "—"}</dd></div>
            <div><dt>Найдено</dt><dd>{dateLabel(deal.first_detected_at || deal.detected_at)}</dd></div>
            {deal.next_check_at && status === "candidate" ? <div><dt>След. проверка</dt><dd>{dateLabel(deal.next_check_at)} {new Date(deal.next_check_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</dd></div> : null}
          </dl>

          {sources.length ? (
            <details className="source-list" open={sources.length <= 4}>
              <summary>Сравнения и источники · {sources.length}</summary>
              <ul>{sources.map((source) => (
                <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">
                  <span>{source.title || source.domain || "Источник"}</span>
                  <b>{euro(source.price ?? source.price_eur ?? null, true)}</b>
                  <small>{[source.domain || "marktplaats.nl", source.item_condition || source.condition, source.city].filter(Boolean).join(" · ")}</small>
                </a></li>
              ))}</ul>
            </details>
          ) : <p className="detail-muted">Ссылки на сравнения появятся после следующего сканирования: старые оценки сохранены без URL, а выдумывать их мы не будем.</p>}

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
