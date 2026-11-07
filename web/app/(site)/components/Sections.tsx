import Link from "next/link";
import type { SiteFeed } from "@/lib/site/feed";
import { href, type Dictionary, type Locale } from "@/lib/site/i18n";
import { FOCUS_KEYS } from "@/lib/site/catalog";
import { count, dateTime } from "@/lib/site/format";
import { siteConfig } from "@/site-config";
import { DealRow } from "./DealViews";
import { Icon, type IconName } from "./Icon";
import { Radar } from "./Radar";

export const STEP_ICON: Record<string, IconName> = { scan: "scan", identify: "identify", research: "globe", evaluate: "scale", filter: "filter", discover: "list" };
export const FEATURE_ICON: Record<string, IconName> = {
  scanner: "scan", recognition: "identify", price: "globe", newused: "layers", profit: "trend",
  filters: "sliders", reserved: "lock", ranking: "bars", history: "history",
};
export const FOCUS_ICON: Record<string, IconName> = {
  airpods: "headphones", rayban: "glasses", playstation: "gamepad", tv: "tv", cameras: "camera",
  drones: "drone", bags: "bag", microphones: "mic", electronics: "smartphone",
};

export function StatusBadge({ status, t }: { status: "live" | "partial" | "dev"; t: Dictionary["common"] }) {
  return <span className={`st st-${status}`} title={t.statusHint[status]}>{t.status[status]}</span>;
}

export function SectionHead({ eyebrow, title, intro, as = "h2", children }: { eyebrow: string; title: string; intro?: string; as?: "h1" | "h2"; children?: React.ReactNode }) {
  const Heading = as;
  return (
    <div className={children ? "sec-head sec-head-row" : "sec-head"}>
      <div className="rv">
        <span className="eyebrow">{eyebrow}</span>
        <Heading className="h2">{title}</Heading>
        {intro && <p className="lead">{intro}</p>}
      </div>
      {children}
    </div>
  );
}

export function PageHero({ locale, t, eyebrow, title, intro, children }: { locale: Locale; t: Dictionary; eyebrow: string; title: string; intro?: string; children?: React.ReactNode }) {
  return (
    <section className="phero">
      <div className="grid-bg" />
      <div className="wrap">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link href={href(locale, "home")}>{t.common.breadcrumbHome}</Link><span aria-hidden="true">/</span><span aria-current="page">{eyebrow}</span>
        </nav>
        <h1 className="h1">{title}</h1>
        {intro && <p className="lead">{intro}</p>}
        {children}
      </div>
    </section>
  );
}

/* ---------- Home hero ---------- */

export function Hero({ locale, t, feed }: { locale: Locale; t: Dictionary; feed: SiteFeed }) {
  // Best deal per category, so the preview shows the breadth of the catalogue.
  const seen = new Set<string>();
  const deals = feed.deals.filter((deal) => !seen.has(deal.categoryKey) && seen.add(deal.categoryKey)).slice(0, 4);
  return (
    <section className="hero">
      <div className="grid-bg" />
      <div className="hero-glow" />
      <div className="wrap hero-grid">
        <div>
          <span className="eyebrow rv">{t.hero.eyebrow}</span>
          <h1 className="h1 rv" style={{ ["--d" as string]: "60ms" }}>{t.hero.title}</h1>
          <p className="lead rv" style={{ ["--d" as string]: "120ms" }}>{t.hero.subtitle}</p>
          <div className="hero-cta rv" style={{ ["--d" as string]: "180ms" }}>
            <a className="btn btn-primary" href={siteConfig.appPath}>{t.common.explore}<Icon name="arrow" size={17} className="arrow" /></a>
            <Link className="btn btn-ghost" href={href(locale, "how")}>{t.common.howItWorks}</Link>
          </div>
          <ul className="hero-facts rv" style={{ ["--d" as string]: "240ms" }}>
            {t.hero.facts.map((fact) => <li key={fact}><Icon name="check" size={16} strokeWidth={2.2} />{fact}</li>)}
          </ul>
        </div>
        <div className="panel rv" style={{ ["--d" as string]: "160ms" }}>
          <Radar className="panel-radar" />
          <div className="panel-top">
            <span className="panel-title"><span className="live" aria-hidden="true" />{t.hero.panelTitle}</span>
            <span className="panel-meta">{t.hero.panelUpdated}: {dateTime(feed.scannedAt || feed.updatedAt, locale)}</span>
          </div>
          <div className="panel-body">
            {deals.length > 0
              ? deals.map((deal, index) => <DealRow key={deal.id} deal={deal} locale={locale} t={t.deal} eager={index < 2} />)
              : <div className="empty" style={{ minHeight: 240 }}><Icon name="radar" size={32} /><p>{feed.ok ? t.hero.panelEmpty : t.demo.unavailable}</p></div>}
          </div>
          <p className="panel-note">{t.hero.panelNote}</p>
        </div>
      </div>
    </section>
  );
}

