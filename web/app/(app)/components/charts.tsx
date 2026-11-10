"use client";

import { useState } from "react";

/** Series colours are the app's theme tokens, so Best/Good look the same in charts, cards and the radar, in both themes. */
export const SERIES = { best: "var(--accent)", good: "var(--good)", watchlist: "var(--warn)" } as const;
export const SERIES_LABEL = { best: "Best deals", good: "Good deals", watchlist: "Watchlist" } as const;

const fmt = (value: number) => value.toLocaleString("ru-RU");

/** Single-series line over time with a crosshair tooltip. */
export function LineChart({ points, label, unit = "" }: { points: Array<{ x: string; y: number }>; label: string; unit?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return <p className="chart-empty">Недостаточно запусков для графика ({points.length}).</p>;
  const width = 640, height = 180, pad = { l: 44, r: 12, t: 12, b: 26 };
  const max = Math.max(...points.map((p) => p.y), 1);
  const x = (i: number) => pad.l + (i / (points.length - 1)) * (width - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / max) * (height - pad.t - pad.b);
  const path = points.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.y).toFixed(1)).join(" ");
  const ticks = [0, Math.round(max / 2), max];
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          const box = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
          const rel = ((event.clientX - box.left) / box.width) * width;
          const index = Math.round(((rel - pad.l) / (width - pad.l - pad.r)) * (points.length - 1));
          setHover(Math.max(0, Math.min(points.length - 1, index)));
        }}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.l} x2={width - pad.r} y1={y(tick)} y2={y(tick)} className="chart-grid" />
            <text x={pad.l - 6} y={y(tick) + 4} textAnchor="end" className="chart-axis">{fmt(tick)}</text>
          </g>
        ))}
        <text x={pad.l} y={height - 6} className="chart-axis">{points[0].x}</text>
        <text x={width - pad.r} y={height - 6} textAnchor="end" className="chart-axis">{points[points.length - 1].x}</text>
        <path d={path} fill="none" stroke={SERIES.best} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null ? (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={height - pad.b} className="chart-crosshair" />
            <circle cx={x(hover)} cy={y(points[hover].y)} r={4.5} fill={SERIES.best} stroke="var(--surface)" strokeWidth={2} />
          </g>
        ) : null}
      </svg>
      {hover !== null ? <div className="chart-tooltip"><b>{fmt(points[hover].y)}{unit}</b> {label} · {points[hover].x}</div> : <figcaption className="chart-caption">{label}</figcaption>}
    </figure>
  );
}

type StackRow = { x: string; best: number; good: number };

/** Stacked bars (best + good) per day with legend, direct total labels and hover tooltip. */
export function StackedBars({ rows }: { rows: StackRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!rows.length) return <p className="chart-empty">За выбранный период выгодных предложений не появлялось.</p>;
  const width = 640, height = 190, pad = { l: 32, r: 8, t: 16, b: 26 };
  const max = Math.max(...rows.map((r) => r.best + r.good), 1);
  const slot = (width - pad.l - pad.r) / rows.length;
  const barW = Math.max(4, Math.min(28, slot - 6));
  const y = (v: number) => (v / max) * (height - pad.t - pad.b);
  return (
    <figure className="chart">
      <div className="chart-legend">
        <span><i style={{ background: SERIES.best }} />{SERIES_LABEL.best}</span>
        <span><i style={{ background: SERIES.good }} />{SERIES_LABEL.good}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Появление выгодных предложений по дням" onMouseLeave={() => setHover(null)}>
        <line x1={pad.l} x2={width - pad.r} y1={height - pad.b} y2={height - pad.b} className="chart-grid" />
        {rows.map((row, i) => {
          const cx = pad.l + slot * i + (slot - barW) / 2;
          const hb = y(row.best), hg = y(row.good);
          const base = height - pad.b;
          return (
            <g key={row.x} onMouseEnter={() => setHover(i)}>
              <rect x={pad.l + slot * i} y={pad.t} width={slot} height={height - pad.t - pad.b} fill="transparent" />
              {row.best ? <rect x={cx} y={base - hb} width={barW} height={Math.max(0, hb)} rx={3} fill={SERIES.best} /> : null}
              {row.good ? <rect x={cx} y={base - hb - hg - (row.best ? 2 : 0)} width={barW} height={Math.max(0, hg)} rx={3} fill={SERIES.good} /> : null}
              {rows.length <= 14 ? <text x={cx + barW / 2} y={base - hb - hg - 6} textAnchor="middle" className="chart-value">{row.best + row.good || ""}</text> : null}
            </g>
          );
        })}
        <text x={pad.l} y={height - 6} className="chart-axis">{rows[0].x}</text>
        <text x={width - pad.r} y={height - 6} textAnchor="end" className="chart-axis">{rows[rows.length - 1].x}</text>
      </svg>
      {hover !== null ? <div className="chart-tooltip">{rows[hover].x}: <b>{rows[hover].best}</b> best · <b>{rows[hover].good}</b> good</div> : null}
    </figure>
  );
}

