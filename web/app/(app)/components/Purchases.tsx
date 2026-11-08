"use client";

import { useState } from "react";
import { markSold, purchaseSummary, removePurchase, type Purchase } from "@/lib/purchases";
import { dateLabel, euro } from "./ui";

const signed = (value: number) => (value >= 0 ? "+" : "−") + euro(Math.abs(value), true);

export function Purchases({ rows, onChange }: { rows: Purchase[]; onChange: (rows: Purchase[]) => void }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const summary = purchaseSummary(rows);
  if (!rows.length) return <div className="state-panel"><div className="state-icon">€</div><h3>Покупок пока нет</h3><p>Откройте объявление и нажмите «Я купил», чтобы считать реальную прибыль.</p></div>;
  const sell = (id: string) => {
    const value = Number((drafts[id] || "").replace(",", "."));
    if (Number.isFinite(value) && value > 0) onChange(markSold(rows, id, value));
  };
  return (
    <div className="purchases">
      <div className="metric-grid">
        <div className="metric-tile green"><span>Реальная прибыль</span><strong>{signed(summary.realizedProfit)}</strong><small>продано {summary.soldCount} из {summary.count}</small></div>
        <div className="metric-tile"><span>В товаре</span><strong>{euro(summary.inStock)}</strong><small>ожидаемая прибыль {signed(summary.expectedProfit)}</small></div>
      </div>
      {rows.map((row) => (
        <article className="purchase-row" key={row.id}>
          <div className="purchase-main">
            {row.url ? <a href={row.url} target="_blank" rel="noopener noreferrer">{row.title}</a> : <span>{row.title}</span>}
            <small>куплено {dateLabel(row.boughtAt)} за {euro(row.paid, true)}{row.soldFor === null && row.expectedProfit != null ? " · ожидалось " + signed(row.expectedProfit) : ""}</small>
          </div>
          {row.soldFor !== null ? (
            <div className="purchase-sold">
              <b className={row.soldFor >= row.paid ? "up" : "down"}>{signed(row.soldFor - row.paid)}</b>
              <button type="button" className="link-button" onClick={() => onChange(markSold(rows, row.id, null))}>Отменить продажу</button>
            </div>
          ) : (
            <form className="purchase-sell" onSubmit={(event) => { event.preventDefault(); sell(row.id); }}>
              <input inputMode="decimal" placeholder="Продал за, €" aria-label={"Цена продажи: " + row.title} value={drafts[row.id] || ""} onChange={(event) => setDrafts({ ...drafts, [row.id]: event.target.value })} />
              <button type="submit" className="secondary-button">Продано</button>
              <button type="button" className="icon-text" aria-label={"Удалить: " + row.title} onClick={() => onChange(removePurchase(rows, row.id))}>×</button>
            </form>
          )}
        </article>
      ))}
    </div>
  );
}