/* ---------- Scanner stats (from the feed's scanner report) ---------- */

export function Stats({ locale, t, feed }: { locale: Locale; t: Dictionary; feed: SiteFeed }) {
  const s = feed.stats;
  const items = s ? [
    { n: s.checked, l: t.stats.checked },
    { n: s.unique, l: t.stats.unique },
    { n: Math.max(0, (s.checked ?? 0) - (s.accepted ?? 0)), l: t.stats.rejected },
    { n: feed.total, l: t.stats.published },
    { n: feed.byStatus.good + feed.byStatus.strong, l: t.stats.deals, accent: true },
  ] : [];
  return (
    <section className="sec sec-tight" aria-labelledby="stats-title">
      <div className="wrap">
        <div className="sec-head rv" style={{ marginBottom: 32 }}>
          <h2 className="h3" id="stats-title">{t.stats.title}</h2>
          <p className="muted" style={{ marginTop: 6 }}>{t.stats.intro}</p>
        </div>
        {items.length > 0 ? (
          <>
            <div className="stats rv">
              {items.map((item) => (
                <div className="stat" key={item.l}>
                  <div className={item.accent ? "stat-n accent" : "stat-n"}>{typeof item.n === "number" ? count(item.n, locale) : "—"}</div>
                  <div className="stat-l">{item.l}</div>
                </div>
              ))}
            </div>
            <div className="stats-foot"><span>{t.stats.lastScan}: {dateTime(feed.scannedAt || feed.updatedAt, locale)}</span><span>deals.json · deals-data</span></div>
          </>
        ) : <p className="muted">{t.stats.unavailable}</p>}
      </div>
    </section>
  );
}

/* ---------- Pipeline (6 steps) ---------- */

