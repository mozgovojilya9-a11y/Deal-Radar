"use client";

import { useMemo, useState } from "react";
import type { Deal } from "@/lib/deals";
import { radarPoints, type RadarPoint } from "@/lib/radar";
import { ScoreRing, euro } from "./ui";

export function RadarScope({ deals, waiting, onOpen }: { deals: Deal[]; waiting: number; onOpen: (deal: Deal) => void }) {
  const points = useMemo(() => radarPoints(deals), [deals]);
  const best = points.reduce<RadarPoint | null>((top, point) => !top || (point.deal.deal_score ?? 0) > (top.deal.deal_score ?? 0) ? point : top, null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = points.find((point) => point.deal.listing_id === selectedId) ?? best;

  return (
    <div className="radar">
      <div className="radar-scope" role="group" aria-label={"Радар: " + points.length + " выгодных предложений. Ближе к центру — выше балл сделки."}>
        <svg viewBox="0 0 100 100" aria-hidden="true">
          {[46, 34, 22, 10].map((r) => <circle key={r} cx="50" cy="50" r={r} className="radar-ring" />)}
          <line x1="4" y1="50" x2="96" y2="50" className="radar-axis" />
          <line x1="50" y1="4" x2="50" y2="96" className="radar-axis" />
          <text x="50" y="7.5" className="radar-label">слабее</text>
          <text x="50" y="44" className="radar-label">лучше</text>
        </svg>
        <div className="radar-sweep" aria-hidden="true" />
        {points.map((point) => (
          <button type="button" key={point.deal.listing_id}
            className={"radar-dot " + (point.deal.status === "strong" ? "strong" : "good") + (point.deal.price_dropped_at ? " dropped" : "") + (selected?.deal.listing_id === point.deal.listing_id ? " on" : "")}
            style={{ left: point.x + "%", top: point.y + "%", width: point.size, height: point.size }}
            aria-label={point.deal.title + ", прибыль " + euro(point.deal.estimated_profit) + ", балл " + (point.deal.deal_score ?? "—")}
            aria-pressed={selected?.deal.listing_id === point.deal.listing_id}
            onClick={() => setSelectedId(point.deal.listing_id)} />
        ))}
        {!points.length ? <p className="radar-empty">Сейчас выгодных нет<br /><small>{waiting ? waiting + " объявлений ждут оценки" : "радар продолжает поиск"}</small></p> : null}
      </div>
      {selected ? (
        <button type="button" className="radar-pick" onClick={() => onOpen(selected.deal)}>
          {selected.deal.deal_score != null ? <ScoreRing score={selected.deal.deal_score} size={42} /> : null}
          <span className="radar-pick-text">
            <small>{selected.group}{selected.deal.price_dropped_at ? " · ↓ цена снижена" : ""}</small>
            <strong>{selected.deal.title}</strong>
            <span>{euro(selected.deal.price)} · прибыль <b>{euro(selected.deal.estimated_profit)}</b></span>
          </span>
          <span className="radar-pick-go" aria-hidden="true">›</span>
        </button>
      ) : null}
      <div className="radar-legend" aria-hidden="true">
        <span><i className="strong" />Best</span><span><i className="good" />Good</span><span><i className="dropped" />цена снижена</span><span>крупнее — больше прибыль</span>
      </div>
    </div>
  );
}
