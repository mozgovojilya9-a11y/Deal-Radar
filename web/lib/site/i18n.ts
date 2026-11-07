import { en } from "./dictionaries/en";
import { nl } from "./dictionaries/nl";

export const LOCALES = ["nl", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "nl";

export type PageKey = "home" | "how" | "features" | "categories" | "about" | "faq" | "contact" | "privacy" | "terms";
export type SubPageKey = Exclude<PageKey, "home">;

/** Localised, human-readable URL slugs. Changing one changes a public URL — keep them stable. */
export const SLUGS: Record<Locale, Record<SubPageKey, string>> = {
  nl: {
    how: "hoe-het-werkt", features: "functies", categories: "categorieen", about: "over-ons",
    faq: "veelgestelde-vragen", contact: "contact", privacy: "privacy", terms: "voorwaarden",
  },
  en: {
    how: "how-it-works", features: "features", categories: "categories", about: "about",
    faq: "faq", contact: "contact", privacy: "privacy", terms: "terms",
  },
};

export const SUB_PAGES = Object.keys(SLUGS.nl) as SubPageKey[];

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function pageFromSlug(locale: Locale, slug: string): SubPageKey | null {
  const entry = (Object.entries(SLUGS[locale]) as Array<[SubPageKey, string]>).find(([, value]) => value === slug);
  return entry ? entry[0] : null;
}

/** Path of a page in a locale, e.g. href("nl", "how") → "/nl/hoe-het-werkt". */
export function href(locale: Locale, page: PageKey, hash?: string): string {
  const path = page === "home" ? "/" + locale : "/" + locale + "/" + SLUGS[locale][page];
  return hash ? path + "#" + hash : path;
}

const DICTIONARIES = { nl, en } as const;
export type Dictionary = typeof nl;

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}

export const HTML_LANG: Record<Locale, string> = { nl: "nl-NL", en: "en" };
export const OG_LOCALE: Record<Locale, string> = { nl: "nl_NL", en: "en_GB" };
