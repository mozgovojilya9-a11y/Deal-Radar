"use client";

import { useEffect, useState } from "react";
import type { Deal, RunRecord, ScannerStats } from "@/lib/deals";
import { DealCard } from "./DealCard";
import { LineChart } from "./charts";
import { ageLabel, euro } from "./ui";

const fmt = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString("ru-RU");

export function Dashboard({ deals, stats, scannedAt, saved, onSave, onOpen, onShowAll }: {
  deals: Deal[];
  stats: ScannerStats | null;
  scannedAt: string | null;
  saved: string[];
  onSave: (id: string) => void;
  onOpen: (deal: Deal) => void;
  onShowAll: (tier: "strong" | "good" | "all") => void;
}) {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  useEffect(() => {
    fetch("/api/analytics?range=week").then((r) => r.ok ? r.json() : null).then((data) => { if (data?.runs) setRuns(data.runs); }).catch(() => undefined);
  }, []);
  const best = deals.filter((deal) => deal.status === "strong");
  const good = deals.filter((deal) => deal.status === "good");
  const profit = [...best, ...good].reduce((sum, deal) => sum + (Number(deal.estimated_profit) || 0), 0);
  const latest = [...best, ...good].sort((a, b) => Date.parse(b.first_detected_at || b.detected_at) - Date.parse(a.first_detected_at || a.detected_at)).slice(0, 6);
  const ageHours = scannedAt ? (Date.now() - Date.parse(scannedAt)) / 3_600_000 : null;
  const healthy = ageHours !== null && ageHours <= 3;

  return (
    <section className="content-section dashboard">
      <div className="dash-hero">
        <div>
          <span className={"radar-status " + (healthy ? "ok" : "stale")}><i />{healthy ? "Радар активен" : "Данные устарели"}</span>
          <h1>Обзор рынка</h1>
          <p>Последнее сканирование {ageLabel(scannedAt)}{stats?.durationSeconds ? " · цикл " + Math.round(stats.durationSeconds) + " с" : ""}{stats?.listingsPerMinute ? " · " + fmt(stats.listingsPerMinute) + " объявл./мин" : ""}</p>
        </div>
        <div className="dash-profit">
          <span>Потенциальная прибыль</span>
          <strong>{euro(profit)}</strong>
          <small>{best.length + good.length} выгодных предложений после всех расходов</small>
        </div>
      </div>
      <div className="dash-kpis">
        <button type="button" className="kpi best" onClick={() => onShowAll("strong")}><span>Best deals</span><strong>{fmt(best.length)}</strong></button>
        <button type="button" className="kpi good" onClick={() => onShowAll("good")}><span>Good deals</span><strong>{fmt(good.length)}</strong></button>
        <div className="kpi"><span>Ждут оценки рынка</span><strong>{fmt(stats?.externalQueued)}</strong></div>
        <div className="kpi"><span>Проверено за запуск</span><strong>{fmt(stats?.unique)}</strong></div>
      </div>
      <div className="analytics-card-block">
        <div className="block-head"><h3>Активность радара</h3><small>уникальных объявлений за запуск, 7 дней</small></div>
        <LineChart label="уникальных объявлений за запуск" points={runs.map((run) => ({ x: new Date(run.startedAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), y: run.unique || 0 }))} />
      </div>
      <div className="block-head"><h3>Последние выгодные находки</h3><button type="button" className="link-button" onClick={() => onShowAll("all")}>Весь каталог →</button></div>
      {latest.length ? (
        <div className="deal-grid">{latest.map((deal) => <DealCard key={deal.listing_id} deal={deal} saved={saved.includes(deal.listing_id)} onSave={() => onSave(deal.listing_id)} onOpen={() => onOpen(deal)} />)}</div>
      ) : <p className="chart-empty">Сейчас нет предложений с подтверждённой прибылью. Радар показывает только то, что выгодно по независимым ценам.</p>}
    </section>
  );
}
