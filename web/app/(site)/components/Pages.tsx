import Link from "next/link";
import type { SiteFeed } from "@/lib/site/feed";
import { href, type Dictionary, type Locale } from "@/lib/site/i18n";
import { categoryGroups, TOTAL_SEARCHES } from "@/lib/site/catalog";
import { count } from "@/lib/site/format";
import { siteConfig } from "@/site-config";
import { ContactForm } from "./ContactForm";
import { FeatureVisual } from "./FeatureVisual";
import { Icon, type IconName } from "./Icon";
import { GROUP_ICON } from "./DealViews";
import { CategoryCards, Cta, FaqList, FEATURE_ICON, PageHero, Pipeline, StatusBadge, STEP_ICON, Why } from "./Sections";
import { DemoSection } from "./DemoSection";

type P = { locale: Locale; t: Dictionary; feed: SiteFeed };

export function HowPage({ locale, t, feed }: P) {
  return (
    <>
      <PageHero locale={locale} t={t} eyebrow={t.nav.how} title={t.how.title} intro={t.how.intro} />
      <section className="sec">
        <div className="wrap steps">
          {t.how.steps.map((step, index) => (
            <article className="step rv" key={step.key} id={step.key}>
              <div>
                <div className="pipe-ico" style={{ margin: "0 0 18px" }}><Icon name={STEP_ICON[step.key]} size={20} /></div>
                <span className="step-num">{String(index + 1).padStart(2, "0")} / {String(t.how.steps.length).padStart(2, "0")}</span>
                <h2>{step.title}</h2>
              </div>
              <p className="lead">{step.body}</p>
              <ul className="checks">
                {step.details.map((line) => <li key={line}><Icon name="check" size={16} strokeWidth={2.2} /><span>{line}</span></li>)}
              </ul>
            </article>
          ))}
          <div className="callout rv">
            <div className="callout-ico"><Icon name="shield" size={20} /></div>
            <div><h3>{t.how.noInvention}</h3><p>{t.how.noInventionBody}</p></div>
          </div>
        </div>
      </section>
      <DemoSection locale={locale} t={t} feed={feed} />
      <Cta t={t} />
    </>
  );
}

export function FeaturesPage({ locale, t, feed }: P) {
  return (
    <>
      <PageHero locale={locale} t={t} eyebrow={t.nav.features} title={t.features.title} intro={t.features.intro} />
      <section className="sec" style={{ paddingTop: 48 }}>
        <div className="wrap">
          {t.features.items.map((item) => (
            <article className="fdetail" key={item.key} id={item.key}>
              <div className="rv">
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div className="feat-ico"><Icon name={FEATURE_ICON[item.key]} size={21} /></div>
                  <StatusBadge status={item.status as "live" | "partial" | "dev"} t={t.common} />
                </div>
                <h2>{item.title}</h2>
                <p className="lead">{item.summary}</p>
                <dl className="fdetail-meta">
                  <div><dt>{t.common.benefit}</dt><dd>{item.benefit}</dd></div>
                  <div><dt>{t.common.example}</dt><dd>{item.example}</dd></div>
                </dl>
              </div>
              <div className="fdetail-ui rv" style={{ ["--d" as string]: "100ms" }}>
                <FeatureVisual feature={item.key} feed={feed} locale={locale} t={t} />
              </div>
            </article>
          ))}
        </div>
      </section>
      <Cta t={t} />
    </>
  );
}

