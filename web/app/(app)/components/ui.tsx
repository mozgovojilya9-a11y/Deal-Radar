"use client";

export function euro(value: number | null | undefined, decimals = false): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const amount = Number(value);
  return new Intl.NumberFormat("nl-NL", {
    style: "currency", currency: "EUR",
    minimumFractionDigits: decimals && amount % 1 ? 2 : 0,
    maximumFractionDigits: decimals && amount % 1 ? 2 : 0,
  }).format(amount);
}

export function ageLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "—";
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60000));
  if (minutes < 1) return "только что";
  if (minutes < 60) return minutes + " мин назад";
  const hours = Math.round(minutes / 60);
  return hours < 24 ? hours + " ч назад" : Math.round(hours / 24) + " дн назад";
}

export function dateLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(date);
}

export function pct(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "—" : Math.round(value * 100) + "%";
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m = n % 10, h = n % 100;
  return h >= 11 && h <= 14 ? many : m === 1 ? one : m >= 2 && m <= 4 ? few : many;
}

const ICONS = {
  home: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  heart: "M12 21s-8-5.3-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.7-8 11-8 11z",
  sliders: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4",
  pin: "M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 3v3M12 18v3M3 12h3M18 12h3",
  close: "M6 6l12 12M18 6L6 18",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6",
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z",
};

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

/** Deal score 0–100 as a small ring; the colour follows the score band. */
export function ScoreRing({ score, size = 38 }: { score: number; size?: number }) {
  const value = Math.max(0, Math.min(100, Math.round(score)));
  const tone = value >= 75 ? "top" : value >= 55 ? "solid" : value >= 35 ? "fair" : "weak";
  const radius = 15.5;
  const length = 2 * Math.PI * radius;
  return (
    <span className={"score-ring s-" + tone} style={{ width: size, height: size }} role="img" aria-label={"Балл сделки " + value + " из 100"}>
      <svg viewBox="0 0 36 36" width={size} height={size} aria-hidden="true">
        <circle cx="18" cy="18" r={radius} className="score-track" />
        <circle cx="18" cy="18" r={radius} className="score-arc" strokeDasharray={(length * value) / 100 + " " + length} transform="rotate(-90 18 18)" />
      </svg>
      <b>{value}</b>
    </span>
  );
}

export const STATUS_LABEL = { strong: "Очень выгодно", good: "Хорошая цена", candidate: "На проверке", reserved: "Зарезервировано" } as const;
export const CONFIDENCE_LABEL: Record<string, string> = {
  high: "высокая", preliminary: "предварительная", retail_proxy: "по цене нового", none: "нет данных",
};
