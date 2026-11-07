"use client";

import { useMemo, useState } from "react";
import type { ShowcaseDeal } from "@/lib/site/feed";
import type { Dictionary, Locale } from "@/lib/site/i18n";
import { siteGroupOf, type GroupKey } from "@/lib/site/catalog";
import { siteConfig } from "@/site-config";
import { DealCard } from "./DealViews";
import { Icon } from "./Icon";

type Sort = "profit" | "discount" | "price";
const PAGE = 6;

/**
 * Interactive view over the live feed. The filtering is the same kind the app offers
 * (category, minimum discount, sort); data comes from the server, nothing is invented here.
 */
export function LiveDemo({ deals, ok, locale, t }: { deals: ShowcaseDeal[]; ok: boolean; locale: Locale; t: Pick<Dictionary, "deal" | "demo" | "categories" | "common"> }) {
  const [group, setGroup] = useState<GroupKey | "all">("all");
  const [minDiscount, setMinDiscount] = useState(0);
  const [sort, setSort] = useState<Sort>("profit");
  const [visible, setVisible] = useState(PAGE);

  const groups = useMemo(() => {
    const present = new Set<GroupKey>();
    for (const deal of deals) { const g = siteGroupOf(deal.categoryKey); if (g) present.add(g); }
    return Object.keys(t.categories.groups).filter((key) => present.has(key as GroupKey)) as GroupKey[];
  }, [deals, t.categories.groups]);

  const filtered = useMemo(() => {
    const list = deals.filter((deal) => (group === "all" || siteGroupOf(deal.categoryKey) === group)
      && (deal.discount ?? 0) * 100 >= minDiscount);
    const by: Record<Sort, (a: ShowcaseDeal, b: ShowcaseDeal) => number> = {
      profit: (a, b) => (b.profit ?? 0) - (a.profit ?? 0),
      discount: (a, b) => (b.discount ?? 0) - (a.discount ?? 0),
      price: (a, b) => a.price - b.price,
    };
    return [...list].sort(by[sort]);
  }, [deals, group, minDiscount, sort]);

  // The pipeline indicator replays (CSS only) whenever the filters change: the list is re-keyed.
  const runKey = `${group}-${minDiscount}-${sort}`;

  const shown = filtered.slice(0, visible);
  const change = <T,>(setter: (value: T) => void) => (value: T) => { setter(value); setVisible(PAGE); };

  return (
    <div className="demo rv">
      <div className="demo-bar">
        <div className="demo-tabs" role="group" aria-label={t.categories.eyebrow}>
          <button type="button" aria-pressed={group === "all"} onClick={() => change(setGroup)("all")}>{t.demo.all}</button>
          {groups.map((key) => (
            <button type="button" key={key} aria-pressed={group === key} onClick={() => change(setGroup)(key)}>{t.categories.groups[key]}</button>
          ))}
        </div>
        <label className="demo-ctl">
          {t.demo.minDiscount}
          <input type="range" min={0} max={70} step={5} value={minDiscount} onChange={(event) => change(setMinDiscount)(Number(event.target.value))} />
          <output>{minDiscount}%</output>
        </label>
        <label className="demo-ctl">
          {t.demo.sort}
          <select value={sort} onChange={(event) => change(setSort)(event.target.value as Sort)}>
            {(Object.keys(t.demo.sorts) as Sort[]).map((key) => <option key={key} value={key}>{t.demo.sorts[key]}</option>)}
          </select>
        </label>
      </div>
      <ol className="demo-scan" aria-hidden="true" key={runKey}>
        <li className="lead-step">{t.demo.scanLabel}</li>
        {t.demo.scanSteps.map((label, index) => (
          <li key={label} style={{ ["--i" as string]: index + 1 }}>{label}</li>
        ))}
      </ol>
      <div className="demo-body" aria-live="polite">
        {!ok ? (
          <div className="empty"><Icon name="radar" size={34} /><p>{t.demo.unavailable}</p><a className="btn btn-ghost btn-sm" href={siteConfig.appPath}>{t.common.explore}</a></div>
        ) : shown.length === 0 ? (
          <div className="empty"><Icon name="filter" size={30} /><p>{t.demo.empty}</p></div>
        ) : (
          <>
            <div className="cards">
              {shown.map((deal) => <DealCard key={deal.id} deal={deal} locale={locale} t={t.deal} />)}
            </div>
            {filtered.length > shown.length && (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setVisible((value) => value + PAGE)}>{t.demo.more}</button>
              </div>
            )}
          </>
        )}
      </div>
      <div className="demo-foot">
        <span>{t.demo.showing} {shown.length} {t.demo.of} {filtered.length}</span>
        <span>{t.demo.source}</span>
      </div>
    </div>
  );
}
