import { CATEGORIES } from "@/lib/categories";
import type { Locale } from "./i18n";

/** Site group keys, in the same order as CATEGORY_GROUPS in lib/categories.ts. */
export const GROUP_KEYS = [
  "phones", "computers", "consoles", "audio", "cameras", "tv", "smartwatches", "watches", "bags", "eyewear",
] as const;
export type GroupKey = (typeof GROUP_KEYS)[number];

const GROUP_BY_RU: Record<string, GroupKey> = {
  "Телефоны и планшеты": "phones",
  "Компьютеры": "computers",
  "Игровые консоли": "consoles",
  "Наушники и аудио": "audio",
  "Камеры и объективы": "cameras",
  "Телевизоры и техника": "tv",
  "Умные часы": "smartwatches",
  "Обычные часы": "watches",
  "Сумки и рюкзаки": "bags",
  "Очки": "eyewear",
};

/** The app's category labels are partly Russian; the website needs Dutch and English ones. */
const LABEL_PATTERNS: Array<[RegExp, Record<Locale, (brand: string) => string>]> = [
  [/^Наушники (.+)$/, { nl: (b) => `${b}-koptelefoons`, en: (b) => `${b} headphones` }],
  [/^Микрофоны (.+)$/, { nl: (b) => `${b}-microfoons`, en: (b) => `${b} microphones` }],
  [/^Камеры (.+)$/, { nl: (b) => `${b}-camera's`, en: (b) => `${b} cameras` }],
  [/^Объективы (.+)$/, { nl: (b) => `${b}-objectieven`, en: (b) => `${b} lenses` }],
  [/^Сумки (.+)$/, { nl: (b) => `${b}-tassen`, en: (b) => `${b} bags` }],
  [/^Рюкзаки (.+)$/, { nl: (b) => `${b}-rugzakken`, en: (b) => `${b} backpacks` }],
];
const FIXED_LABELS: Record<string, Record<Locale, string>> = {
  "Дроны": { nl: "Drones", en: "Drones" },
  "Телевизоры": { nl: "Televisies", en: "TVs" },
};

export function siteCategoryLabel(key: string, locale: Locale): string {
  const label = CATEGORIES.find((item) => item.key === key)?.label;
  if (!label) return key;
  if (FIXED_LABELS[label]) return FIXED_LABELS[label][locale];
  for (const [pattern, make] of LABEL_PATTERNS) {
    const match = label.match(pattern);
    if (match) return make[locale](match[1]);
  }
  return label;
}

export function siteGroupOf(key: string): GroupKey | null {
  const group = CATEGORIES.find((item) => item.key === key)?.group;
  return group ? GROUP_BY_RU[group] ?? null : null;
}

export type CategoryGroup = { key: GroupKey; items: Array<{ key: string; label: string }> };

/** Every category the scanner is configured for, grouped for the website. */
export function categoryGroups(locale: Locale): CategoryGroup[] {
  return GROUP_KEYS.map((group) => ({
    key: group,
    items: CATEGORIES.filter((item) => GROUP_BY_RU[item.group] === group)
      .map((item) => ({ key: item.key, label: siteCategoryLabel(item.key, locale) })),
  })).filter((group) => group.items.length > 0);
}

/** Category keys that belong to each "in focus" block on the categories page. */
export const FOCUS_KEYS: Record<string, string[]> = {
  airpods: ["airpods-pro-2", "airpods-pro-3", "airpods-max", "airpods-5"],
  rayban: ["rayban"],
  playstation: ["ps5", "ps4"],
  tv: ["televisions"],
  cameras: ["camera-sony", "camera-canon", "camera-nikon", "camera-fujifilm", "camera-panasonic", "lens-sony-fe", "action-camera-gopro"],
  drones: ["drones"],
  bags: ["bag-michael-kors", "backpack-michael-kors", "bag-northface"],
  microphones: ["microphone-shure", "microphone-rode", "microphone-dji", "microphone-sennheiser"],
  electronics: ["iphone-16", "iphone-15", "iphone-14", "iphone-13", "iphone-12", "galaxy-s", "ipad", "macbook", "ssd-samsung", "ssd-sandisk", "steam-deck", "switch", "xbox-series", "apple-watch", "sonos", "dyson"],
};

export const TOTAL_SEARCHES = CATEGORIES.length;
