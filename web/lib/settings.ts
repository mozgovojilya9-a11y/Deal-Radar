export type UserLocation = {
  label: string;
  city: string;
  postcode: string | null;
  lat: number;
  lon: number;
  source: "gps" | "manual";
};

export type SearchSettings = {
  location: UserLocation | null;
  /** null = the whole Netherlands, no distance limit. */
  radiusKm: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  minDiscount: number;
  minProfit: number | null;
  minRoi: number | null;
  categories: string[];
  condition: "all" | "new" | "used";
  exactOnly: boolean;
  priority: "profit" | "distance";
  /** Only listings published in the last N days (null = no limit). */
  maxAgeDays: number | null;
  /** Brand / model words that must appear in the title, e.g. "sony a7". */
  textFilter: string;
};

export const SETTINGS_KEY = "deal-radar-settings";
/** Categories the radar no longer scans: dropped from saved filters so they cannot empty the catalog. */
const RETIRED_CATEGORIES = new Set(["bag-fjallraven", "bag-osprey", "bag-deuter", "bag-eastpak",
  "camera-nikon", "camera-fujifilm", "camera-panasonic", "microphone-shure", "microphone-rode", "microphone-sennheiser", "airpods-pro-3", "airpods-5", "airpods-pro-2", "watch-casio", "ps4", "xbox-series"]);
export const SETTINGS_VERSION = 2;
export const RADIUS_STEPS: Array<number | null> = [5, 10, 20, 30, 50, 75, 100, 150, null];
export const PRICE_PRESETS: Array<{ label: string; min: number | null; max: number | null }> = [
  { label: "Любая", min: null, max: null },
  { label: "до €100", min: null, max: 100 },
  { label: "€100–300", min: 100, max: 300 },
  { label: "€300–700", min: 300, max: 700 },
  { label: "€700–1500", min: 700, max: 1500 },
  { label: "от €1500", min: 1500, max: null },
];

export const DEFAULT_SETTINGS: SearchSettings = {
  location: null,
  radiusKm: null,
  minPrice: null,
  maxPrice: null,
  minDiscount: 0,
  minProfit: null,
  minRoi: null,
  categories: [],
  condition: "all",
  exactOnly: false,
  priority: "profit",
  maxAgeDays: 30,
  textFilter: "",
};

const finite = (value: unknown, min: number, max: number): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;

function readLocation(value: unknown): UserLocation | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const lat = finite(row.lat, -90, 90);
  const lon = finite(row.lon, -180, 180);
  if (lat === null || lon === null) return null;
  return {
    label: String(row.label || row.city || "").slice(0, 120),
    city: String(row.city || "").slice(0, 80),
    postcode: typeof row.postcode === "string" && /^\d{4}[A-Z]{0,2}$/.test(row.postcode) ? row.postcode : null,
    lat, lon,
    source: row.source === "gps" ? "gps" : "manual",
  };
}

/** Reads stored settings, migrating v1 values without inventing limits (no implicit €800 cap). */
export function readSettings(raw: unknown): SearchSettings {
  const stored = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const isV2 = stored.version === SETTINGS_VERSION;
  const categories = Array.isArray(stored.categories)
    ? stored.categories.filter((key): key is string => typeof key === "string" && /^[a-z0-9-]{1,64}$/i.test(key))
      .map((key) => key === "airpods-pro" ? "airpods-pro-3" : key === "airpods" ? "airpods-5" : key)
      .filter((key) => !RETIRED_CATEGORIES.has(key))
    : [];
  // v1 stored an automatic €800 maxPrice unless the user had touched the filter.
  const maxPrice = isV2 || stored.priceFilterConfigured === true ? finite(stored.maxPrice, 0.01, 1_000_000) : null;
  const radius = finite(stored.radiusKm, 1, 2000);
  return {
    location: readLocation(stored.location),
    radiusKm: radius !== null && RADIUS_STEPS.includes(radius) ? radius : radius,
    minPrice: finite(stored.minPrice, 0.01, 1_000_000),
    maxPrice,
    minDiscount: finite(stored.minDiscount, 0, 90) ?? 0,
    minProfit: finite(stored.minProfit, -100_000, 1_000_000),
    minRoi: finite(stored.minRoi, -100, 10_000),
    categories,
    condition: stored.condition === "new" || stored.condition === "used" ? stored.condition : "all",
    exactOnly: stored.exactOnly === true,
    priority: stored.priority === "distance" ? "distance" : "profit",
    maxAgeDays: stored.maxAgeDays === null ? null : finite(stored.maxAgeDays, 1, 365) ?? 30,
    textFilter: typeof stored.textFilter === "string" ? stored.textFilter.slice(0, 60) : "",
  };
}

export function loadSettings(): SearchSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? readSettings(JSON.parse(raw)) : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: SearchSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, version: SETTINGS_VERSION, priceFilterConfigured: true }));
  } catch { /* storage unavailable: settings still apply for this session */ }
}

export function settingsQuery(settings: SearchSettings, sort: string): URLSearchParams {
  const params = new URLSearchParams({ sort });
  if (settings.location) {
    params.set("lat", String(settings.location.lat));
    params.set("lon", String(settings.location.lon));
    if (settings.radiusKm !== null) params.set("radiusKm", String(settings.radiusKm));
  }
  if (settings.minPrice !== null) params.set("minPrice", String(settings.minPrice));
  if (settings.maxPrice !== null) params.set("maxPrice", String(settings.maxPrice));
  if (settings.minDiscount > 0) params.set("minDiscount", String(settings.minDiscount));
  if (settings.minProfit !== null) params.set("minProfit", String(settings.minProfit));
  if (settings.minRoi !== null) params.set("minRoi", String(settings.minRoi));
  if (settings.categories.length) params.set("categories", settings.categories.join(","));
  if (settings.condition !== "all") params.set("condition", settings.condition);
  if (settings.exactOnly) params.set("exactOnly", "1");
  params.set("priority", settings.priority);
  if (settings.maxAgeDays !== null) params.set("maxAgeDays", String(settings.maxAgeDays));
  if (settings.textFilter.trim()) params.set("q", settings.textFilter.trim());
  return params;
}

export function activeSettingsCount(settings: SearchSettings): number {
  return [
    settings.location && settings.radiusKm !== null,
    settings.minPrice !== null,
    settings.maxPrice !== null,
    settings.minDiscount > 0,
    settings.minProfit !== null,
    settings.minRoi !== null,
    settings.categories.length > 0,
    settings.condition !== "all",
    settings.exactOnly,
    settings.maxAgeDays !== null && settings.maxAgeDays !== 30,
    Boolean(settings.textFilter.trim()),
  ].filter(Boolean).length;
}

export function radiusLabel(value: number | null): string {
  return value === null ? "Вся страна" : value + " км";
}
