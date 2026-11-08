"use client";

import { useEffect, useState } from "react";
import type { CatalogCounts, FunnelStage, PriceChange, RejectedDeal, RunRecord, ScannerStats } from "@/lib/deals";
import { BreakdownBars, Funnel, LineChart, StackedBars } from "./charts";
import { ageLabel, euro, pct } from "./ui";

const fmt = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString("ru-RU");
const RANGES = [["day", "День"], ["week", "Неделя"], ["month", "Месяц"], ["all", "Всё время"]] as const;

type AnalyticsData = {
  range: string;
  scannedAt: string | null;
  overview: { catalog: number; best: number; good: number; watchlist: number; rejectedLastRun: number | null };
  finance: { totalProfit: number | null; averageProfit: number | null; maxProfit: number | null; averageDiscount: number | null; profitableCount: number };
  byCategory: Array<{ key: string; label: string; best: number; good: number; watchlist: number; profit: number }>;
  byBrand: Array<{ brand: string; best: number; good: number; watchlist: number; profit: number }>;
  appearances: Array<{ day: string; best: number; good: number }>;
  funnel: FunnelStage[];
  runs: RunRecord[];
  performance: { runs: number; lastDurationSeconds: number | null; lastListingsPerMinute: number | null; lastAvgMsPerListing: number | null;
    averageDurationSeconds: number | null; listingsPerMinute: number | null; errors: number; retries: number };
  priceChanges: PriceChange[];
  rejected: RejectedDeal[];
};

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return <div className={"metric-tile " + (tone || "")}><span>{label}</span><strong>{value}</strong>{hint ? <small>{hint}</small> : null}</div>;
}