export function Pipeline({ locale, t, linkMore = true }: { locale: Locale; t: Dictionary; linkMore?: boolean }) {
  return (
    <section className="sec" id="how" aria-labelledby="how-title">
      <div className="wrap">
        <div className="sec-head sec-head-row">
          <div className="rv">
            <span className="eyebrow">{t.how.eyebrow}</span>
            <h2 className="h2" id="how-title">{t.how.title}</h2>
            <p className="lead">{t.how.intro}</p>
          </div>
          {linkMore && <Link className="link rv" href={href(locale, "how")}>{t.common.learnMore}<Icon name="arrow" size={16} /></Link>}
        </div>
        <ol className="pipe rv" aria-label={t.how.pipelineLabel}>
          {t.how.steps.map((step, index) => (
            <li className="pipe-step" key={step.key}>
              <span className="dim-num">{String(index + 1).padStart(2, "0")}</span>
              <div className="pipe-ico"><Icon name={STEP_ICON[step.key]} size={20} /></div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
        <div className="callout rv" style={{ marginTop: 20 }}>
          <div className="callout-ico"><Icon name="shield" size={20} /></div>
          <div><h3>{t.how.noInvention}</h3><p>{t.how.noInventionBody}</p></div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Feature grid ---------- */

export function FeatureGrid({ locale, t }: { locale: Locale; t: Dictionary }) {
  return (
    <section className="sec" aria-labelledby="features-title">
      <div className="wrap">
        <div className="sec-head sec-head-row">
          <div className="rv">
            <span className="eyebrow">{t.features.eyebrow}</span>
            <h2 className="h2" id="features-title">{t.features.title}</h2>
            <p className="lead">{t.features.intro}</p>
          </div>
          <Link className="link rv" href={href(locale, "features")}>{t.common.allFeatures}<Icon name="arrow" size={16} /></Link>
        </div>
        <div className="feats">
          {t.features.items.map((item, index) => (
            <Link className="feat rv" key={item.key} href={href(locale, "features", item.key)} style={{ ["--d" as string]: `${(index % 3) * 70}ms` }}>
              <div className="feat-top">
                <div className="feat-ico"><Icon name={FEATURE_ICON[item.key]} size={21} /></div>
                <StatusBadge status={item.status as "live" | "partial" | "dev"} t={t.common} />
              </div>
              <h3>{item.title}</h3>
              <p>{item.summary}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Category focus cards ---------- */

export function focusCount(feed: SiteFeed, key: string): number {
  return (FOCUS_KEYS[key] || []).reduce((sum, category) => sum + (feed.byCategory[category] || 0), 0);
}

export function CategoryCards({ locale, t, feed, limit }: { locale: Locale; t: Dictionary; feed: SiteFeed; limit?: number }) {
  const items = limit ? t.categories.focus.slice(0, limit) : t.categories.focus;
  return (
    <div className="cats">
      {items.map((item, index) => {
        const n = focusCount(feed, item.key);
        return (
          <article className="cat rv" key={item.key} id={item.key} style={{ ["--d" as string]: `${(index % 3) * 70}ms` }}>
            <div className="cat-art" aria-hidden="true">
              <Icon name={FOCUS_ICON[item.key]} size={44} strokeWidth={1.3} />
              {feed.ok && <span className="pill pill-muted cat-count">{count(n, locale)} {t.categories.inCatalogue}</span>}
            </div>
            <h3>{item.title}</h3>
            <p className="models">{item.models}</p>
            <p className="note">{item.note}</p>
          </article>
        );
      })}
    </div>
  );
}

export function CategoriesTeaser({ locale, t, feed }: { locale: Locale; t: Dictionary; feed: SiteFeed }) {
  return (
    <section className="sec" aria-labelledby="cat-title">
      <div className="wrap">
        <div className="sec-head sec-head-row">
          <div className="rv">
            <span className="eyebrow">{t.categories.eyebrow}</span>
            <h2 className="h2" id="cat-title">{t.categories.title}</h2>
            <p className="lead">{t.categories.intro}</p>
          </div>
          <Link className="link rv" href={href(locale, "categories")}>{t.common.allCategories}<Icon name="arrow" size={16} /></Link>
        </div>
        <CategoryCards locale={locale} t={t} feed={feed} limit={6} />
      </div>
    </section>
  );
}

/* ---------- Manual vs Deal Radar ---------- */

export function Why({ t }: { t: Dictionary }) {
  return (
    <section className="sec" aria-labelledby="why-title">
      <div className="wrap">
        <SectionHead eyebrow={t.why.eyebrow} title={t.why.title} intro={t.why.intro} />
        <div className="cmp rv" role="table" aria-labelledby="why-title">
          <div className="cmp-row cmp-head" role="row">
            <span role="columnheader" />
            <span role="columnheader">{t.why.manual}</span>
            <span role="columnheader">{t.why.radar}</span>
          </div>
          {t.why.rows.map((row) => (
            <div className="cmp-row" role="row" key={row.topic}>
              <span className="cmp-topic" role="rowheader">{row.topic}</span>
              <span className="cmp-cell" role="cell"><Icon name="close" size={16} /><span><span className="cmp-lbl">{t.why.manual}</span>{row.manual}</span></span>
              <span className="cmp-cell" role="cell"><Icon name="check" size={16} strokeWidth={2.2} /><span><span className="cmp-lbl">{t.why.radar}</span>{row.radar}</span></span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- FAQ ---------- */

export function FaqList({ items }: { items: Dictionary["faq"]["items"] }) {
  return (
    <div className="faq">
      {items.map((item, index) => (
        <details key={item.q} className="rv" style={{ ["--d" as string]: `${Math.min(index, 6) * 40}ms` }}>
          <summary>{item.q}<Icon name="chevron" size={18} /></summary>
          <p className="ans">{item.a}</p>
        </details>
      ))}
    </div>
  );
}

export function FaqTeaser({ locale, t }: { locale: Locale; t: Dictionary }) {
  return (
    <section className="sec" aria-labelledby="faq-title">
      <div className="wrap faq-layout">
        <div className="sec-head rv">
          <span className="eyebrow">{t.faq.eyebrow}</span>
          <h2 className="h2" id="faq-title">{t.faq.title}</h2>
          <p className="lead">{t.faq.intro}</p>
          <Link className="link" href={href(locale, "faq")} style={{ marginTop: 24 }}>{t.common.allQuestions}<Icon name="arrow" size={16} /></Link>
        </div>
        <FaqList items={t.faq.items.slice(0, 6)} />
      </div>
    </section>
  );
}

/* ---------- Closing CTA ---------- */

export function Cta({ t }: { t: Dictionary }) {
  return (
    <section className="sec sec-tight">
      <div className="wrap">
        <div className="cta rv">
          <Radar className="cta-radar" />
          <div>
            <h2 className="h2">{t.cta.title}</h2>
            <p>{t.cta.body}</p>
          </div>
          <div className="cta-btns">
            {siteConfig.telegramAppUrl && (
              <a className="btn btn-primary" href={siteConfig.telegramAppUrl} target="_blank" rel="noopener noreferrer"><Icon name="send" size={17} />{t.common.openTelegram}</a>
            )}
            <a className="btn btn-ghost" href={siteConfig.appPath}>{t.common.openBrowser}<Icon name="arrow" size={16} className="arrow" /></a>
          </div>
        </div>
      </div>
    </section>
  );
}
