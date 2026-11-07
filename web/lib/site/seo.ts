import type { Metadata } from "next";
import { siteConfig, siteUrl } from "@/site-config";
import { getDictionary, href, LOCALES, OG_LOCALE, DEFAULT_LOCALE, type Locale, type PageKey } from "./i18n";

export function absolute(path: string): string {
  return siteUrl() + path;
}

/** Title, description, canonical, hreflang alternates, Open Graph and X card for one page. */
export function pageMetadata(locale: Locale, page: PageKey): Metadata {
  const t = getDictionary(locale);
  const { title, description } = t.meta.pages[page];
  const path = href(locale, page);
  const languages: Record<string, string> = {};
  for (const code of LOCALES) languages[code === "nl" ? "nl-NL" : "en"] = href(code, page);
  languages["x-default"] = href(DEFAULT_LOCALE, page);

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path, languages },
    openGraph: {
      type: "website",
      url: path,
      siteName: siteConfig.productName,
      title,
      description,
      locale: OG_LOCALE[locale],
      alternateLocale: LOCALES.filter((code) => code !== locale).map((code) => OG_LOCALE[code]),
    },
    twitter: { card: "summary_large_image", title, description },
  };
}