export function Analytics({ stats, counts, scannedAt }: { stats: ScannerStats | null; counts: CatalogCounts | null; scannedAt: string | null }) {
  const [range, setRange] = useState<string>("week");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/analytics?range=" + range, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Аналитика недоступна");
        if (!cancelled) { setData(payload as AnalyticsData); setError(""); }
      })
      .catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : "Ошибка"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range]);

  const scanAgeHours = scannedAt ? (Date.now() - new Date(scannedAt).getTime()) / 3_600_000 : null;
  const runs = data?.runs || [];
  const runLabel = (run: RunRecord) => new Date(run.startedAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <section className="content-section analytics-section">
      <div className="section-heading">
        <div><h2>Аналитика</h2><p>Только реальные данные сканера и каталога · последний запуск {ageLabel(stats?.finishedAt || scannedAt)}</p></div>
        <span className={"scanner-live" + (scanAgeHours !== null && scanAgeHours > 3 ? " stale" : "")}><i /> {scanAgeHours !== null && scanAgeHours > 3 ? "Данные устарели" : "Радар активен"}</span>
      </div>
      <div className="seg compact" role="tablist" aria-label="Период">
        {RANGES.map(([key, label]) => <button type="button" key={key} className={range === key ? "on" : ""} onClick={() => setRange(key)}>{label}</button>)}
      </div>
      {error ? <p className="v2-note error-note"><span>{error}</span></p> : null}
      {loading && !data ? <div className="skeleton-card" /> : null}

      {data ? (
        <>
          <h3 className="analytics-title">Общая статистика · последний запуск</h3>
          <div className="metric-grid">
            <Tile label="Получено объявлений" value={fmt(stats?.checked)} hint={"уникальных " + fmt(stats?.unique) + " · повторов " + fmt(stats?.duplicates)} />
            <Tile label="Новых" value={fmt(stats?.newListings)} hint="впервые увидены" />
            <Tile label="Проверено" value={fmt(stats?.candidates)} hint={"с независимой рыночной ценой " + fmt(stats?.valued)} />
            <Tile label="В очереди" value={fmt((stats?.awaitingRecheck ?? 0) + (stats?.externalQueued ?? 0))} hint="переоценка и внешний поиск цен" />
            <Tile label="Best deals" value={fmt(data.overview.best)} tone="green" />
            <Tile label="Good deals" value={fmt(data.overview.good)} />
            <Tile label="На проверке" value={fmt(data.overview.watchlist)} hint="скрыты из каталога, пока нет подтверждённой прибыли" />
            <Tile label="Отклонено" value={fmt(stats?.rejectedTotal)} hint={"зарезервировано " + fmt(stats?.rejectedReserved)} />
            <Tile label="Ошибки" value={fmt(stats?.technicalErrors ?? stats?.failedQueries)} hint={"повторов " + fmt(stats?.retries)} tone={(stats?.technicalErrors ?? 0) ? "warn" : ""} />
          </div>

          <div className="analytics-card-block">
            <h3 className="analytics-title">Воронка обработки</h3>
            <p className="analytics-note">Почему из {fmt(stats?.checked)} объявлений в подборку попадают единицы: каждый этап и причины отсева.</p>
            <Funnel stages={data.funnel} />
          </div>

          <h3 className="analytics-title">Производительность</h3>
          <div className="metric-grid">
            <Tile label="Длительность цикла" value={data.performance.lastDurationSeconds != null ? Math.round(data.performance.lastDurationSeconds) + " с" : "—"} hint={"в среднем " + (data.performance.averageDurationSeconds != null ? Math.round(data.performance.averageDurationSeconds) + " с" : "—")} />
            <Tile label="Объявлений в минуту" value={fmt(data.performance.lastListingsPerMinute)} hint={"за период " + fmt(data.performance.listingsPerMinute)} />
            <Tile label="Время на объявление" value={data.performance.lastAvgMsPerListing != null ? fmt(data.performance.lastAvgMsPerListing) + " мс" : "—"} />
            <Tile label="Запусков за период" value={fmt(data.performance.runs)} hint={"ошибок " + fmt(data.performance.errors) + " · повторов " + fmt(data.performance.retries)} />
          </div>
          <div className="analytics-card-block">
            <LineChart label="уникальных объявлений за запуск" points={runs.map((run) => ({ x: runLabel(run), y: run.unique || 0 }))} />
          </div>

          <h3 className="analytics-title">Финансы каталога</h3>
          <div className="metric-grid">
            <Tile label="Потенциальная прибыль" value={euro(data.finance.totalProfit)} hint={data.finance.profitableCount + " выгодных предложений"} tone="green" />
            <Tile label="Средняя прибыль" value={euro(data.finance.averageProfit)} />
            <Tile label="Максимальная" value={euro(data.finance.maxProfit)} />
            <Tile label="Средняя скидка" value={pct(data.finance.averageDiscount)} />
          </div>
          <div className="analytics-card-block">
            <h3 className="analytics-title">Появление выгодных предложений</h3>
            <StackedBars rows={data.appearances.map((row) => ({ x: new Date(row.day).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }), best: row.best, good: row.good }))} />
          </div>
          <div className="analytics-card-block">
            <h3 className="analytics-title">По категориям</h3>
            <BreakdownBars rows={data.byCategory.slice(0, 12).map((row) => ({ label: row.label, best: row.best, good: row.good, watchlist: row.watchlist }))} />
          </div>
          <div className="analytics-card-block">
            <h3 className="analytics-title">По брендам</h3>
            <BreakdownBars rows={data.byBrand.map((row) => ({ label: row.brand, best: row.best, good: row.good, watchlist: row.watchlist }))} />
          </div>

          <div className="analytics-card-block">
            <h3 className="analytics-title">Изменение рыночных цен</h3>
            {data.priceChanges.length ? (
              <table className="data-table">
                <thead><tr><th>Модель</th><th>Было</th><th>Стало</th><th>Δ</th></tr></thead>
                <tbody>{data.priceChanges.map((row) => (
                  <tr key={row.key}><td>{row.key.replace("|", " · ").replace(/-/g, " ")}</td><td>{euro(row.previous)}</td><td>{euro(row.value)}</td>
                    <td className={row.change >= 0 ? "up" : "down"}>{row.change >= 0 ? "▲" : "▼"} {pct(Math.abs(row.change))}</td></tr>
                ))}</tbody>
              </table>
            ) : <p className="chart-empty">Изменения появятся, когда модели будут оценены повторно (история внешних оценок).</p>}
          </div>

          <div className="analytics-card-block">
            <h3 className="analytics-title">Rejected · последние отклонённые</h3>
            {data.rejected.length ? (
              <ul className="rejected-list">{data.rejected.slice(0, 30).map((row) => (
                <li key={row.listing_id}>
                  {row.listing_url ? <a href={row.listing_url} target="_blank" rel="noopener noreferrer">{row.title}</a> : <span>{row.title}</span>}
                  <small>{row.category_label} · {euro(row.price)}{row.market_value ? " · рынок " + euro(row.market_value) : ""} · {row.reason}</small>
                </li>
              ))}</ul>
            ) : <p className="chart-empty">В последнем запуске не было отклонённых после оценки прибыли.</p>}
          </div>

          {stats?.externalOfferDomains && Object.keys(stats.externalOfferDomains).length ? (
            <div className="analytics-card-block">
              <h3 className="analytics-title">Независимые источники цен</h3>
              <BreakdownBars rows={Object.entries(stats.externalOfferDomains).slice(0, 10).map(([domain, count]) => ({ label: domain, best: count, good: 0, watchlist: 0 }))} />
              <p className="analytics-note">Каталог: {fmt(counts?.feed)} объявлений. Marktplaats в рыночную оценку не входит.</p>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