export function CategoriesPage({ locale, t, feed }: P) {
  const groups = categoryGroups(locale);
  return (
    <>
      <PageHero locale={locale} t={t} eyebrow={t.nav.categories} title={t.categories.title} intro={t.categories.intro} />
      <section className="sec">
        <div className="wrap">
          <div className="sec-head rv"><span className="eyebrow">{t.categories.focusTitle}</span><p className="lead">{t.categories.focusIntro}</p></div>
          <CategoryCards locale={locale} t={t} feed={feed} />
        </div>
      </section>
      <section className="sec">
        <div className="wrap">
          <div className="sec-head rv">
            <span className="eyebrow">{t.categories.allTitle}</span>
            <h2 className="h2">{count(TOTAL_SEARCHES, locale)} {t.categories.allTitle.toLowerCase()}</h2>
            <p className="lead">{t.categories.accessoriesNote}</p>
          </div>
          <div className="groups">
            {groups.map((group, index) => (
              <div className="group rv" key={group.key} style={{ ["--d" as string]: `${(index % 2) * 70}ms` }}>
                <h3><Icon name={GROUP_ICON[group.key] as IconName} size={19} />{t.categories.groups[group.key]}</h3>
                <ul>
                  {group.items.map((item) => (
                    <li key={item.key}>{item.label}{feed.ok && (feed.byCategory[item.key] || 0) > 0 && <b>{count(feed.byCategory[item.key], locale)}</b>}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>
      <Cta t={t} />
    </>
  );
}

export function AboutPage({ locale, t }: P) {
  const initials = siteConfig.developerName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const stackIcons: IconName[] = ["code", "globe", "send", "identify", "pin"];
  return (
    <>
      <PageHero locale={locale} t={t} eyebrow={t.about.eyebrow} title={t.about.title} intro={t.about.intro} />
      <section className="sec">
        <div className="wrap">
          <div className="two">
            {t.about.sections.map((section, index) => (
              <div className="box rv" key={section.title} style={{ ["--d" as string]: `${(index % 2) * 70}ms` }}>
                <h2>{section.title}</h2>
                <p>{section.body}</p>
              </div>
            ))}
          </div>
          <div className="box rv" style={{ marginTop: 16 }}>
            <h2>{t.about.stackTitle}</h2>
            <ul className="stack">
              {t.about.stack.map((item, index) => <li key={item}><Icon name={stackIcons[index % stackIcons.length]} size={16} />{item}</li>)}
            </ul>
          </div>
          {siteConfig.developerName && (
            <div className="dev rv" style={{ marginTop: 16 }}>
              <div className="avatar" aria-hidden="true">{initials}</div>
              <div>
                <div className="muted small" style={{ fontWeight: 700 }}>{t.about.developerTitle}</div>
                <div className="h3" style={{ marginTop: 2 }}>{siteConfig.developerName}</div>
                <p className="muted" style={{ marginTop: 4 }}>{t.about.developerBody}</p>
              </div>
              <Link className="btn btn-ghost" href={href(locale, "contact")}>{t.nav.contact}<Icon name="arrow" size={16} className="arrow" /></Link>
            </div>
          )}
        </div>
      </section>
      <Why t={t} />
      <Pipeline locale={locale} t={t} />
      <Cta t={t} />
    </>
  );
}

export function FaqPage({ locale, t }: P) {
  return (
    <>
      <PageHero locale={locale} t={t} eyebrow={t.faq.eyebrow} title={t.faq.title} intro={t.faq.intro} />
      <section className="sec"><div className="wrap"><FaqList items={t.faq.items} /></div></section>
      <Cta t={t} />
    </>
  );
}

type Channel = { key: keyof Dictionary["contact"]["channels"]; icon: IconName; value: string; href: string; external?: boolean };

export function contactChannels(): Channel[] {
  const c = siteConfig;
  const list: Array<Channel | null> = [
    c.contactEmail ? { key: "email", icon: "mail", value: c.contactEmail, href: `mailto:${c.contactEmail}` } : null,
    c.telegramUrl ? { key: "telegram", icon: "send", value: c.telegramLabel || c.telegramUrl.replace(/^https?:\/\//, ""), href: c.telegramUrl, external: true } : null,
    c.whatsappUrl ? { key: "whatsapp", icon: "chat", value: c.phoneDisplay || c.whatsappUrl.replace(/^https?:\/\//, ""), href: c.whatsappUrl, external: true } : null,
    c.phoneNumber ? { key: "phone", icon: "phone", value: c.phoneDisplay || c.phoneNumber, href: `tel:${c.phoneNumber}` } : null,
    c.instagramUrl ? { key: "instagram", icon: "instagram", value: c.instagramUrl.replace(/^https?:\/\/(www\.)?/, ""), href: c.instagramUrl, external: true } : null,
    c.linkedinUrl ? { key: "linkedin", icon: "linkedin", value: c.linkedinUrl.replace(/^https?:\/\/(www\.)?/, ""), href: c.linkedinUrl, external: true } : null,
    c.githubUrl ? { key: "github", icon: "github", value: c.githubUrl.replace(/^https?:\/\/(www\.)?/, ""), href: c.githubUrl, external: true } : null,
  ];
  return list.filter((item): item is Channel => item !== null);
}

export function ContactPage({ locale, t }: P) {
  const channels = contactChannels();
  return (
    <>
      <PageHero locale={locale} t={t} eyebrow={t.contact.eyebrow} title={t.contact.title} intro={t.contact.intro} />
      <section className="sec">
        <div className="wrap contact-grid">
          <div className="rv">
            {siteConfig.developerName && (
              <div className="box" style={{ marginBottom: 16 }}>
                <div className="muted small" style={{ fontWeight: 700 }}>{t.contact.developer}</div>
                <div className="h3" style={{ marginTop: 2 }}>{siteConfig.developerName}</div>
                {siteConfig.companyName && <p style={{ marginTop: 4 }}>{siteConfig.companyName}</p>}
                {siteConfig.location && <p className="muted" style={{ marginTop: 6, display: "flex", gap: 6, alignItems: "center" }}><Icon name="pin" size={15} />{siteConfig.location}</p>}
              </div>
            )}
            <ul className="channels">
              {channels.map((channel) => (
                <li key={channel.key}>
                  <a className="channel" href={channel.href}
                    {...(channel.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                    <span className="channel-ico"><Icon name={channel.icon} size={20} /></span>
                    <span><span className="ch-l">{t.contact.channels[channel.key]}</span><span className="ch-v">{channel.value}</span></span>
                    <Icon name={channel.external ? "external" : "arrow"} size={16} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div className="form rv" style={{ ["--d" as string]: "100ms" }}>
            <h2>{t.contact.formTitle}</h2>
            <p>{t.contact.formIntro}</p>
            <ContactForm locale={locale} t={t.contact.form} privacyHref={href(locale, "privacy")} />
          </div>
        </div>
      </section>
    </>
  );
}

export function LegalPage({ locale, t, doc }: { locale: Locale; t: Dictionary; doc: "privacy" | "terms" }) {
  const content = t[doc];
  return (
    <>
      <PageHero locale={locale} t={t} eyebrow={content.title} title={content.title} intro={content.intro}>
        <div className="legal-meta"><span>{t.legal.updated}: {t.legal.date}</span></div>
      </PageHero>
      <section className="sec">
        <div className="wrap prose">
          <p className="legal-note">{t.legal.notLegalAdvice}</p>
          {content.sections.map((section) => (
            <section key={section.h}>
              <h2>{section.h}</h2>
              {section.p.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </section>
          ))}
          <section>
            <p><Link className="link" href={href(locale, "contact")}>{t.nav.contact}<Icon name="arrow" size={16} /></Link></p>
          </section>
        </div>
      </section>
    </>
  );
}
