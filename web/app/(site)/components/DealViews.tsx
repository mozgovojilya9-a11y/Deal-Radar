import type { ShowcaseDeal } from "@/lib/site/feed";
import type { Dictionary, Locale } from "@/lib/site/i18n";
import { siteCategoryLabel, siteGroupOf, type GroupKey } from "@/lib/site/catalog";
import { euro, percent } from "@/lib/site/format";
import { DealImage } from "./DealImage";
import { Icon, type IconName } from "./Icon";

export const GROUP_ICON: Record<GroupKey, IconName> = {
  phones: "smartphone", computers: "laptop", consoles: "gamepad", audio: "headphones", cameras: "camera",
  tv: "tv", smartwatches: "watch", watches: "watch", bags: "bag", eyewear: "glasses",
};

export function dealIcon(categoryKey: string): IconName {
  if (categoryKey === "drones") return "drone";
  if (categoryKey.startsWith("microphone")) return "mic";
  if (categoryKey === "sonos") return "speaker";
  const group = siteGroupOf(categoryKey);
  return group ? GROUP_ICON[group] : "radar";
}

function StatusPill({ deal, t }: { deal: ShowcaseDeal; t: Dictionary["deal"] }) {
  const cls = deal.status === "strong" ? "pill pill-accent" : deal.status === "good" ? "pill pill-good" : "pill pill-muted";
  return <span className={cls}>{t.status[deal.status]}</span>;
}

/** Compact row used in the hero panel. */
export function DealRow({ deal, locale, t, eager }: { deal: ShowcaseDeal; locale: Locale; t: Dictionary["deal"]; eager?: boolean }) {
  return (
    <a className="drow" href={deal.url} target="_blank" rel="noopener noreferrer nofollow"
      aria-label={`${deal.title} — ${euro(deal.price, locale)}. ${t.open}`}>
      <div className="drow-img"><DealImage src={deal.image} alt="" icon={dealIcon(deal.categoryKey)} eager={eager} /></div>
      <div style={{ minWidth: 0 }}>
        <div className="drow-title">{deal.title}</div>
        <div className="drow-sub">
          <span>{t.market} <s>{euro(deal.marketValue, locale)}</s></span>
          <span>{t.profitShort} +{euro(deal.profit, locale)}</span>
        </div>
      </div>
      <div className="drow-right">
        <div className="drow-price">{euro(deal.price, locale)}</div>
        <span className="pill pill-accent">−{percent(deal.discount, locale)}</span>
      </div>
    </a>
  );
}

/** Full card used in the demo section. */
export function DealCard({ deal, locale, t }: { deal: ShowcaseDeal; locale: Locale; t: Dictionary["deal"] }) {
  const discount = Math.max(0, Math.min(1, deal.discount ?? 0));
  const condition = deal.condition ? (locale === "en" ? t.conditionLabels[deal.condition] || deal.condition : deal.condition) : null;
  return (
    <article className="dcard">
      <div className="dcard-img">
        <DealImage src={deal.image} alt={deal.title} icon={dealIcon(deal.categoryKey)} />
        <div className="dcard-badges">
          <StatusPill deal={deal} t={t} />
          <span className="pill pill-accent">−{percent(deal.discount, locale)}</span>
        </div>
      </div>
      <div className="dcard-body">
        <div>
          <div className="dcard-cat">{siteCategoryLabel(deal.categoryKey, locale)}</div>
          <h3 className="dcard-title" style={{ marginTop: 4 }}>{deal.title}</h3>
        </div>
        <dl className="dcard-prices">
          <div className="kv"><dt>{t.asking}</dt><dd>{euro(deal.price, locale)}</dd></div>
          <div className="kv"><dt>{t.market}</dt><dd>{euro(deal.marketValue, locale)}</dd></div>
          <div className="kv" style={{ gridColumn: "1 / -1" }}><dt>{t.profit}</dt><dd className="accent">+{euro(deal.profit, locale)}{deal.roi !== null && <span className="muted small" style={{ fontWeight: 700, marginLeft: 8 }}>{t.roi} {percent(deal.roi, locale)}</span>}</dd></div>
        </dl>
        <div>
          <div className="dcard-meter" aria-hidden="true"><span className="grow" style={{ width: `${discount * 100}%` }} /></div>
          <div className="small muted" style={{ marginTop: 6 }}>
            {percent(deal.discount, locale)} {t.discount}{deal.sources > 0 && <> · {deal.sources} {t.sources}</>} · {t.confidence[deal.confidence]}
          </div>
        </div>
        <div className="dcard-foot">
          <span>{[deal.city, condition].filter(Boolean).join(" · ") || t.netherlands}</span>
          <a href={deal.url} target="_blank" rel="noopener noreferrer nofollow">{t.open}<Icon name="external" size={15} /></a>
        </div>
      </div>
    </article>
  );
}
