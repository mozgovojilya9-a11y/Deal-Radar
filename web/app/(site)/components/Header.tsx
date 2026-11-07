"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { href, LOCALES, pageFromSlug, type Dictionary, type Locale, type PageKey } from "@/lib/site/i18n";
import { siteConfig } from "@/site-config";
import { Icon } from "./Icon";

type NavKey = "home" | "how" | "features" | "categories" | "about" | "faq" | "contact";
const NAV: NavKey[] = ["home", "how", "features", "categories", "about", "faq", "contact"];

function currentPage(pathname: string, locale: Locale): PageKey | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== locale) return null;
  if (parts.length === 1) return "home";
  return pageFromSlug(locale, parts[1]);
}

export function Header({ locale, nav }: { locale: Locale; nav: Dictionary["nav"] }) {
  const pathname = usePathname() || "/" + locale;
  const page = currentPage(pathname, locale);
  const [open, setOpen] = useState(false);

  // Close the mobile menu with Escape; lock page scroll while it is open. Links close it on click.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = previous; };
  }, [open]);

  const langSwitch = (
    <nav className="lang" aria-label={nav.language}>
      {LOCALES.map((code) => (
        <Link key={code} href={href(code, page ?? "home")} hrefLang={code} lang={code} aria-current={code === locale ? "true" : undefined}>
          {code.toUpperCase()}
        </Link>
      ))}
    </nav>
  );

  return (
    <>
      <a className="skip" href="#main">{nav.skip}</a>
      <header className="hdr">
        <div className="wrap hdr-in">
          <Link className="logo" href={href(locale, "home")} aria-label={`${siteConfig.productName} — ${nav.home}`}>
            <span className="logo-mark"><Icon name="radar" size={18} strokeWidth={2} /></span>
            {siteConfig.productName}
          </Link>
          <nav className="nav" aria-label={nav.primary}>
            {NAV.filter((key) => key !== "home").map((key) => (
              <Link key={key} href={href(locale, key)} aria-current={page === key ? "page" : undefined}>{nav[key]}</Link>
            ))}
          </nav>
          <div className="hdr-actions">
            {langSwitch}
            <a className="btn btn-primary btn-sm" href={siteConfig.appPath}>{nav.open}<Icon name="arrow" size={16} className="arrow" /></a>
            <button className="menu-btn" type="button" aria-expanded={open} aria-controls="mobile-nav"
              aria-label={open ? nav.close : nav.menu} onClick={() => setOpen((value) => !value)}>
              <Icon name={open ? "close" : "menu"} size={20} />
            </button>
          </div>
        </div>
      </header>
      {open && (
        <div className="mnav" id="mobile-nav">
          <nav aria-label={nav.primary}>
            {NAV.map((key) => (
              <Link className="mlink" key={key} href={href(locale, key)} aria-current={page === key ? "page" : undefined} onClick={() => setOpen(false)}>
                {nav[key]}<Icon name="arrow" size={18} />
              </Link>
            ))}
          </nav>
          <a className="btn btn-primary" href={siteConfig.appPath}>{nav.open}<Icon name="arrow" size={16} className="arrow" /></a>
          {langSwitch}
        </div>
      )}
    </>
  );
}
