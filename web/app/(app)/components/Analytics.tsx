"use client";

import { useEffect, useMemo, useState } from "react";
import type { CatalogCounts, Deal, FunnelStage, PriceChange, RejectedDeal, RunRecord, ScannerStats } from "@/lib/deals";
import { purchaseInsights, type CategoryStat, type MarketPoint, type PeriodSummary } from "@/lib/analytics";
import type { Purchase } from "@/lib/purchases";
import { BreakdownBars, Funnel, LineChart, PriceMarketChart, SignedBars, StackedBars } from "./charts";
import { ageLabel, dateLabel, euro, pct } from "./ui";

const fmt = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString("ru-RU");
const signed = (value: number) => (value >= 0 ? "+" : "−") + euro(Math.abs(value));
const RANGES = [["day", "24 часа"], ["week", "Неделя"], ["month", "Месяц"], ["all", "Всё время"]] as const;
const RANGE_TEXT: Record<string, string> = { day: "за 24 часа", week: "за неделю", month: "за месяц", all: "за всё время" };
const VIEWS = [["market", "Рынок"], ["mine", "Мои сделки"], ["radar", "Радар"]] as const;
type View = typeof VIEWS[number][0];

type AnalyticsData = {
  range: string;
  scannedAt: string | null;
  overview: { catalog: number; best: number; good: number; watchlist: number; rejectedLastRun: number | null };
  finance: { totalProfit: number | null; averageProfit: number | null; maxProfit: number | null; averageDiscount: number | null; profitableCount: number };
  byBrand: Array<{ brand: string; best: number; good: number; watchlist: number; profit: number }>;
  appearances: Array<{ day: string; best: number; good: number }>;
  funnel: FunnelStage[];
  runs: RunRecord[];
  performance: { runs: number; lastDurationSeconds: number | null; lastListingsPerMinute: number | null; lastAvgMsPerListing: number | null;
    averageDurationSeconds: number | null; listingsPerMinute: number | null; errors: number; retries: number };
  period: PeriodSummary;
  categories: CategoryStat[];
  points: MarketPoint[];
  scoreBands: Array<{ band: string; count: number }>;
  sources: Record<string, { ok: number; failed: number; parsed: number; lastError: string | null }>;
  queue: { awaitingRecheck: number | null; externalQueued: number | null; externalResearched: number | null; externalValued: number | null };
  priceChanges: PriceChange[];
  rejected: RejectedDeal[];
};

type SortKey = "label" | "profitable" | "profit" | "avgProfit" | "avgScore" | "waiting";
const COLUMNS: Array<[SortKey, string]> = [["label", "Категория"], ["profitable", "Выгодных"], ["profit", "Прибыль"], ["avgProfit", "Ср. прибыль"], ["avgScore", "Ср. балл"], ["waiting", "Ждут цены"]];

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return <div className={"metric-tile " + (tone || "")}><span>{label}</span><strong>{value}</strong>{hint ? <small>{hint}</small> : null}</div>;
}

