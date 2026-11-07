import type { MetadataRoute } from "next";
import { href, LOCALES, SUB_PAGES, type PageKey } from "@/lib/site/i18n";
import { absolute } from "@/lib/site/seo";

const PRIORITY: Partial<Record<PageKey, number>> = { home: 1, how: 0.8, features: 0.8, categories: 0.8, faq: 0.7, about: 0.6, contact: 0.6, privacy: 0.3, terms: 0.3 };

export default function sitemap(): MetadataRoute.Sitemap {
  const pages: PageKey[] = ["home", ...SUB_PAGES];
  return pages.flatMap((page) => LOCALES.map((locale) => ({
    url: absolute(href(locale, page)),
    changeFrequency: page === "home" || page === "categories" ? "daily" as const : "monthly" as const,
    priority: PRIORITY[page] ?? 0.5,
    alternates: { languages: Object.fromEntries(LOCALES.map((code) => [code === "nl" ? "nl-NL" : "en", absolute(href(code, page))])) },
  })));
}
