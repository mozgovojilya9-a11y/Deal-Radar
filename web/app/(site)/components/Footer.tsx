import Link from "next/link";
import { href, type Dictionary, type Locale } from "@/lib/site/i18n";
import { siteConfig } from "@/site-config";
import { Icon } from "./Icon";

export function Footer({ locale, t }: { locale: Locale; t: Dictionary }) {
  const year = new Date().getFullYear();
  return (
    <footer className="ftr">
      <div className="wrap">
        <div className="ftr-grid">
          <div className="ftr-brand">
            <Link className="logo" href={href(locale, "home")}>
              <span className="logo-mark"><Icon name="radar" size={18} strokeWidth={2} /></span>
              {siteConfig.productName}
            </Link>
            <p>{t.footer.tagline}</p>
          </div>
          <div>
            <h2>{t.footer.product}</h2>
            <ul>
              <li><Link href={href(locale, "how")}>{t.nav.how}</Link></li>
              <li><Link href={href(locale, "features")}>{t.nav.features}</Link></li>
              <li><Link href={href(locale, "categories")}>{t.nav.categories}</Link></li>
              <li><a href={siteConfig.appPath}>{t.nav.open}</a></li>
            </ul>
          </div>
          <div>
            <h2>{t.footer.company}</h2>
            <ul>
              <li><Link href={href(locale, "about")}>{t.nav.about}</Link></li>
              <li><Link href={href(locale, "faq")}>{t.nav.faq}</Link></li>
              <li><Link href={href(locale, "contact")}>{t.nav.contact}</Link></li>
              {siteConfig.telegramUrl && <li><a href={siteConfig.telegramUrl} target="_blank" rel="noopener noreferrer">Telegram</a></li>}
            </ul>
          </div>
          <div>
            <h2>{t.footer.legal}</h2>
            <ul>
              <li><Link href={href(locale, "privacy")}>{t.privacy.title}</Link></li>
              <li><Link href={href(locale, "terms")}>{t.terms.title}</Link></li>
            </ul>
          </div>
        </div>
        <div className="ftr-bottom">
          <p>{t.footer.disclaimer}</p>
          <span>© {year} {siteConfig.companyName || siteConfig.productName}{siteConfig.developerName && <> · {t.footer.builtBy} {siteConfig.developerName}</>}</span>
        </div>
      </div>
    </footer>
  );
}