/** What the scanner did in the chosen period: these numbers change with the period. */
function PeriodBlock({ period, view }: { period: PeriodSummary; view: "market" | "radar" }) {
  const label = (at: string) => period.period === "day"
    ? new Date(at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    : new Date(at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  const text = RANGE_TEXT[period.period];
  return (
    <>
      {!period.complete && period.historyStart ? (
        <p className="v2-note"><span>История сканера есть только с {new Date(period.historyStart).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })} — данные {text} неполные.</span></p>
      ) : null}
      <div className="metric-grid">
        {view === "market" ? <>
          <Tile label={"Новых выгодных " + text} value={fmt(period.newDeals)} hint="впервые признаны Best или Good" tone="green" />
          <Tile label="Новых объявлений" value={fmt(period.newListings)} hint="впервые увидены радаром" />
        </> : <>
          <Tile label={"Запусков " + text} value={fmt(period.runs)} hint={period.avgDurationSeconds != null ? "в среднем " + period.avgDurationSeconds + " с на цикл" : undefined} />
          <Tile label="Ошибок" value={fmt(period.errors)} hint={period.runs ? (period.errors / period.runs).toFixed(1) + " на запуск" : undefined} tone={period.errors ? "warn" : ""} />
        </>}
        <Tile label="Просмотрено объявлений" value={fmt(period.received)} hint={fmt(period.runs) + " запусков"} />
        <Tile label="Прибыль каталога" value={euro(period.series.at(-1)?.catalogProfit ?? null)} hint={"на конец периода · " + (period.series.at(-1) ? (period.series.at(-1)!.best + period.series.at(-1)!.good) + " выгодных" : "—")} />
      </div>
      <div className="analytics-card-block">
        <h3 className="analytics-title">{view === "market" ? "Новые выгодные " + text : "Новые объявления " + text}</h3>
        <SignedBars unit="" rows={period.series.map((row) => ({ x: label(row.at), y: view === "market" ? row.newDeals : row.newListings }))} />
        <p className="analytics-note">{period.period === "day" ? "По часам." : "По дням."} {view === "market" ? "Сколько объявлений радар впервые признал выгодными." : "Сколько объявлений радар увидел впервые."}</p>
      </div>
      {view === "market" ? (
        <div className="analytics-card-block">
          <h3 className="analytics-title">Потенциальная прибыль каталога {text}</h3>
          <LineChart unit=" €" label="прибыль выгодных в каталоге" points={period.series.map((row) => ({ x: label(row.at), y: Math.round(row.catalogProfit) }))} />
        </div>
      ) : null}
    </>
  );
}

/** A listing card from a chart point; the card loads the rest of the listing by id when it opens. */
function pointDeal(point: MarketPoint): Deal {
  return { ...point, market_price: point.market_value ?? null, description: undefined as unknown as null, model_group: null, city: null, distance_km: null,
    warning_flags: null, posted_at: null, active: true, discount: point.discount ?? null } as Deal;
}

