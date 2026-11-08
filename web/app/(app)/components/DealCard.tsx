"use client";

import type { Deal } from "@/lib/deals";
import { CONFIDENCE_LABEL, STATUS_LABEL, dateLabel, euro } from "./ui";

export function distanceOf(deal: Deal): number | null {
  if (deal.user_distance_km != null) return deal.user_distance_km;
  return deal.distance_km != null && deal.distance_km >= 0 ? deal.distance_km : null;
}

export function DealCard({ deal, saved, isNew, onSave, onOpen }: { deal: Deal; saved: boolean; isNew?: boolean; onSave: () => void; onOpen: () => void }) {
  const status = deal.status || "candidate";
  const candidate = status === "candidate";
  const discount = deal.discount == null ? null : Math.max(0, Math.round(Number(deal.discount) * 100));
  const distance = distanceOf(deal);
  const confidence = deal.market_confidence === "high" ? "High" : deal.market_confidence === "preliminary" || deal.market_confidence === "retail_proxy" ? "Medium" : "Low";
  const evidence = deal.external_sources
    ? deal.external_sources + " незав. источн. · " + (CONFIDENCE_LABEL[deal.market_confidence || "none"] || "—")
    : "независимая оценка в очереди";
  return (
    <article className={"deal-card" + (candidate ? " candidate-card" : status === "good" ? " good-card" : "")}>
      <button className="image-button" onClick={onOpen} aria-label={"Открыть " + deal.title}>
        <div className="deal-image">
          {deal.image_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={deal.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" />
            : <span className="image-fallback" aria-hidden="true">▣</span>}
          <span className={"discount-pill" + (candidate ? " candidate-pill" : status === "good" ? " good-pill" : "")}>
            {discount === null ? "Проверка" : (candidate ? "≈ −" : "−") + discount + "%"}
          </span>
          {isNew ? <span className="fresh-pill">новое</span> : deal.status_changed && !candidate ? <span className="fresh-pill">повышен</span> : null}
        </div>
      </button>
      <div className="deal-content">
        <div className="deal-meta"><span>{deal.category_label}</span><span>{dateLabel(deal.posted_at || deal.first_detected_at || deal.detected_at)}</span></div>
        <div className={"deal-status " + status}>{STATUS_LABEL[status]}{deal.price_type === "MIN_BID" ? " · bieden" : ""}</div>
        <button className="deal-title" onClick={onOpen}>{deal.title}</button>
        <div className="price-row">
          <strong>{euro(deal.price)}</strong>
          <span className="old-price">{(deal.market_value ?? (deal.price_reference_type === "external_used" || deal.price_reference_type === "new_retail" ? deal.market_price : null)) != null
            ? "рынок ≈ " + euro(deal.market_value ?? deal.market_price) : "рынок уточняется"}</span>
        </div>
        {deal.estimated_profit != null ? (
          <div className={"saving-line" + (candidate ? " preliminary-saving" : "")}>
            <span>{candidate ? "Предварительно" : "Прибыль после расходов"}</span>
            <strong>{euro(deal.estimated_profit)}{deal.profit_roi != null ? <em>ROI {Math.round(deal.profit_roi * 100)}%</em> : null}</strong>
          </div>
        ) : <p className="candidate-explanation">{deal.evaluation_reason || "Недостаточно сопоставимых цен."}</p>}
        {!candidate && deal.max_offer_price ? <p className="offer-line">Торг: начни с {euro(deal.opening_offer_price)}, максимум {euro(deal.max_offer_price)}</p> : null}
        <div className="evidence-line" title="Независимые источники рыночной цены и уверенность оценки">
          <span className={"confidence-badge c-" + confidence.toLowerCase()}>{confidence}</span>{evidence}
          {deal.discount != null && deal.discount > 0 ? <span className="discount-text"> · −{Math.round(deal.discount * 100)}%</span> : null}
        </div>
        <div className="card-footer">
          <span className="location">{deal.city || "Нидерланды"}{distance != null ? <b className="distance"> · {Math.round(distance)} км</b> : null}</span>
          <button className={"save-button" + (saved ? " active" : "")} onClick={onSave} aria-pressed={saved} aria-label={saved ? "Убрать из избранного" : "В избранное"}>{saved ? "♥" : "♡"}</button>
        </div>
      </div>
    </article>
  );
}