/** Processing funnel as horizontal bars: passed count, rejected count and the reasons. */
export function Funnel({ stages }: { stages: Array<{ stage: string; passed: number; rejected: number; reasons: Record<string, number> }> }) {
  if (!stages.length) return <p className="chart-empty">Воронка появится после следующего запуска сканера.</p>;
  const max = Math.max(...stages.map((s) => s.passed), 1);
  return (
    <ol className="funnel">
      {stages.map((stage) => (
        <li key={stage.stage}>
          <div className="funnel-head"><span>{stage.stage}</span><b>{fmt(stage.passed)}</b></div>
          <div className="funnel-track"><i style={{ width: Math.max(0.5, (stage.passed / max) * 100) + "%", background: SERIES.best }} /></div>
          {stage.rejected ? (
            <small>−{fmt(stage.rejected)}: {Object.entries(stage.reasons).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([reason, count]) => reason + " " + fmt(count)).join(" · ")}</small>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** Horizontal stacked bars for a categorical breakdown (best / good / watchlist). */
export function BreakdownBars({ rows }: { rows: Array<{ label: string; best: number; good: number; watchlist: number }> }) {
  if (!rows.length) return <p className="chart-empty">Нет данных.</p>;
  const max = Math.max(...rows.map((r) => r.best + r.good + r.watchlist), 1);
  return (
    <div className="breakdown">
      <div className="chart-legend">
        {(["best", "good", "watchlist"] as const).map((key) => <span key={key}><i style={{ background: SERIES[key] }} />{SERIES_LABEL[key]}</span>)}
      </div>
      {rows.map((row) => (
        <div className="breakdown-row" key={row.label} title={`${row.label}: ${row.best} best, ${row.good} good, ${row.watchlist} watchlist`}>
          <span>{row.label}</span>
          <div className="breakdown-track">
            {(["best", "good", "watchlist"] as const).map((key) => row[key] ? <i key={key} style={{ width: (row[key] / max) * 100 + "%", background: SERIES[key] }} /> : null)}
          </div>
          <b>{fmt(row.best + row.good + row.watchlist)}</b>
        </div>
      ))}
    </div>
  );
}

export type PricePoint = { id: string; price: number; market: number; status?: string; title: string };

/**
 * Asking price (x) against independent market value (y), both on a log scale so €40 and €3,000 items fit.
 * Points above the diagonal are listed below their market value. Each point opens its listing.
 */
export function PriceMarketChart({ points, onPick }: { points: PricePoint[]; onPick: (id: string) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  if (points.length < 2) return <p className="chart-empty">Недостаточно оценённых объявлений для графика ({points.length}).</p>;
  const width = 640, height = 360, pad = { l: 52, r: 14, t: 14, b: 34 };
  const values = points.flatMap((point) => [point.price, point.market]);
  const lo = Math.log10(Math.max(1, Math.min(...values) * 0.85));
  const hi = Math.log10(Math.max(...values) * 1.15);
  const sx = (value: number) => pad.l + ((Math.log10(value) - lo) / (hi - lo)) * (width - pad.l - pad.r);
  const sy = (value: number) => height - pad.b - ((Math.log10(value) - lo) / (hi - lo)) * (height - pad.t - pad.b);
  const ticks = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000].filter((tick) => Math.log10(tick) >= lo && Math.log10(tick) <= hi);
  const active = points.find((point) => point.id === hover);
  const color = (status?: string) => status === "strong" ? SERIES.best : status === "good" ? SERIES.good : "var(--neutral)";
  const label = (value: number) => "€" + (value >= 1000 ? value / 1000 + "k" : value);
  return (
    <figure className="chart">
      <div className="chart-legend">
        <span><i style={{ background: SERIES.best }} />Best</span><span><i style={{ background: SERIES.good }} />Good</span>
        <span><i style={{ background: "var(--neutral)" }} />оценено, без прибыли</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Цена объявления против рыночной цены">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={sx(tick)} x2={sx(tick)} y1={pad.t} y2={height - pad.b} className="chart-grid" />
            <line x1={pad.l} x2={width - pad.r} y1={sy(tick)} y2={sy(tick)} className="chart-grid" />
            <text x={sx(tick)} y={height - pad.b + 16} textAnchor="middle" className="chart-axis">{label(tick)}</text>
            <text x={pad.l - 6} y={sy(tick) + 4} textAnchor="end" className="chart-axis">{label(tick)}</text>
          </g>
        ))}
        <line x1={sx(10 ** lo)} y1={sy(10 ** lo)} x2={sx(10 ** hi)} y2={sy(10 ** hi)} className="chart-diagonal" />
        <text x={sx(10 ** hi) - 4} y={sy(10 ** hi) + 14} textAnchor="end" className="chart-axis">цена = рынок</text>
        <text x={pad.l + 6} y={pad.t + 12} className="chart-axis">↑ дешевле рынка</text>
        <text x={width - pad.r} y={height - 4} textAnchor="end" className="chart-axis">цена объявления →</text>
        {[...points].sort((a, b) => Number(a.status === "strong") - Number(b.status === "strong")).map((point) => (
          <circle key={point.id} cx={sx(point.price)} cy={sy(point.market)} r={point.id === hover ? 8 : point.status === "candidate" ? 4 : 6}
            fill={color(point.status)} fillOpacity={point.status === "candidate" ? 0.55 : 0.95} stroke="var(--surface)" strokeWidth={1.5}
            className="chart-point" tabIndex={0} role="button" aria-label={point.title + ": цена " + label(point.price) + ", рынок " + label(Math.round(point.market))}
            onMouseEnter={() => setHover(point.id)} onFocus={() => setHover(point.id)} onMouseLeave={() => setHover(null)}
            onClick={() => onPick(point.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onPick(point.id); } }} />
        ))}
      </svg>
      {active ? <div className="chart-tooltip"><b>{active.title}</b> · цена €{fmt(active.price)} · рынок €{fmt(Math.round(active.market))} · −{Math.round((1 - active.price / active.market) * 100)}%</div>
        : <figcaption className="chart-caption">Нажмите на точку, чтобы открыть объявление</figcaption>}
    </figure>
  );
}

/** Signed bars (profit can be negative), one per period. */
export function SignedBars({ rows, unit = "€" }: { rows: Array<{ x: string; y: number }>; unit?: string }) {
  if (!rows.length) return <p className="chart-empty">Нет данных за период.</p>;
  const width = 640, height = 170, pad = { l: 8, r: 8, t: 18, b: 24 };
  const max = Math.max(...rows.map((row) => Math.abs(row.y)), 1);
  const hasNegative = rows.some((row) => row.y < 0);
  const zero = hasNegative ? pad.t + (height - pad.t - pad.b) / 2 : height - pad.b;
  const span = hasNegative ? (height - pad.t - pad.b) / 2 : height - pad.t - pad.b;
  const slot = (width - pad.l - pad.r) / rows.length;
  const barW = Math.max(6, Math.min(48, slot - 10));
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Прибыль по месяцам">
        <line x1={pad.l} x2={width - pad.r} y1={zero} y2={zero} className="chart-grid" />
        {rows.map((row, index) => {
          const h = (Math.abs(row.y) / max) * span;
          const x = pad.l + slot * index + (slot - barW) / 2;
          return (
            <g key={row.x}>
              <rect x={x} y={row.y >= 0 ? zero - h : zero} width={barW} height={Math.max(1, h)} rx={3} fill={row.y >= 0 ? "var(--accent)" : "var(--danger)"} />
              <text x={x + barW / 2} y={row.y >= 0 ? zero - h - 5 : zero + h + 12} textAnchor="middle" className="chart-value">{(row.y < 0 ? "−" : "") + unit + fmt(Math.round(Math.abs(row.y)))}</text>
              <text x={x + barW / 2} y={height - 6} textAnchor="middle" className="chart-axis">{row.x}</text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