export function Analytics({ stats, counts, scannedAt, lastLoaded, purchases, onOpen, onCategory }: {
  stats: ScannerStats | null; counts: CatalogCounts | null; scannedAt: string | null; lastLoaded: number | null;
  purchases: Purchase[]; onOpen: (deal: Deal) => void; onCategory: (key: string) => void;
}) {
  const [view, setView] = useState<View>("market");
  const [range, setRange] = useState<string>("week");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pointCategory, setPointCategory] = useState("");
  const [sortBy, setSortBy] = useState<{ key: SortKey; desc: boolean }>({ key: "profit", desc: true });

  useEffect(() => {
    let cancelled = false;
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

  const insights = useMemo(() => purchaseInsights(purchases), [purchases]);
  const categories = useMemo(() => {
    const rows = [...(data?.categories || [])];
    const { key, desc } = sortBy;
    return rows.sort((a, b) => {
      const left = a[key], right = b[key];
      if (typeof left === "string" || typeof right === "string") return (desc ? -1 : 1) * String(left).localeCompare(String(right), "ru");
      return (desc ? -1 : 1) * ((left ?? -Infinity) - (right ?? -Infinity));
    });
  }, [data, sortBy]);
  const points = useMemo(() => (data?.points || []).filter((point) => !pointCategory || point.category_key === pointCategory), [data, pointCategory]);
  const profitablePoints = (data?.points || []).filter((point) => point.status === "strong" || point.status === "good");
  const avgScore = profitablePoints.length ? Math.round(profitablePoints.reduce((sum, point) => sum + (point.deal_score ?? 0), 0) / profitablePoints.length) : null;
  const scanAgeHours = scannedAt && lastLoaded ? (lastLoaded - new Date(scannedAt).getTime()) / 3_600_000 : null;
  const runs = data?.runs || [];
  const runLabel = (run: RunRecord) => new Date(run.startedAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const openPoint = (id: string) => { const point = data?.points.find((row) => row.listing_id === id); if (point) onOpen(pointDeal(point)); };
  const maxBand = Math.max(1, ...(data?.scoreBands || []).map((band) => band.count));

  return (
    <section className="content-section analytics-section">
      <div className="section-heading">
        <div><h2>Аналитика</h2><p>Только реальные данные сканера, каталога и ваших покупок · запуск {ageLabel(stats?.finishedAt || scannedAt)}</p></div>
        <span className={"scanner-live" + (scanAgeHours !== null && scanAgeHours > 3 ? " stale" : "")}><i /> {scanAgeHours !== null && scanAgeHours > 3 ? "Данные устарели" : "Радар активен"}</span>
      </div>
      <div className="seg" role="tablist" aria-label="Раздел аналитики">
        {VIEWS.map(([key, label]) => <button type="button" role="tab" aria-selected={view === key} key={key} className={view === key ? "on" : ""} onClick={() => setView(key)}>{label}{key === "mine" && purchases.length ? <b>{purchases.length}</b> : null}</button>)}
      </div>
      {view !== "mine" ? (
        <div className="seg compact period-seg" role="tablist" aria-label="Период">
          {RANGES.map(([key, label]) => <button type="button" role="tab" aria-selected={range === key} key={key} className={range === key ? "on" : ""} onClick={() => setRange(key)}>{label}</button>)}
        </div>
      ) : null}
      {error ? <p className="v2-note error-note"><span>{error}</span></p> : null}
      {loading && !data && view !== "mine" ? <div className="skeleton-card"><div /><span /><span /></div> : null}

      {view === "market" && data ? (
        <>
          {data.period ? <PeriodBlock period={data.period} view="market" /> : null}
          <h3 className="analytics-title snapshot-title">Сейчас в каталоге <small>не зависит от периода</small></h3>
          <div className="metric-grid">
            <Tile label="Потенциальная прибыль" value={euro(data.finance.totalProfit)} hint={data.finance.profitableCount + " выгодных сейчас"} tone="green" />
            <Tile label="Средняя прибыль" value={euro(data.finance.averageProfit)} hint={"максимум " + euro(data.finance.maxProfit)} />
            <Tile label="Средний балл" value={avgScore === null ? "—" : String(avgScore)} hint="из 100 у выгодных" />
            <Tile label="Средняя скидка" value={pct(data.finance.averageDiscount)} hint="к независимой цене" />
          </div>

          <div className="analytics-card-block">
            <div className="block-head"><h3 className="analytics-title">Цена против рынка</h3>
              <label className="mini-select"><span className="sr-only">Категория</span>
                <select value={pointCategory} onChange={(event) => setPointCategory(event.target.value)}>
                  <option value="">Все категории</option>
                  {data.categories.filter((row) => row.valued).map((row) => <option key={row.key} value={row.key}>{row.label} · {row.valued}</option>)}
                </select>
              </label>
            </div>
            <PriceMarketChart points={points.map((point) => ({ id: point.listing_id, price: point.price, market: point.market_value as number, status: point.status, title: point.title }))} onPick={openPoint} />
            <p className="analytics-note">Каждая точка — объявление с независимой рыночной ценой. Чем выше над диагональю, тем дешевле рынка.</p>
          </div>

          <div className="analytics-card-block">
            <h3 className="analytics-title">Категории</h3>
            <p className="analytics-note first">Нажмите на заголовок, чтобы отсортировать, на строку — чтобы открыть находки категории.</p>
            <div className="table-scroll">
              <table className="data-table sortable">
                <thead><tr>{COLUMNS.map(([key, label]) => (
                  <th key={key} aria-sort={sortBy.key === key ? (sortBy.desc ? "descending" : "ascending") : "none"}>
                    <button type="button" onClick={() => setSortBy((current) => ({ key, desc: current.key === key ? !current.desc : key !== "label" }))}>
                      {label}{sortBy.key === key ? (sortBy.desc ? " ↓" : " ↑") : ""}
                    </button>
                  </th>
                ))}</tr></thead>
                <tbody>{categories.map((row) => (
                  <tr key={row.key} className="row-link" tabIndex={0} onClick={() => onCategory(row.key)} onKeyDown={(event) => { if (event.key === "Enter") onCategory(row.key); }}>
                    <td>{row.label}</td>
                    <td>{row.profitable ? <b>{row.profitable}</b> : "—"}{row.best ? <small> · {row.best} best</small> : null}</td>
                    <td>{row.profit ? euro(row.profit) : "—"}</td>
                    <td>{euro(row.avgProfit)}</td>
                    <td>{row.avgScore ?? "—"}</td>
                    <td className={row.waiting > row.total / 2 ? "warn" : ""}>{row.waiting} <small>из {row.total}</small></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>

          <div className="analytics-card-block">
            <h3 className="analytics-title">Качество выгодных сделок</h3>
            <div className="band-bars">{data.scoreBands.map((band) => (
              <div key={band.band}><span>{band.band}</span><i><em style={{ width: (band.count / maxBand) * 100 + "%" }} /></i><b>{band.count}</b></div>
            ))}</div>
            <p className="analytics-note">Распределение по баллу сделки: прибыль, окупаемость, доказательность, ликвидность, свежесть и риски.</p>
          </div>

          <div className="analytics-card-block">
            <h3 className="analytics-title">Текущие выгодные: когда найдены {RANGE_TEXT[range]}</h3>
            <StackedBars rows={data.appearances.map((row) => ({ x: new Date(row.day).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }), best: row.best, good: row.good }))} />
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
            ) : <p className="chart-empty">Изменения появятся, когда модели будут оценены повторно.</p>}
          </div>
        </>
      ) : null}

      {view === "mine" ? (
        purchases.length ? (
          <>
            <div className="metric-grid">
              <Tile label="Реальная прибыль" value={signed(insights.realizedProfit)} hint={"продано " + insights.sold + " из " + insights.bought} tone={insights.realizedProfit >= 0 ? "green" : "warn"} />
              <Tile label="ROI проданных" value={pct(insights.realizedRoi)} hint={"вложено всего " + euro(insights.invested)} />
              <Tile label="В товаре" value={euro(insights.inStock)} hint={"ожидается " + signed(insights.expectedOpen)} />
              <Tile label="Срок продажи" value={insights.avgDaysToSell === null ? "—" : insights.avgDaysToSell + " дн"} hint="от покупки до продажи" />
            </div>
            <div className="analytics-card-block">
              <h3 className="analytics-title">Прибыль по месяцам</h3>
              <SignedBars rows={insights.months.map((row) => ({ x: new Date(row.month + "-01").toLocaleDateString("ru-RU", { month: "short", year: "2-digit" }), y: row.profit }))} />
            </div>
            <div className="analytics-card-block">
              <h3 className="analytics-title">Точность прогноза радара</h3>
              {insights.forecastAccuracy === null ? <p className="chart-empty">Появится после первой продажи покупки, у которой был прогноз прибыли.</p> : (
                <p className="forecast-line"><strong className={insights.forecastAccuracy >= 0.9 ? "good" : insights.forecastAccuracy >= 0.6 ? "fair" : "weak"}>{Math.round(insights.forecastAccuracy * 100)}%</strong>
                  <span>прогнозной прибыли вы получили на деле. {insights.forecastAccuracy >= 1 ? "Радар оценивает осторожно." : "Торгуйтесь ближе к рекомендованной цене или проверяйте оценку внимательнее."}</span></p>
              )}
              {insights.best ? <p className="analytics-note">Лучшая сделка: <b>{insights.best.title}</b> — {signed((insights.best.soldFor as number) - insights.best.paid)}{insights.worst ? <> · худшая: <b>{insights.worst.title}</b> — {signed((insights.worst.soldFor as number) - insights.worst.paid)}</> : null}</p> : null}
            </div>
            <p className="analytics-note">Покупки хранятся на этом устройстве. Отмечайте продажи во вкладке «Избранное → Мои покупки».</p>
          </>
        ) : <div className="state-panel"><div className="state-icon">€</div><h3>Здесь будет ваша реальная прибыль</h3><p>Откройте объявление и нажмите «Я купил». Когда продадите — отметьте цену продажи во «Избранное → Мои покупки». Здесь появятся прибыль, ROI, срок продажи и точность прогнозов радара.</p></div>
      ) : null}

      {view === "radar" && data ? (
        <>
          {data.period ? <PeriodBlock period={data.period} view="radar" /> : null}
          <h3 className="analytics-title snapshot-title">Последний запуск <small>{ageLabel(stats?.finishedAt || scannedAt)}</small></h3>
          <div className="metric-grid">
            <Tile label="Получено объявлений" value={fmt(stats?.checked)} hint={"уникальных " + fmt(stats?.unique) + " · повторов " + fmt(stats?.duplicates)} />
            <Tile label="Новых" value={fmt(stats?.newListings)} hint="впервые увидены" />
            <Tile label="Оценено за запуск" value={fmt(data.queue.externalValued)} hint={"моделей проверено " + fmt(data.queue.externalResearched)} tone="green" />
            <Tile label="В очереди" value={fmt((data.queue.awaitingRecheck ?? 0) + (data.queue.externalQueued ?? 0))} hint={"моделей на поиск цен " + fmt(data.queue.externalQueued)} />
            <Tile label="Ждут оценки" value={fmt(data.overview.watchlist)} hint="без независимой цены" />
            <Tile label="Отклонено" value={fmt(stats?.rejectedTotal)} hint={"зарезервировано " + fmt(stats?.rejectedReserved)} />
            <Tile label="Ошибки" value={fmt(stats?.technicalErrors ?? stats?.failedQueries)} hint={"повторов " + fmt(stats?.retries)} tone={(stats?.technicalErrors ?? 0) ? "warn" : ""} />
            <Tile label="Цикл" value={data.performance.lastDurationSeconds != null ? Math.round(data.performance.lastDurationSeconds) + " с" : "—"} hint={fmt(data.performance.lastListingsPerMinute) + " объявл./мин"} />
          </div>

          <div className="analytics-card-block">
            <h3 className="analytics-title">Воронка обработки</h3>
            <p className="analytics-note first">Почему из {fmt(stats?.checked)} объявлений в подборку попадают единицы.</p>
            <Funnel stages={data.funnel} />
          </div>

          <div className="analytics-card-block">
            <h3 className="analytics-title">Источники цен · последний запуск</h3>
            <p className="analytics-note first">Сколько раз площадка ответила на запросы моделей и сколько предложений вернула.</p>
            {Object.keys(data.sources).length ? (
              <table className="data-table">
                <thead><tr><th>Площадка</th><th>Ответила</th><th>Найдено</th><th>Последняя ошибка</th></tr></thead>
                <tbody>{Object.entries(data.sources).sort((a, b) => b[1].parsed - a[1].parsed).map(([name, row]) => {
                  const rate = row.ok + row.failed ? row.ok / (row.ok + row.failed) : null;
                  return (
                    <tr key={name}><td>{name}</td>
                      <td className={rate === null ? "" : rate >= 0.8 ? "up" : rate >= 0.4 ? "warn" : "down"}>{rate === null ? "—" : Math.round(rate * 100) + "%"} <small>{row.ok}/{row.ok + row.failed}</small></td>
                      <td>{fmt(row.parsed)}</td><td><small>{row.lastError || "—"}</small></td></tr>
                  );
                })}</tbody>
              </table>
            ) : <p className="chart-empty">Появится после запуска с внешним поиском цен.</p>}
          </div>

          <div className="analytics-card-block">
            <h3 className="analytics-title">Уникальных объявлений за запуск · последние {fmt(runs.length)} запусков</h3>
            <LineChart label="уникальных объявлений за запуск" points={runs.map((run) => ({ x: runLabel(run), y: run.unique || 0 }))} />
            <p className="analytics-note">Подробный график хранит только последние ~3 суток запусков; итоги за неделю и месяц — выше.</p>
          </div>

          <div className="analytics-card-block">
            <h3 className="analytics-title">Отклонены после оценки</h3>
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
              <h3 className="analytics-title">Откуда берутся цены</h3>
              <BreakdownBars rows={Object.entries(stats.externalOfferDomains).slice(0, 10).map(([domain, count]) => ({ label: domain, best: count, good: 0, watchlist: 0 }))} />
              <p className="analytics-note">Каталог: {fmt(counts?.feed)} объявлений · последний запуск {stats.finishedAt ? dateLabel(stats.finishedAt) : "—"}. Marktplaats в рыночную оценку не входит.</p>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
