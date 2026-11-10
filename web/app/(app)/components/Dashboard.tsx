"use client";

import { useEffect, useState } from "react";
import type { Deal, RunRecord, ScannerStats } from "@/lib/deals";
import { DealCard } from "./DealCard";
import { RadarScope } from "./RadarScope";
import { LineChart } from "./charts";
import { ageLabel, euro } from "./ui";

const fmt = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString("ru-RU");

export function Dashboard({ deals, stats, scannedAt, lastLoaded, saved, onSave, onOpen, onShowAll, onShowDrops }: {
  deals: Deal[];
  stats: ScannerStats | null;
  scannedAt: string | null;
  /** When the catalogue was last loaded: the reference time for "how old is the scan". */
  lastLoaded: number | null;
  saved: string[];
  onSave: (id: string) => void;
  onOpen: (deal: Deal) => void;
  onShowAll: (tier: "strong" | "good" | "candidate" | "all") => void;
  onShowDrops: () => void;
}) {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  useEffect(() => {
    fetch("/api/analytics?range=week").then((r) => r.ok ? r.json() : null).then((data) => { if (data?.runs) setRuns(data.runs); }).catch(() => undefined);
  }, []);
  const profitable = deals.filter((deal) => deal.status === "strong" || deal.status === "good");
  const best = profitable.filter((deal) => deal.status === "strong");
  const waiting = deals.length - profitable.length;
  const drops = profitable.filter((deal) => deal.price_dropped_at);
  const profit = profitable.reduce((sum, deal) => sum + (Number(deal.estimated_profit) || 0), 0);
  const top = [...profitable].sort((a, b) => (b.deal_score ?? 0) - (a.deal_score ?? 0) || (b.estimated_profit ?? 0) - (a.estimated_profit ?? 0)).slice(0, 6);
  const ageHours = scannedAt && lastLoaded ? (lastLoaded - Date.parse(scannedAt)) / 3_600_000 : null;
  const healthy = ageHours !== null && ageHours <= 3;

  return (
    <section className="content-section dashboard">
      <div className="dash-hero">
        <div className="dash-intro">
          <span className={"radar-status " + (healthy ? "ok" : "stale")}><i />{healthy ? "Радар активен" : scannedAt ? "Данные устарели" : "Ожидаем данные"}</span>
          <h1>Обзор рынка</h1>
          <p>Сканирование {ageLabel(scannedAt)}{stats?.unique ? " · проверено " + fmt(stats.unique) + " объявлений" : ""}{stats?.durationSeconds ? " за " + Math.round(stats.durationSeconds) + " с" : ""}</p>
          <div className="dash-profit">
            <span>Потенциальная прибыль</span>
            <strong>{euro(profit)}</strong>
            <small>{profitable.length} выгодных после торга, комиссий и расходов</small>
          </div>
        </div>
        <RadarScope deals={profitable} waiting={waiting} onOpen={onOpen} />
      </div>

      <div className="dash-kpis">
        <button type="button" className="kpi best" onClick={() => onShowAll("strong")}><span>Best deals</span><strong>{fmt(best.length)}</strong></button>
        <button type="button" className="kpi good" onClick={() => onShowAll("good")}><span>Good deals</span><strong>{fmt(profitable.length - best.length)}</strong></button>
        <button type="button" className="kpi drop" onClick={onShowDrops} disabled={!drops.length}><span>Цена снижена</span><strong>{fmt(drops.length)}</strong></button>
        <button type="button" className="kpi watch" onClick={() => onShowAll("candidate")}><span>Ждут оценки</span><strong>{fmt(waiting)}</strong></button>
      </div>

      <div className="block-head"><h3>Лучшие сейчас</h3><button type="button" className="link-button" onClick={() => onShowAll("all")}>Весь каталог →</button></div>
      {top.length ? (
        <div className="deal-grid">{top.map((deal) => <DealCard key={deal.listing_id} deal={deal} saved={saved.includes(deal.listing_id)} onSave={() => onSave(deal.listing_id)} onOpen={() => onOpen(deal)} />)}</div>
      ) : <p className="chart-empty">Сейчас нет предложений с подтверждённой прибылью. Радар показывает только то, что выгодно по независимым ценам.</p>}

      <div className="analytics-card-block">
        <div className="block-head"><h3>Активность радара</h3><small>уникальных объявлений за запуск, 7 дней</small></div>
        <LineChart label="уникальных объявлений за запуск" points={runs.map((run) => ({ x: new Date(run.startedAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), y: run.unique || 0 }))} />
      </div>
    </section>
  );
}
