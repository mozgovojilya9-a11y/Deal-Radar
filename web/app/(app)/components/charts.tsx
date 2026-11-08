"use client";

import { useState } from "react";

/** Validated categorical slots (dark surface #12171e): blue, orange, aqua — fixed order, never cycled. */
export const SERIES = { best: "#3987e5", good: "#d95926", watchlist: "#199e70" } as const;
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
