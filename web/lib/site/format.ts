import type { Locale } from "./i18n";

const INTL: Record<Locale, string> = { nl: "nl-NL", en: "en-GB" };

export function euro(value: number | null | undefined, locale: Locale): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(INTL[locale], { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

export function percent(fraction: number | null | undefined, locale: Locale): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return "—";
  return new Intl.NumberFormat(INTL[locale], { style: "percent", maximumFractionDigits: 0 }).format(fraction);
}

export function count(value: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL[locale]).format(value);
}

/** Absolute date + time in Dutch local time, e.g. "7 nov 2026, 20:37". */
export function dateTime(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(INTL[locale], {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam",
  }).format(date);
}
