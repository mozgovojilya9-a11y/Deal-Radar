import type { ShowcaseDeal, SiteFeed } from "@/lib/site/feed";
import type { Dictionary, Locale } from "@/lib/site/i18n";
import { PROFITABILITY } from "@/lib/economics";
import { count, euro, percent } from "@/lib/site/format";
import { siteCategoryLabel } from "@/lib/site/catalog";

type Props = { feature: string; feed: SiteFeed; locale: Locale; t: Dictionary };

function Caption({ real, t, deal, locale }: { real: boolean; t: Dictionary; deal?: ShowcaseDeal; locale: Locale }) {
  return (
    <div className="ui-label" style={{ marginBottom: 6 }}>
      {real ? t.visuals.real : t.visuals.example}
      {deal && <> · {siteCategoryLabel(deal.categoryKey, locale)}</>}
    </div>
  );
}

function NoData({ t }: { t: Dictionary }) {
  return <p className="muted small">{t.visuals.noData}</p>;
}

/**
 * Small interface fragments for the Features page. Panels marked "real" use listings and the
 * scanner report from the live feed; panels marked "illustration" show how the UI behaves and
 * contain no performance claims.
 */
export function FeatureVisual({ feature, feed, locale, t }: Props) {
  const v = t.visuals;
  const top = feed.deals[0];
  // Use different listings for the different panels where the feed allows it.
  const priceDeal = feed.deals.find((d) => d.sources >= 2 && d.categoryKey !== top?.categoryKey) || feed.deals.find((d) => d.sources >= 2) || top;

  switch (feature) {
    case "scanner": {
      const s = feed.stats;
      if (!s) return <NoData t={t} />;
      const rows: Array<[string, number | undefined]> = [
        [t.stats.checked, s.checked], [t.stats.unique, s.unique], [v.duplicates, s.duplicates], [t.stats.published, feed.total],
      ];
      return (
        <>
          <div className="ui-label" style={{ marginBottom: 6 }}>{v.scanLog}</div>
          {rows.map(([label, value]) => (
            <div className="ui-row" key={label}><span>{label}</span><b>{typeof value === "number" ? count(value, locale) : "—"}</b></div>
          ))}
        </>
      );
    }
    case "recognition":
      return (
        <>
          <Caption real={false} t={t} locale={locale} />
          {v.recognition.map((row) => (
            <div className={row.ok ? "ui-row ok" : "ui-row no"} key={row.title}>
              <span>{row.title}</span><span className={row.ok ? "ui-tag ok" : "ui-tag no"}>{row.ok ? `${v.matched}: ${row.tag}` : row.tag}</span>
            </div>
          ))}
        </>
      );
    case "price": {
      const deal = priceDeal;
      if (!deal || deal.marketValue === null) return <NoData t={t} />;
      const max = Math.max(deal.marketValue, deal.price);
      return (
        <>
          <Caption real t={t} deal={deal} locale={locale} />
          <div style={{ fontWeight: 700, marginBottom: 8 }}>{deal.title}</div>
          <div className="ui-bars">
            <div className="ui-bar"><span>{t.deal.market}</span><div className="ui-bar-track"><div className="ui-bar-fill grow" style={{ width: `${(deal.marketValue / max) * 100}%` }} /></div><b>{euro(deal.marketValue, locale)}</b></div>
            <div className="ui-bar"><span>{t.deal.asking}</span><div className="ui-bar-track"><div className="ui-bar-fill accent grow" style={{ width: `${(deal.price / max) * 100}%`, ["--d" as string]: "150ms" }} /></div><b>{euro(deal.price, locale)}</b></div>
          </div>
          <div className="ui-row" style={{ marginTop: 6 }}><span>{t.deal.sources}</span><b>{deal.sources}</b></div>
        </>
      );
    }
    case "newused": {
      const hasTwo = (d: ShowcaseDeal) => [d.newPrice, d.usedPrice, d.refurbishedPrice].filter((x) => x !== null).length >= 2;
      const deal = feed.deals.find((d) => hasTwo(d) && d.categoryKey !== top?.categoryKey && d.categoryKey !== priceDeal?.categoryKey) || feed.deals.find(hasTwo);
      if (!deal) return <NoData t={t} />;
      const values: Array<[string, number | null]> = [[t.deal.newPrice, deal.newPrice], [t.deal.refurbishedPrice, deal.refurbishedPrice], [t.deal.usedPrice, deal.usedPrice], [t.deal.asking, deal.price]];
      const max = Math.max(...values.map(([, x]) => x ?? 0));
      return (
        <>
          <Caption real t={t} deal={deal} locale={locale} />
          <div style={{ fontWeight: 700, marginBottom: 8 }}>{deal.title}</div>
          <div className="ui-bars">
            {values.map(([label, value], index) => (
              <div className="ui-bar" key={label}>
                <span>{label}</span>
                <div className="ui-bar-track">{value !== null && <div className={index === 3 ? "ui-bar-fill accent grow" : "ui-bar-fill grow"} style={{ width: `${(value / max) * 100}%`, ["--d" as string]: `${index * 90}ms` }} />}</div>
                <b>{euro(value, locale)}</b>
              </div>
            ))}
          </div>
        </>
      );
    }
    case "profit": {
      // Rebuilt from the scanner's own stored figures so it matches the card exactly.
      if (!top || top.marketValue === null || top.expectedResale === null || top.profit === null) return <NoData t={t} />;
      const negotiation = top.expectedResale * PROFITABILITY.buyer_negotiation_rate;
      const fees = (top.expectedResale - negotiation) * PROFITABILITY.selling_fee_rate;
      const fixed = PROFITABILITY.fixed_selling_cost_eur;
      const other = top.expectedResale - negotiation - fees - fixed - top.price - top.profit;
      const b = v.breakdown;
      return (
        <>
          <Caption real t={t} deal={top} locale={locale} />
          <div style={{ fontWeight: 700, marginBottom: 8 }}>{top.title}</div>
          <div className="ui-sum">
            <div><span>{b.basis}</span><span>{euro(top.marketValue, locale)}</span></div>
            <div><span>{b.resale}</span><span>{euro(top.expectedResale, locale)}</span></div>
            <div><span>{b.negotiation}</span><span>−{euro(negotiation, locale)}</span></div>
            <div><span>{b.fees}</span><span>−{euro(fees, locale)}</span></div>
            <div><span>{b.fixed}</span><span>−{euro(fixed, locale)}</span></div>
            {other >= 1 && <div><span>{b.other}</span><span>−{euro(other, locale)}</span></div>}
            <div><span>{b.asking}</span><span>−{euro(top.price, locale)}</span></div>
            <div className="total"><span>{b.profit}</span><b>{euro(top.profit, locale)}{top.roi !== null && <> · {t.deal.roi} {percent(top.roi, locale)}</>}</b></div>
          </div>
        </>
      );
    }
    case "filters":
      return (
        <>
          <Caption real={false} t={t} locale={locale} />
          <div className="ui-row"><span>{v.filters.location}</span><span className="ui-tag ok">GPS / PDOK</span></div>
          <div className="ui-slider" style={{ margin: "8px 0" }}>
            <div className="ui-slider-top"><span>{v.filters.price}</span><b>€0 – €700</b></div>
            <div className="ui-slider-track"><span style={{ left: 0, width: "47%" }} /><i style={{ left: "47%" }} /></div>
          </div>
          <div className="ui-slider" style={{ margin: "8px 0" }}>
            <div className="ui-slider-top"><span>{v.filters.discount}</span><b>25%</b></div>
            <div className="ui-slider-track"><span style={{ left: 0, width: "36%" }} /><i style={{ left: "36%" }} /></div>
          </div>
          <div className="ui-label" style={{ marginTop: 6 }}>{v.filters.categories}</div>
          <div className="ui-chips">
            <span className="ui-chip on">{t.categories.groups.cameras}</span>
            <span className="ui-chip">{t.categories.groups.consoles}</span>
            <span className="ui-chip">{t.categories.groups.audio}</span>
            <span className="ui-chip on">{v.filters.exact}</span>
          </div>
        </>
      );
    case "reserved":
      return (
        <>
          <Caption real={false} t={t} locale={locale} />
          {v.reserved.map((row) => (
            <div className={row.state === "active" ? "ui-row ok" : "ui-row no"} key={row.title}>
              <span>{row.title}</span>
              <span className={row.state === "active" ? "ui-tag ok" : "ui-tag no"}>{v.states[row.state]}</span>
            </div>
          ))}
        </>
      );
    case "ranking": {
      const list = feed.deals.slice(0, 4);
      if (!list.length) return <NoData t={t} />;
      const max = Math.max(...list.map((d) => d.profit ?? 0));
      return (
        <>
          <div className="ui-label" style={{ marginBottom: 6 }}>{v.real} · {v.ranking}</div>
          <div className="ui-bars">
            {list.map((deal, index) => (
              <div className="ui-bar" key={deal.id}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={deal.title}>{index + 1}. {deal.title}</span>
                <div className="ui-bar-track"><div className="ui-bar-fill accent grow" style={{ width: `${((deal.profit ?? 0) / max) * 100}%`, ["--d" as string]: `${index * 90}ms` }} /></div>
                <b>+{euro(deal.profit, locale)}</b>
              </div>
            ))}
          </div>
        </>
      );
    }
    case "history":
      return (
        <>
          <div className="ui-label">{v.history}</div>
          <svg className="ui-chart" viewBox="0 0 400 150" preserveAspectRatio="none" aria-hidden="true" style={{ opacity: .45 }}>
            <g stroke="rgba(190,205,222,.12)">{[30, 70, 110].map((y) => <line key={y} x1="0" x2="400" y1={y} y2={y} />)}</g>
            <polyline fill="none" stroke="#9db8ee" strokeWidth="2" strokeDasharray="5 6" points="0,60 60,64 120,58 180,72 240,70 300,80 360,76 400,82" />
            <polyline fill="none" stroke="#a7f36b" strokeWidth="2" strokeDasharray="5 6" points="0,110 80,108 160,96 240,112 320,104 400,100" />
          </svg>
        </>
      );
    default:
      return null;
  }
}
