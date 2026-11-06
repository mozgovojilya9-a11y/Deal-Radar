"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Deal, ScannerStats } from "@/lib/deals";

type Tab = "home" | "strong" | "categories" | "saved" | "analytics" | "profile";
type Sort = "profit" | "discount" | "newest" | "price";
type TelegramProfile = { id: number; firstName: string; lastName: string; username: string };
type MatchType = "exact" | "variant" | "related" | "accessory" | "unrelated";
type ResearchListing = { title: string; price: number; url: string; source: string; condition: "used" | "new" | "unknown"; kind: "marktplaats" | "web"; estimatedProfit?: number | null; profitRoi?: number | null; status?: string; matchType?: MatchType; matchConfidence?: number; matchReason?: string };
type ProductResearch = {
  query: string; maxPrice: number; checkedAt: string; usedMedian: number | null; newMedian: number | null;
  expectedResalePrice: number | null; netResalePrice: number | null; sampleCount: number;
  sources: { marktplaats: { count: number; medianPrice: number | null }; otherUsed: { count: number; medianPrice: number | null }; newRetail: { count: number; medianPrice: number | null } };
  ai?: { enabled: boolean; available: boolean; model: string; productSummary: string; keyAttributes: string[]; marketSummary: string; exactMatches: number; variants: number; reviewedOffers: number };
  searchQueries?: string[];
  listings: ResearchListing[]; webOffers: ResearchListing[]; warnings: string[];
};
type UserSettings = { categories: string[]; minDiscount: number; maxDistanceKm: number | null; minPrice: number | null; maxPrice: number | null };
const DEFAULT_SETTINGS: UserSettings = { categories: [], minDiscount: 0, maxDistanceKm: null, minPrice: null, maxPrice: 800 };
const SETTINGS_KEY = "deal-radar-settings";
const REFRESH_INTERVAL_MS = 120_000;
const DISCOUNT_STEPS = [0, 10, 20, 30, 40, 50];
const CATEGORIES = [
  { key: "", label: "Все", icon: "✦" },
  { key: "iphone-16", label: "iPhone 16", icon: "▣" },
  { key: "iphone-15", label: "iPhone 15", icon: "▣" },
  { key: "iphone-14", label: "iPhone 14", icon: "▣" },
  { key: "iphone-13", label: "iPhone 13", icon: "▣" },
  { key: "iphone-12", label: "iPhone 12", icon: "▣" },
  { key: "ps5", label: "PlayStation 5", icon: "⌘" },
  { key: "ps4", label: "PlayStation 4", icon: "⌘" },
  { key: "televisions", label: "Телевизоры", icon: "▣" },
  { key: "camera-sony", label: "Камеры Sony", icon: "◎" },
  { key: "camera-canon", label: "Камеры Canon", icon: "◎" },
  { key: "camera-nikon", label: "Камеры Nikon", icon: "◎" },
  { key: "camera-fujifilm", label: "Камеры Fujifilm", icon: "◎" },
  { key: "camera-panasonic", label: "Камеры Panasonic", icon: "◎" },
  { key: "action-camera-gopro", label: "Экшн-камеры GoPro", icon: "◎" },
  { key: "drones", label: "Дроны", icon: "◇" },
  { key: "bag-michael-kors", label: "Сумки Michael Kors", icon: "▱" },
  { key: "backpack-michael-kors", label: "Рюкзаки Michael Kors", icon: "▱" },
  { key: "microphone-shure", label: "Микрофоны Shure", icon: "◉" },
  { key: "microphone-rode", label: "Микрофоны RØDE", icon: "◉" },
  { key: "microphone-dji", label: "Микрофоны DJI", icon: "◉" },
  { key: "microphone-sennheiser", label: "Микрофоны Sennheiser", icon: "◉" },
  { key: "headphones-sony", label: "Наушники Sony", icon: "◉" },
  { key: "headphones-bose", label: "Наушники Bose", icon: "◉" },
  { key: "headphones-sennheiser", label: "Наушники Sennheiser", icon: "◉" },
  { key: "headphones-jbl", label: "Наушники JBL", icon: "◉" },
  { key: "headphones-beats", label: "Наушники Beats", icon: "◉" },
  { key: "airpods-pro-3", label: "AirPods Pro 3", icon: "◉" },
  { key: "airpods-max", label: "AirPods Max", icon: "◉" },
  { key: "airpods-5", label: "AirPods 5", icon: "◉" },
  { key: "rayban", label: "Ray-Ban", icon: "◇" },
  { key: "watch-diesel", label: "Часы Diesel", icon: "◷" },
  { key: "watch-boss", label: "Hugo Boss", icon: "◷" },
  { key: "watch-tommy", label: "Tommy Hilfiger", icon: "◷" },
  { key: "watch-casio", label: "Casio", icon: "◷" },
  { key: "watch-tissot", label: "Tissot", icon: "◷" },
  { key: "bag-fjallraven", label: "Fjällräven", icon: "▱" },
  { key: "bag-northface", label: "The North Face", icon: "▱" },
  { key: "bag-osprey", label: "Osprey", icon: "▱" },
  { key: "bag-deuter", label: "Deuter", icon: "▱" },
  { key: "bag-eastpak", label: "Eastpak", icon: "▱" }
];

const CATEGORY_GROUPS: { title: string; icon: string; test: (key: string) => boolean }[] = [
  { title: "Телефоны", icon: "📱", test: (k) => k.startsWith("iphone") },
  { title: "Игровые консоли", icon: "🎮", test: (k) => /^ps\d/.test(k) },
  { title: "Наушники", icon: "🎧", test: (k) => k.startsWith("headphones") || k.startsWith("airpods") },
  { title: "Микрофоны", icon: "🎙️", test: (k) => k.startsWith("microphone") },
  { title: "Камеры", icon: "📷", test: (k) => k.startsWith("camera") || k.startsWith("action-camera") },
  { title: "Техника", icon: "📺", test: (k) => k === "televisions" || k === "drones" },
  { title: "Часы", icon: "⌚", test: (k) => k.startsWith("watch") },
  { title: "Сумки и рюкзаки", icon: "🎒", test: (k) => k.startsWith("bag") || k.startsWith("backpack") },
  { title: "Очки", icon: "🕶️", test: (k) => k === "rayban" },
  { title: "Другое", icon: "🛍️", test: () => true }
];
function groupOf(key: string) {
  return (CATEGORY_GROUPS.find((group) => group.test(key)) ?? CATEGORY_GROUPS[CATEGORY_GROUPS.length - 1]).title;
}
const GROUPED_CATEGORIES = CATEGORY_GROUPS
  .map((group) => ({ ...group, items: CATEGORIES.filter((item) => item.key && groupOf(item.key) === group.title) }))
  .filter((group) => group.items.length);
const DISTANCE_STEPS = [null, 10, 25, 50, 100];
function finds(n: number) {
  const m = n % 10, h = n % 100;
  return h >= 11 && h <= 14 ? "находок" : m === 1 ? "находка" : m >= 2 && m <= 4 ? "находки" : "находок";
}
const ICONS = {
  home: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  heart: "M12 21s-8-5.3-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.7-8 11-8 11z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0"
};
function Icon({ name }: { name: keyof typeof ICONS }) {
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name]} /></svg>;
}

function euro(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(value));
}
 
function priceValue(raw: string): number | null {
  const parsed = Number(raw.replace(",", "."));
  return raw.trim() !== "" && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

const SEARCH_STOP_WORDS = new Set(["a", "an", "and", "for", "the", "with", "de", "het", "een", "voor", "met", "и", "для"]);
const SEARCH_PRODUCT_ALIASES = [
  { names: ["playstation 5", "ps5", "плейстейшен 5", "плейстейшн 5", "пс5", "пс 5"], console: true },
  { names: ["playstation 4", "ps4", "плейстейшен 4", "плейстейшн 4", "пс4", "пс 4"], console: true },
  { names: ["airpods"], accessoryTerms: ["case", "hoesje", "charger", "oplader", "eartips", "replacement", "siliconen"] },
  { names: ["ray ban", "rayban", "ray-ban", "рейбан", "рей бен", "meta wayfarer", "wayfarer"], accessoryTerms: ["case", "hoesje", "etui", "pouch", "replacement", "lens", "lenses"] }
];
const CONSOLE_ACCESSORIES = new Set(["controller", "controllers", "dualsense", "dualshock", "gamepad", "headset", "remote", "stand", "skin", "sticker", "hoesje", "case", "koffer"]);

function searchTokens(value: string): string[] {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\b(1st|2nd|3rd|4th)\b/g, (_, ordinal: string) => ordinal[0])
    .replace(/([\p{L}])([\p{N}])/gu, "$1 $2")
    .replace(/([\p{N}])([\p{L}])/gu, "$1 $2")
    .match(/[\p{L}\p{N}]+/gu) ?? [];
}

function containsPhrase(textTokens: string[], phrase: string): boolean {
  const phraseTokens = searchTokens(phrase);
  return phraseTokens.length > 0 && textTokens.some((_, index) =>
    phraseTokens.every((token, offset) => textTokens[index + offset] === token));
}

function isOneEditAway(left: string, right: string): boolean {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  let leftIndex = 0, rightIndex = 0, edits = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex++;
      rightIndex++;
      continue;
    }
    if (++edits > 1) return false;
    if (leftIndex + 1 < left.length && rightIndex + 1 < right.length
      && left[leftIndex] === right[rightIndex + 1] && left[leftIndex + 1] === right[rightIndex]) {
      leftIndex += 2;
      rightIndex += 2;
    } else if (left.length > right.length) {
      leftIndex++;
    } else if (right.length > left.length) {
      rightIndex++;
    } else {
      leftIndex++;
      rightIndex++;
    }
  }
  return edits + Number(leftIndex < left.length || rightIndex < right.length) <= 1;
}

function tokenMatches(queryToken: string, productTokens: string[]): boolean {
  return productTokens.some((token) => token === queryToken
    || (queryToken.length >= 5 && token.length >= 5 && isOneEditAway(queryToken, token)));
}

function queryAliasStart(queryTokens: string[], alias: string): number {
  const aliasTokens = searchTokens(alias);
  if (!aliasTokens.length) return -1;
  return queryTokens.findIndex((_, index) =>
    aliasTokens.every((token, offset) => {
      const queryToken = queryTokens[index + offset];
      return queryToken !== undefined && (token === queryToken
        || (token.length >= 5 && queryToken.length >= 5 && isOneEditAway(token, queryToken)));
    }));
}

function matchesSearchIntent(product: string, query: string, title = product): boolean {
  const queryTokens = searchTokens(query);
  if (!queryTokens.length) return false;
  const productTokens = searchTokens(product);
  const titleTokens = searchTokens(title);
  const significantTokens = queryTokens.filter((token) => !SEARCH_STOP_WORDS.has(token));
  if (!significantTokens.length) return false;

  const intent = SEARCH_PRODUCT_ALIASES.find(({ names }) =>
    names.some((name) => queryAliasStart(queryTokens, name) >= 0));

  if (intent) {
    const matchedAlias = intent.names
      .map((name) => ({ name, start: queryAliasStart(queryTokens, name) }))
      .find((match) => match.start >= 0);
    if (!matchedAlias) return false;
    const matchedTitleAlias = intent.names.some((name) => containsPhrase(titleTokens, name));
    if (!matchedTitleAlias) return false;

    const aliasLength = searchTokens(matchedAlias.name).length;
    const extraQueryTokens = queryTokens.slice(0, matchedAlias.start)
      .concat(queryTokens.slice(matchedAlias.start + aliasLength))
      .filter((token) => !SEARCH_STOP_WORDS.has(token));
    const accessoryTerms = [...CONSOLE_ACCESSORIES, ...(intent.accessoryTerms ?? [])];
    const requestedAccessory = extraQueryTokens.some((token) => accessoryTerms.includes(token)
      || ["disc", "drive", "game", "games"].includes(token));
    if (!requestedAccessory) {
      const titleIsAccessory = titleTokens.some((token) => accessoryTerms.includes(token))
        || containsPhrase(titleTokens, "disc drive");
      const titleShowsIncludedItems = /(?:\+|met|with|incl(?:uding)?|inclusief).{0,30}\b(?:\d+\s*)?(?:controllers?|games?|case|hoesje|charger|oplader)\b/.test(title.toLowerCase());
      const titleShowsProduct = intent.console
        ? titleTokens.includes("console") || titleTokens.includes("set") || titleShowsIncludedItems
        : titleTokens.includes("bundle") || titleTokens.includes("set") || titleShowsIncludedItems;
      if (titleIsAccessory && !titleShowsProduct) return false;
    }

    return extraQueryTokens.every((token) => tokenMatches(token, titleTokens));
  }

  return significantTokens.every((token) => tokenMatches(token, productTokens));
}

function readSettings(raw: unknown): UserSettings {
  const stored = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const positive = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.min(800, value) : null);
  const categories = Array.isArray(stored.categories) ? stored.categories.filter((key): key is string => typeof key === "string")
    .map((key) => key === "airpods-pro" ? "airpods-pro-3" : key === "airpods" ? "airpods-5" : key) : [];
  return {
    categories,
    minDiscount: typeof stored.minDiscount === "number" && Number.isInteger(stored.minDiscount) ? Math.min(90, Math.max(0, stored.minDiscount)) : 0,
    maxDistanceKm: positive(stored.maxDistanceKm),
    minPrice: positive(stored.minPrice),
    maxPrice: positive(stored.maxPrice)
  };
}

function ageLabel(value: string | null | undefined) {
  if (!value) return "—";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "—";
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60000));
  if (minutes < 1) return "только что";
  if (minutes < 60) return minutes + " мин назад";
  const hours = Math.round(minutes / 60);
  return hours < 24 ? hours + " ч назад" : Math.round(hours / 24) + " дн назад";
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "Недавно";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Недавно";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(date);
}

function DealCard({ deal, saved, onSave, onOpen }: {
  deal: Deal;
  saved: boolean;
  onSave: () => void;
  onOpen: () => void;
}) {
  const candidate = deal.status === "candidate";
  const good = deal.status === "good";
  const hasEstimate = deal.market_price !== null && deal.market_price !== undefined;
  const discount = deal.discount == null ? null : Math.max(0, Math.round(Number(deal.discount) * 100));
  const statusLabel = candidate ? "Нужно проверить" : good ? "Хорошая цена" : "Очень выгодно";
  return (
    <article className={"deal-card" + (candidate ? " candidate-card" : "") + (good ? " good-card" : "")}>
      <button className="image-button" onClick={onOpen} aria-label={"Открыть " + deal.title}>
        <div className="deal-image">
          {deal.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={deal.image_url} alt={deal.title} loading="lazy" referrerPolicy="no-referrer" />
          ) : <span className="image-fallback">✦</span>}
          <span className={"discount-pill" + (candidate ? " candidate-pill" : "") + (good ? " good-pill" : "")}>
            {discount === null ? "На проверке" : candidate ? "≈ −" + discount + "%" : "−" + discount + "%"}
          </span>
        </div>
      </button>
      <div className="deal-content">
        <div className="deal-meta"><span>{deal.category_label}</span><span>{dateLabel(deal.posted_at || deal.detected_at)}</span></div>
        <div className={"deal-status " + (candidate ? "candidate" : good ? "good" : "strong")}>{statusLabel}</div>
        <button className="deal-title" onClick={onOpen}>{deal.title}</button>
        <div className="price-row">
          <strong>{euro(deal.price)}</strong>
          <span className="old-price">{hasEstimate ? "≈ " + euro(deal.market_price) : "Рынок уточняется"}</span>
        </div>
        {deal.estimated_profit != null ? (
          <div className={"saving-line" + (candidate ? " preliminary-saving" : "")}>
            <span>{candidate ? "Предварительная прибыль" : "Прибыль после расходов"}</span>
            <strong>{euro(deal.estimated_profit)}</strong>
          </div>
        ) : hasEstimate && discount !== null ? (
          <div className={"saving-line" + (candidate ? " preliminary-saving" : "")}>
            <span>{candidate ? "Предварительная разница" : "Ориентир экономии"}</span>
            <strong>{euro(Number(deal.market_price) - Number(deal.price))}</strong>
          </div>
        ) : <p className="candidate-explanation">{deal.evaluation_reason || "Недостаточно похожих объявлений для подтверждения рыночной цены."}</p>}
        <div className="card-footer">
          <span className="location">⌖ {deal.city || "Нидерланды"}{deal.distance_km != null ? <b className="distance"> · {Math.round(deal.distance_km)} км</b> : null}</span>
          <button className={"save-button" + (saved ? " active" : "")} onClick={onSave} aria-label={saved ? "Убрать из избранного" : "В избранное"}>{saved ? "♥" : "♡"}</button>
        </div>
        <a className="card-link" href={deal.listing_url} target="_blank" rel="noopener noreferrer">Открыть на Marktplaats <span>↗</span></a>
      </div>
    </article>
  );
}

export default function HomePage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [researchQuery, setResearchQuery] = useState("");
  const [researchMaxPrice, setResearchMaxPrice] = useState("800");
  const [researchIncludeUsed, setResearchIncludeUsed] = useState(true);
  const [researchIncludeNew, setResearchIncludeNew] = useState(true);
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchError, setResearchError] = useState("");
  const [researchResult, setResearchResult] = useState<ProductResearch | null>(null);
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<Sort>("profit");
  const [tab, setTab] = useState<Tab>("home");
  const [search, setSearch] = useState("");
  const [saved, setSaved] = useState<string[]>([]);
  const [selected, setSelected] = useState<Deal | null>(null);
  const [profile, setProfile] = useState<TelegramProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [scannerStats, setScannerStats] = useState<ScannerStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);
  const [catQuery, setCatQuery] = useState("");
  const [catGroup, setCatGroup] = useState<string | null>(null);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    try {
      const storedFavorites = JSON.parse(localStorage.getItem("deal-radar-favorites") || "[]");
      setSaved(Array.isArray(storedFavorites) ? storedFavorites.filter((id) => typeof id === "string") : []);
    } catch {
      setSaved([]);
    }

    try {
      const storedSettings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      if (storedSettings && typeof storedSettings === "object") {
        const next = readSettings(storedSettings);
        setSettings(next);
      }
    } catch {
      try { localStorage.removeItem(SETTINGS_KEY); } catch { /* storage unavailable */ }
    }

    const webApp = window.Telegram?.WebApp;
    if (!webApp) return;
    webApp.ready();
    webApp.expand();
    webApp.setHeaderColor?.("#0a0d12");
    webApp.setBackgroundColor?.("#0a0d12");
    if (!webApp.initData) return;

    void fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: webApp.initData })
    })
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json();
        if (data.authenticated && data.user) setProfile(data.user);
      })
      .catch(() => undefined);
  }, []);

  const loadDeals = useCallback(async (silent = false) => {
    const id = ++requestId.current;
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const params = new URLSearchParams({ sort });
      const response = await fetch("/api/deals?" + params.toString(), { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить предложения");
      if (id !== requestId.current) return;
      setDeals(Array.isArray(data.deals) ? data.deals as Deal[] : []);
      setUpdatedAt(data.scannedAt || data.updatedAt || new Date().toISOString());
      setScannerStats(data.scannerStats && typeof data.scannerStats === "object" ? data.scannerStats as ScannerStats : null);
      setError("");
    } catch (err) {
      if (id !== requestId.current) return;
      if (!silent) setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      if (id === requestId.current) { setLoading(false); setRefreshing(false); }
    }
  }, [sort]);

  useEffect(() => {
    void loadDeals();
    const timer = window.setInterval(() => void loadDeals(true), REFRESH_INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void loadDeals(true); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [loadDeals]);

  const base = useMemo(() => {
    let result = deals;
    if (settings.categories.length) result = result.filter((deal) => settings.categories.includes(deal.category_key));
    if (settings.minDiscount > 0) result = result.filter((deal) => deal.discount == null || Number(deal.discount) * 100 >= settings.minDiscount);
    if (settings.maxDistanceKm !== null) result = result.filter((deal) => deal.distance_km === null || Number(deal.distance_km) <= settings.maxDistanceKm!);
    if (settings.minPrice !== null) result = result.filter((deal) => Number(deal.price) >= settings.minPrice!);
    if (settings.maxPrice !== null) result = result.filter((deal) => Number(deal.price) <= settings.maxPrice!);
    return result;
  }, [deals, settings]);

  const filtered = useMemo(() => {
    let result = base;
    if (category.startsWith("group:")) result = result.filter((deal) => groupOf(deal.category_key) === category.slice(6));
    else if (category) result = result.filter((deal) => deal.category_key === category);
    if (search.trim()) {
      const term = search.trim();
      result = result.filter((deal) => matchesSearchIntent(
        deal.title + " " + (deal.description || ""),
        term,
        deal.title
      ));
    }
    return result;
  }, [base, category, search]);

  const savedDeals = useMemo(() => deals.filter((deal) => saved.includes(deal.listing_id)), [deals, saved]);
  const missingSaved = updatedAt && !error ? saved.length - savedDeals.length : 0;
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    base.forEach((deal) => { counts[deal.category_key] = (counts[deal.category_key] || 0) + 1; });
    return counts;
  }, [base]);
  const groupStats = useMemo(() => GROUPED_CATEGORIES.map((group) => {
    const keys = new Set(group.items.map((item) => item.key));
    const list = base.filter((deal) => keys.has(deal.category_key));
    const best = list.reduce((top, deal) => Math.max(top, Math.round(Number(deal.discount || 0) * 100)), 0);
    return { ...group, count: list.length, best };
  }), [base]);
  const openGroup = groupStats.find((group) => group.title === catGroup) ?? null;
  const catMatches = useMemo(() => {
    const term = catQuery.trim().toLocaleLowerCase();
    return term ? CATEGORIES.filter((item) => item.key && (item.label + " " + groupOf(item.key)).toLocaleLowerCase().includes(term)) : [];
  }, [catQuery]);
  const bestDiscount = base.reduce((top, deal) => Math.max(top, Math.round(Number(deal.discount || 0) * 100)), 0);
  const settingsCount = (settings.minDiscount > 0 ? 1 : 0) + (settings.minPrice !== null ? 1 : 0) + (settings.maxPrice !== null ? 1 : 0)
    + (settings.maxDistanceKm !== null ? 1 : 0) + (settings.categories.length ? 1 : 0);
  function pickCategory(key: string) { setCategory(key); setTab("home"); window.scrollTo({ top: 0 }); }

  const strongDeals = useMemo(() => filtered.filter((deal) => !deal.status || deal.status === "strong"), [filtered]);
  const goodDeals = useMemo(() => filtered.filter((deal) => deal.status === "good"), [filtered]);
  const reviewDeals = useMemo(() => filtered.filter((deal) => deal.status === "candidate"), [filtered]);

  function toggleSaved(id: string) {
    setSaved((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      try { localStorage.setItem("deal-radar-favorites", JSON.stringify(next)); } catch { /* storage unavailable */ }
      return next;
    });
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("light");
  }

  function clearUnavailableSaved() {
    const alive = new Set(deals.map((deal) => deal.listing_id));
    const next = saved.filter((id) => alive.has(id));
    setSaved(next);
    try { localStorage.setItem("deal-radar-favorites", JSON.stringify(next)); } catch { /* storage unavailable */ }
  }

  function persistSettings(next: UserSettings) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  }

  function updateFilters(patch: Partial<UserSettings>) {
    const safePatch = { ...patch };
    if (typeof safePatch.maxPrice === "number") safePatch.maxPrice = Math.min(800, Math.max(0, safePatch.maxPrice));
    const next = { ...settings, ...safePatch };
    setSettings(next);
    persistSettings(next);
  }

  async function runProductResearch() {
    const query = researchQuery.trim();
    const maxPrice = Math.min(800, Math.max(10, Number(researchMaxPrice) || 800));
    if (query.length < 3) { setResearchError("Укажи точную модель или название товара."); return; }
    const initData = window.Telegram?.WebApp?.initData || "";
    if (!initData) { setResearchError("Открой приложение внутри Telegram, чтобы запустить веб-исследование."); return; }
    setResearchLoading(true);
    setResearchError("");
    setResearchResult(null);
    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, query, maxPrice, includeUsed: researchIncludeUsed, includeNew: researchIncludeNew })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось провести исследование.");
      setResearchResult(data as ProductResearch);
    } catch (error) {
      setResearchError(error instanceof Error ? error.message : "Ошибка веб-исследования.");
    } finally {
      setResearchLoading(false);
    }
  }

  const activeFilters = (settings.minDiscount > 0 ? 1 : 0) + (settings.minPrice !== null ? 1 : 0) + (settings.maxPrice !== null ? 1 : 0)
    + (settings.maxDistanceKm !== null ? 1 : 0) + (settings.categories.length ? 1 : 0) + (category ? 1 : 0) + (search.trim() ? 1 : 0);

  function resetFilters() {
    setSearch("");
    setCategory("");
    updateFilters({ ...DEFAULT_SETTINGS });
  }

  const strongest = deals.length ? Math.max(...deals.map((deal) => Number(deal.discount) || 0)) : 0;
  const activeCategory = category.startsWith("group:") ? category.slice(6) : CATEGORIES.find((item) => item.key === category)?.label || "Все категории";

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">D<span>↗</span></div>
          <div>
            <div className="brand-name">deal radar</div>
            <div className="brand-tagline">умнее находи · выгоднее покупай</div>
          </div>
        </div>
        <div className="top-user">
          <span className="live-dot" />
          {profile ? <span>{profile.firstName || "Пользователь"}</span> : <span>Радар включён</span>}
        </div>
      </header>

      {tab === "home" ? (
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> Радар работает</div>
          <h1>Лови цену.<br /><em>Не переплачивай.</em></h1>
          <p>Находим объявления Marktplaats ниже рыночной цены и показываем, где действительно есть выгода.</p>
          <div className="hero-actions">
            <button className="primary-button" onClick={() => { setTab("home"); document.getElementById("deals")?.scrollIntoView({ behavior: "smooth" }); }}>
              Смотреть предложения <span>↗</span>
            </button>
            <span className="trust-note">Только реальные объявления</span>
          </div>
        </div>
        <div className="radar-art" aria-hidden="true">
          <div className="radar-ring ring-a" />
          <div className="radar-ring ring-b" />
          <div className="radar-ring ring-c" />
          <div className="radar-sweep" />
          <div className="radar-core">D</div>
          <div className="radar-node node-a">−34%</div>
          <div className="radar-node node-b">−27%</div>
          <div className="radar-node node-c">−42%</div>
        </div>
      </section>
      ) : null}

      {tab === "analytics" ? (
      <section className="stats-grid scanner-overview">
        <div className="stat-card"><span className="stat-label">Результатов поиска</span><strong>{scannerStats ? scannerStats.checked.toLocaleString("ru-RU") : "—"}</strong><span className="stat-caption">включая совпадения между запросами</span></div>
        <div className="stat-card accent-stat"><span className="stat-label">Уникальных объявлений</span><strong>{scannerStats?.unique != null ? scannerStats.unique.toLocaleString("ru-RU") : "—"}</strong><span className="stat-caption">по ID Marktplaats</span></div>
        <div className="stat-card"><span className="stat-label">Повторных совпадений</span><strong>{scannerStats?.duplicates != null ? scannerStats.duplicates.toLocaleString("ru-RU") : "—"}</strong><span className="stat-caption">одно объявление найдено в нескольких запросах</span></div>
        <div className="stat-card"><span className="stat-label">В каталоге</span><strong>{deals.length}</strong><span className="stat-caption">выгодные предложения и кандидаты</span></div>
      </section>
      ) : null}

      {tab === "analytics" ? (
        <section className="content-section analytics-section">
          <div className="section-heading">
            <div><div className="eyebrow">Как работает сканер</div><h2>Аналитика сканера</h2><p>Результаты последнего запуска Marktplaats scanner</p></div>
            <span className="scanner-live"><i /> {scannerStats ? "Данные получены" : "Ожидаем первый отчёт"}</span>
          </div>
          <div className="analytics-summary">
            <div className="analytics-primary"><span>Объявлений проверено</span><strong>{scannerStats ? scannerStats.checked.toLocaleString("ru-RU") : "—"}</strong><small>{scannerStats ? "за один запуск · " + ageLabel(scannerStats.finishedAt) : "статистика появится после публикации нового сканирования"}</small></div>
            <div className="analytics-primary green"><span>Выгодных добавлено за запуск</span><strong>{scannerStats ? scannerStats.newDeals.toLocaleString("ru-RU") : "—"}</strong><small>Всего активных предложений в каталоге: {deals.length}</small></div>
          </div>
          <div className="analytics-grid">
            <div className="analytics-card"><span>Первично прошли фильтры</span><strong>{scannerStats ? scannerStats.accepted.toLocaleString("ru-RU") : "—"}</strong><small>уникальные объявления после проверки товара, цены и региона</small></div>
            <div className="analytics-card"><span>Подтверждённые сделки</span><strong>{scannerStats ? ((scannerStats.strongDeals ?? 0) + (scannerStats.goodDeals ?? 0)).toLocaleString("ru-RU") : "—"}</strong><small>достаточно похожих объявлений для сравнения</small></div>
            <div className="analytics-card"><span>Кандидаты на проверке</span><strong>{scannerStats?.reviewCandidates != null ? scannerStats.reviewCandidates.toLocaleString("ru-RU") : "—"}</strong><small>нужно больше рыночных данных</small></div>
            <div className="analytics-card"><span>Ошибки поисковых запросов</span><strong>{scannerStats ? scannerStats.failedQueries + " / " + scannerStats.queryCount : "—"}</strong><small>ошибившиеся запросы из общего числа</small></div>
          </div>
          <div className="rejection-panel">
            <div className="rejection-heading"><div><div className="eyebrow">Почему объявления отсеиваются</div><h3>Почему объявления отсеялись</h3></div><strong>{scannerStats ? scannerStats.rejectedTotal.toLocaleString("ru-RU") : "—"} <small>всего</small></strong></div>
            {[
              { label: "Не подошли по названию / модели", value: scannerStats?.rejectedTitle ?? 0, color: "age" },
              { label: "В объявлении есть внешний сайт", value: scannerStats?.rejectedExternalLink ?? 0, color: "risk" },
              { label: "Устаревшая / нераспознанная модель ТВ", value: scannerStats?.rejectedOldModel ?? 0, color: "age" },
              { label: "Цена или формат цены не подошли", value: (scannerStats?.rejectedPriceType ?? 0) + (scannerStats?.rejectedPriceRange ?? 0) + (scannerStats?.rejectedInvalid ?? 0), color: "risk" },
              { label: "За пределами радиуса", value: scannerStats?.rejectedDistance ?? 0, color: "samples" },
              { label: "Старше 30 дней / дата неизвестна", value: (scannerStats?.rejectedAge ?? 0) + (scannerStats?.rejectedDateUnknown ?? 0), color: "age" },
              { label: "Рискованные объявления", value: scannerStats?.rejectedRisk ?? 0, color: "risk" },
              { label: "Скидка ниже порога хорошей цены", value: scannerStats?.rejectedDiscount ?? 0, color: "discount" },
              { label: "Не проходит по чистой прибыли / ROI", value: scannerStats?.rejectedProfit ?? 0, color: "discount" }
            ].map((item) => {
              const total = scannerStats?.rejectedTotal ?? 0;
              const width = total > 0 ? Math.min(100, (item.value / total) * 100) : 0;
              return <div className="rejection-row" key={item.label}><div className="rejection-label"><span>{item.label}</span><strong>{scannerStats ? item.value.toLocaleString("ru-RU") : "—"}</strong></div><div className="rejection-track"><i className={"rejection-fill " + item.color} style={{ width: width + "%" }} /></div></div>;
            })}
            <p className="analytics-note">«Результаты поиска» включают повторы. «Уникальные» считаются по ID Marktplaats. Кандидаты не считаются отсеянными: они остаются в отдельном блоке, пока сканер собирает сопоставимые цены.</p>
          </div>
        </section>
      ) : null}

      {tab === "categories" ? (
        <section className="content-section v2-section">
          <div className="research-card">
            <div className="research-head">
              <div><div className="eyebrow">LIVE MARKET RESEARCH</div><h3>Исследовать товар</h3><p>Укажи любую модель. Радар соберёт объявления Marktplaats, сравнит цены б/у и проверит стоимость нового товара в магазинах.</p></div>
              <span className="research-live">LIVE</span>
            </div>
            <div className="research-form">
              <label className="research-query"><span>Что ищем?</span><input value={researchQuery} onChange={(event) => setResearchQuery(event.target.value)} placeholder="Например: Ray-Ban Meta Wayfarer Gen 2 RW4012" maxLength={100} /></label>
              <label className="research-budget"><span>Максимальная цена, €</span><input type="number" min="10" max="800" value={researchMaxPrice} onChange={(event) => setResearchMaxPrice(String(Math.min(800, Math.max(10, Number(event.target.value) || 10))))} /></label>
              <fieldset className="research-condition"><legend>Источники для сравнения</legend>
                <label><input type="checkbox" checked={researchIncludeUsed} onChange={(event) => setResearchIncludeUsed(event.target.checked)} /> Подержанные</label>
                <label><input type="checkbox" checked={researchIncludeNew} onChange={(event) => setResearchIncludeNew(event.target.checked)} /> Новые</label>
              </fieldset>
              <button type="button" className="primary-button research-submit" onClick={runProductResearch} disabled={researchLoading || (!researchIncludeUsed && !researchIncludeNew)}>{researchLoading ? "Ищем по площадкам…" : "Искать и анализировать"}</button>
            </div>
            {researchError ? <p className="research-error" role="alert">{researchError}</p> : null}
            {researchLoading ? <div className="research-loading"><span className="research-pulse" />Сравниваем объявления, б/у цены и новые товары в магазинах…</div> : null}
            {researchResult ? (
              <div className="research-report">
                {researchResult.ai ? (
                  <section className="research-ai-panel">
                    <div className="research-ai-top">
                      <span className="research-ai-kicker">AI MARKET ANALYST</span>
                      <b className={researchResult.ai.available ? "research-ai-live" : "research-ai-off"}>
                        {researchResult.ai.available ? "AI-анализ выполнен" : researchResult.ai.enabled ? "AI временно недоступен" : "Локальный AI — в сканере"}
                      </b>
                    </div>
                    <p>{researchResult.ai.productSummary || "Сопоставление найденных объявлений с поисковой моделью."}</p>
                    {researchResult.ai.keyAttributes.length ? (
                      <div className="research-ai-tags">{researchResult.ai.keyAttributes.map((attribute) => <span key={attribute}>{attribute}</span>)}</div>
                    ) : null}
                    {researchResult.ai.marketSummary ? <p className="research-ai-summary">{researchResult.ai.marketSummary}</p> : null}
                    <div className="research-ai-stats">
                      <span>Точные совпадения <b>{researchResult.ai.exactMatches}</b></span>
                      <span>Другие версии <b>{researchResult.ai.variants}</b></span>
                      <span>Проверено AI <b>{researchResult.ai.reviewedOffers}</b></span>
                    </div>
                    {!researchResult.ai.enabled ? <small className="research-ai-note">Облачный AI отключён ради нулевой стоимости. Локальная AI-проверка объявлений выполняется сканером через Ollama на Mac.</small> : null}
                  </section>
                ) : null}
                <div className="research-summary-grid">
                  <div><small>Б/у рынок · медиана</small><strong>{researchResult.usedMedian == null ? "—" : euro(researchResult.usedMedian)}</strong><span>{researchResult.sampleCount} сравнений</span></div>
                  <div><small>Новый товар · медиана</small><strong>{researchResult.newMedian == null ? "—" : euro(researchResult.newMedian)}</strong><span>{researchResult.sources.newRetail.count} источников</span></div>
                  <div><small>Ожидаемая цена перепродажи</small><strong>{researchResult.expectedResalePrice == null ? "—" : euro(researchResult.expectedResalePrice)}</strong><span>с консервативным запасом</span></div>
                </div>
                <div className="research-sources"><span>Marktplaats: <b>{researchResult.sources.marktplaats.count}</b></span><span>Другие б/у площадки: <b>{researchResult.sources.otherUsed.count}</b></span><span>Магазины: <b>{researchResult.sources.newRetail.count}</b></span></div>
                <h4>Объявления Marktplaats до {euro(researchResult.maxPrice)}</h4>
                {researchResult.listings.length ? <div className="research-offers">{researchResult.listings.slice(0, 8).map((item, index) => (
                  <a className="research-offer" href={item.url} target="_blank" rel="noopener noreferrer" key={item.url + index}>
                    <span><b>{item.title}</b><small>{item.source}</small></span><strong>{euro(item.price)}</strong>
                    <em className={item.status === "strong" ? "profit-strong" : item.status === "good" ? "profit-good" : ""}>{item.estimatedProfit == null ? "Недостаточно данных" : (item.estimatedProfit >= 0 ? "+" : "") + euro(item.estimatedProfit)}</em>
                  </a>
                ))}</div> : <p className="research-muted">Подходящих объявлений до указанного лимита не найдено.</p>}
                <h4>Веб-источники: новые и подержанные товары</h4>
                {researchResult.webOffers.length ? <div className="research-web-links">{researchResult.webOffers.slice(0, 10).map((item, index) => (
                  <a href={item.url} target="_blank" rel="noopener noreferrer" key={item.url + index}><span>{item.title}</span><b>{euro(item.price)}</b><small title={item.matchReason || ""}>{item.source} · {item.condition === "used" ? "б/у" : item.condition === "new" ? "новый" : "состояние не определено"} · {item.matchType === "exact" ? "точная модель" : item.matchType === "variant" ? "другая версия" : item.matchType === "related" ? "похожий товар" : "совпадение не подтверждено"}</small></a>
                ))}</div> : <p className="research-muted">Веб-поиск не вернул достоверных цен. Marktplaats проверен отдельно.</p>}
                {researchResult.warnings.map((warning) => <p className="research-warning" key={warning}>ⓘ {warning}</p>)}
              </div>
            ) : null}
          </div>
          {openGroup && !catQuery.trim() ? (
            <>
              <button type="button" className="cg-back" onClick={() => setCatGroup(null)}>← Все категории</button>
              <div className="v2-head"><h2><span aria-hidden="true">{openGroup.icon}</span> {openGroup.title}</h2><p>{openGroup.count ? openGroup.count + " " + finds(openGroup.count) + " сейчас" : "Находок пока нет, сканер продолжает поиск"}</p></div>
              <button type="button" className="v2-all" onClick={() => pickCategory("group:" + openGroup.title)}><strong>Показать всё: {openGroup.title}</strong><span>{openGroup.count}</span></button>
              <div className="cg-list">
                {[...openGroup.items].sort((a, b) => (categoryCounts[b.key] || 0) - (categoryCounts[a.key] || 0)).map((item) => {
                  const count = categoryCounts[item.key] || 0;
                  return <button type="button" key={item.key} className={"cg-row" + (count ? "" : " empty") + (category === item.key ? " on" : "")} onClick={() => pickCategory(item.key)}><span>{item.label}</span><b>{count ? count + " " + finds(count) : "нет находок"}</b><i aria-hidden="true">›</i></button>;
                })}
              </div>
            </>
          ) : (
            <>
              <div className="v2-head"><h2>Что ищем?</h2><p>Выберите группу товаров, потом конкретный бренд или модель.</p></div>
              <label className="search-box"><span aria-hidden="true">⌕</span><input value={catQuery} onChange={(event) => setCatQuery(event.target.value)} placeholder="Например: iPhone, Sony, часы" aria-label="Поиск по категориям" /></label>
              {catQuery.trim() ? (
                catMatches.length ? (
                  <div className="cg-list">{catMatches.map((item) => {
                    const count = categoryCounts[item.key] || 0;
                    return <button type="button" key={item.key} className={"cg-row" + (count ? "" : " empty")} onClick={() => pickCategory(item.key)}><span>{item.label}<small>{groupOf(item.key)}</small></span><b>{count ? count + " " + finds(count) : "нет находок"}</b><i aria-hidden="true">›</i></button>;
                  })}</div>
                ) : <div className="state-panel"><h3>Ничего не нашли</h3><p>Попробуйте другое слово или очистите поиск.</p><button className="secondary-button" onClick={() => setCatQuery("")}>Очистить поиск</button></div>
              ) : (
                <>
                  <button type="button" className={"v2-all" + (!category ? " on" : "")} onClick={() => pickCategory("")}><strong>Показать все находки</strong><span>{base.length}</span></button>
                  <div className="cg-grid">
                    {groupStats.map((group) => (
                      <button type="button" key={group.title} className={"cg-card" + (group.count ? "" : " empty")} onClick={() => setCatGroup(group.title)}>
                        <span className="cg-ico" aria-hidden="true">{group.icon}</span>
                        <strong>{group.title}</strong>
                        <small>{group.count ? group.count + " " + finds(group.count) : "пока пусто"}</small>
                        {group.best ? <em>до −{group.best}%</em> : null}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </section>
      ) : null}

      {tab === "saved" ? (
        <section className="content-section v2-section" id="deals">
          <div className="v2-head"><h2>Избранное<span className="heading-count">{savedDeals.length}</span></h2><p>Нажимайте ♡ на карточке, чтобы сохранить объявление. Оно будет ждать вас здесь.</p></div>
          {missingSaved > 0 ? <div className="v2-note"><span>{missingSaved} {missingSaved === 1 ? "сохранённого объявления" : "сохранённых объявлений"} больше нет в ленте. Возможно, товар уже продали.</span><button type="button" onClick={clearUnavailableSaved}>Убрать из списка</button></div> : null}
          {error && deals.length === 0 ? (
            <div className="state-panel error-panel"><h3>Не удалось загрузить объявления</h3><p>{error}</p><button className="secondary-button" onClick={() => void loadDeals()}>Попробовать снова</button></div>
          ) : loading && savedDeals.length === 0 ? (
            <div className="deal-grid">{Array.from({ length: 3 }).map((_, index) => <div className="skeleton-card" key={index}><div /><span /><span /><span /></div>)}</div>
          ) : savedDeals.length === 0 ? (
            <div className="state-panel"><div className="state-icon">♡</div><h3>{saved.length ? "Сохранённых объявлений больше нет в ленте" : "Пока ничего не сохранено"}</h3><p>{saved.length ? "Их могли продать или снять. Посмотрите свежие находки." : "Откройте любое объявление и нажмите ♡. Оно появится здесь."}</p><button className="secondary-button" onClick={() => setTab("home")}>Смотреть находки</button></div>
          ) : (
            <div className="deal-grid">{savedDeals.map((deal) => <DealCard key={deal.listing_id} deal={deal} saved onSave={() => toggleSaved(deal.listing_id)} onOpen={() => setSelected(deal)} />)}</div>
          )}
        </section>
      ) : null}

      {tab === "strong" ? (
        <section className="content-section" id="strong-deals">
          <div className="section-heading">
            <div>
              <h2>Сильные сделки<span className="heading-count">{strongDeals.length}</span></h2>
              <p>Только предложения с подтверждённой прибылью от €50 и выше</p>
            </div>
            <button className="refresh-button" onClick={() => void loadDeals(true)} disabled={loading || refreshing}><span className={loading || refreshing ? "spin" : ""}>↻</span> Обновить</button>
          </div>

          <div className="summary-strip">
            <span><strong>{strongDeals.length}</strong> сильных сделок</span>
            {bestDiscount ? <span>лучшая скидка <strong>−{bestDiscount}%</strong></span> : null}
            {updatedAt ? <span>обновлено {dateLabel(updatedAt)}</span> : null}
          </div>

          <div className="toolbar">
            <label className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти сильную сделку..." /></label>
            <label className="sort-select"><span>Сортировка</span><select value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="profit">По прибыли</option><option value="discount">По скидке</option><option value="newest">Сначала новые</option><option value="price">Сначала дешевле</option></select></label>
          </div>

          {error && deals.length === 0 ? (
            <div className="state-panel error-panel"><div className="state-icon">!</div><h3>Лента пока не подключена</h3><p>{error}</p><button className="secondary-button" onClick={() => void loadDeals()}>Попробовать снова</button></div>
          ) : loading && strongDeals.length === 0 ? (
            <div className="deal-grid">{Array.from({ length: 6 }).map((_, index) => <div className="skeleton-card" key={index}><div /><span /><span /><span /></div>)}</div>
          ) : strongDeals.length === 0 ? (
            <div className="state-panel"><div className="state-icon">⌁</div>
              <h3>Пока нет сильных сделок</h3>
              <p>Сканер ищет предложения с прибылью от €50. Когда они появятся, они будут здесь.</p>
              <button className="secondary-button" onClick={() => setTab("home")}>К основным находкам</button>
            </div>
          ) : (
            <div className="deal-grid">{strongDeals.map((deal) => <DealCard key={deal.listing_id} deal={deal} saved={saved.includes(deal.listing_id)} onSave={() => toggleSaved(deal.listing_id)} onOpen={() => setSelected(deal)} />)}</div>
          )}
        </section>
      ) : null}

      {tab === "home" ? (
      <section className="content-section" id="deals">
        <div className="section-heading">
          <div>
            
            <h2>Свежие находки<span className="heading-count">{filtered.length}</span></h2>
            <p>Только то, что прошло проверку выгодности</p>
          </div>
          <button className="refresh-button" onClick={() => void loadDeals(true)} disabled={loading || refreshing}><span className={loading || refreshing ? "spin" : ""}>↻</span> Обновить</button>
        </div>

        <div className="summary-strip">
          <span><strong>{base.length}</strong> {finds(base.length)}</span>
          {bestDiscount ? <span>лучшая скидка <strong>−{bestDiscount}%</strong></span> : null}
          {updatedAt ? <span>обновлено {dateLabel(updatedAt)}</span> : null}
        </div>

        <div className="toolbar">
          <label className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти товар..." /></label>
          <label className="sort-select"><span>Сортировка</span><select value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="profit">По прибыли</option><option value="discount">По скидке</option><option value="newest">Сначала новые</option><option value="price">Сначала дешевле</option></select></label>
        </div>

        <div className="cat-bar">
          <span>Категория</span>
          <button type="button" className="cat-pick" onClick={() => setTab("categories")}><strong>{activeCategory}</strong><i>Выбрать</i></button>
          {category ? <button type="button" className="cat-clear" onClick={() => setCategory("")} aria-label="Сбросить категорию">✕</button> : null}
        </div>

        <details className="filters-fold">
          <summary>Фильтры по цене и скидке{settingsCount ? <b>{settingsCount}</b> : null}</summary>
        <div className="filter-panel" role="group" aria-label="Фильтры по цене и скидке">
          <div className="filter-group">
            <span className="filter-label">Цена, €</span>
            <div className="price-range">
              <input type="number" inputMode="numeric" min="0" placeholder="от" aria-label="Минимальная цена" value={settings.minPrice ?? ""} onChange={(event) => updateFilters({ minPrice: priceValue(event.target.value) })} />
              <i>—</i>
              <input type="number" inputMode="numeric" min="0" max="800" placeholder="до €800" aria-label="Максимальная цена" value={settings.maxPrice ?? ""} onChange={(event) => updateFilters({ maxPrice: priceValue(event.target.value) })} />
            </div>
          </div>
          <div className="filter-group grow">
            <span className="filter-label">Скидка</span>
            <div className="discount-steps">
              {DISCOUNT_STEPS.map((step) => (
                <button type="button" key={step} className={"discount-chip" + (settings.minDiscount === step ? " selected" : "")} onClick={() => updateFilters({ minDiscount: step })}>{step === 0 ? "Любая" : "от " + step + "%"}</button>
              ))}
            </div>
          </div>
          {activeFilters ? <button type="button" className="reset-filters" onClick={resetFilters}>Сбросить · {activeFilters}</button> : null}
        </div>
        </details>

        {error && deals.length === 0 ? (
          <div className="state-panel error-panel"><div className="state-icon">!</div><h3>Лента пока не подключена</h3><p>{error}</p>
            <span>Проверьте доступность каталога и попробуйте обновить страницу ещё раз.</span>
            <button className="secondary-button" onClick={() => void loadDeals()}>Попробовать снова</button>
          </div>
        ) : loading && filtered.length === 0 ? (
          <div className="deal-grid">{Array.from({ length: 6 }).map((_, index) => <div className="skeleton-card" key={index}><div /><span /><span /><span /></div>)}</div>
        ) : filtered.length === 0 ? (
          <div className="state-panel"><div className="state-icon">⌁</div>
            <h3>Пока нет подходящих предложений</h3>
            <p>Сканер продолжает искать хорошие цены. Подходящие объявления появятся здесь после проверки.</p>
            {activeFilters ? <button className="secondary-button" onClick={resetFilters}>Сбросить фильтры</button> : null}
          </div>
        ) : (
          <div className="deal-tiers">
            <section className="deal-tier strong-tier"><div className="tier-heading"><div><div className="eyebrow">Лучшее</div><h3>Самые выгодные <span>{strongDeals.length}</span></h3><p>Лучшее подтверждённое соотношение цены и рынка</p></div></div>
              {strongDeals.length ? <div className="deal-grid">{strongDeals.map((deal) => <DealCard key={deal.listing_id} deal={deal} saved={saved.includes(deal.listing_id)} onSave={() => toggleSaved(deal.listing_id)} onOpen={() => setSelected(deal)} />)}</div> : <p className="tier-empty">Пока нет сделок, которые прошли полный порог проверки.</p>}
            </section>
            <section className="deal-tier good-tier"><div className="tier-heading"><div><div className="eyebrow">Хорошая цена</div><h3>Тоже хорошие предложения <span>{goodDeals.length}</span></h3><p>Скидка ниже максимального порога, но цена всё ещё привлекательная</p></div></div>
              {goodDeals.length ? <div className="deal-grid">{goodDeals.map((deal) => <DealCard key={deal.listing_id} deal={deal} saved={saved.includes(deal.listing_id)} onSave={() => toggleSaved(deal.listing_id)} onOpen={() => setSelected(deal)} />)}</div> : <p className="tier-empty">В этом проходе не нашлось предложений в среднем диапазоне выгоды.</p>}
            </section>
            <section className="deal-tier review-tier"><div className="tier-heading"><div><div className="eyebrow">Требует проверки</div><h3>Кандидаты на проверку <span>{reviewDeals.length}</span></h3><p>Не скрываем из-за нехватки сравнений. Скидка здесь не подтверждена.</p></div></div>
              {reviewDeals.length ? <div className="deal-grid">{reviewDeals.map((deal) => <DealCard key={deal.listing_id} deal={deal} saved={saved.includes(deal.listing_id)} onSave={() => toggleSaved(deal.listing_id)} onOpen={() => setSelected(deal)} />)}</div> : <p className="tier-empty">Кандидатов пока нет.</p>}
            </section>
          </div>
        )}
      </section>

      ) : null}

      {tab === "profile" ? (
        <section className="content-section v2-section" aria-label="Профиль и фильтры">
          <div className="v2-me">
            <div className="v2-ava" aria-hidden="true">{(profile?.firstName || "D").slice(0, 1).toUpperCase()}</div>
            <div><strong>{profile ? profile.firstName + (profile.lastName ? " " + profile.lastName : "") : "Гость"}</strong><span>{profile?.username ? "@" + profile.username : profile ? "Вход через Telegram выполнен" : "Откройте приложение из Telegram, чтобы увидеть своё имя"}</span></div>
          </div>
          <div className="v2-card">
            <div className="v2-card-head"><h3>Мои фильтры</h3>{settingsCount ? <button type="button" className="v2-link" onClick={() => updateFilters({ ...DEFAULT_SETTINGS })}>Сбросить ({settingsCount})</button> : null}</div>
            <p className="v2-hint">Изменения применяются сразу, сохранять ничего не нужно.</p>
            <div className="v2-field"><span>Минимальная скидка</span>
              <div className="discount-steps">{DISCOUNT_STEPS.map((step) => <button type="button" key={step} className={"discount-chip" + (settings.minDiscount === step ? " selected" : "")} onClick={() => updateFilters({ minDiscount: step })}>{step === 0 ? "Любая" : "от " + step + "%"}</button>)}</div>
            </div>
            <div className="v2-field"><span>Расстояние до товара</span>
              <div className="discount-steps">{DISTANCE_STEPS.map((km) => <button type="button" key={km ?? "any"} className={"discount-chip" + (settings.maxDistanceKm === km ? " selected" : "")} onClick={() => updateFilters({ maxDistanceKm: km })}>{km === null ? "Любое" : "до " + km + " км"}</button>)}</div>
            </div>
            <div className="v2-field"><span>Цена, €</span>
              <div className="price-range">
                <input type="number" inputMode="numeric" min="0" placeholder="от" aria-label="Минимальная цена" value={settings.minPrice ?? ""} onChange={(event) => updateFilters({ minPrice: priceValue(event.target.value) })} />
                <i>—</i>
                <input type="number" inputMode="numeric" min="0" placeholder="до" aria-label="Максимальная цена" value={settings.maxPrice ?? ""} onChange={(event) => updateFilters({ maxPrice: priceValue(event.target.value) })} />
              </div>
            </div>
            <details className="v2-cats">
              <summary>Только некоторые категории<b>{settings.categories.length ? "Выбрано: " + settings.categories.length : "Все категории"}</b></summary>
              <p className="v2-hint">Отметьте то, что вам интересно. Если ничего не выбрано, показываем всё.</p>
              {GROUPED_CATEGORIES.map((group) => (
                <div className="v2-pick" key={group.title}>
                  <span>{group.icon} {group.title}</span>
                  <div>{group.items.map((item) => <button type="button" key={item.key} aria-pressed={settings.categories.includes(item.key)} className={"preference-chip" + (settings.categories.includes(item.key) ? " active" : "")} onClick={() => updateFilters({ categories: settings.categories.includes(item.key) ? settings.categories.filter((key) => key !== item.key) : [...settings.categories, item.key] })}>{item.label}</button>)}</div>
                </div>
              ))}
            </details>
          </div>
          <div className="v2-result"><span><strong>{base.length}</strong> {finds(base.length)} подходит под ваши фильтры</span><button type="button" className="primary-button" onClick={() => pickCategory("")}>Показать</button></div>
          <button type="button" className="v2-row" onClick={() => setTab("saved")}><span>Избранное</span><b>{saved.length ? saved.length : "пусто"}</b></button>
          <p className="v2-hint">Избранное и фильтры хранятся только на этом устройстве. Район поиска задан в самом сервисе, здесь можно только сузить выдачу.</p>
        </section>
      ) : null}

      <footer className="app-footer">
        <div className="footer-brand">DEAL RADAR <span>•</span> NL</div>
        <p>Цены объявлений — ориентир, а не гарантия цены продажи. Проверяй товар и продавца перед покупкой.</p>
        <span className="footer-location">{activeCategory} · {updatedAt ? "обновлено " + dateLabel(updatedAt) : "ожидаем данные"}</span>
      </footer>

      <nav className="bottom-nav" aria-label="Основная навигация">
        <button className={tab === "home" ? "nav-active" : ""} onClick={() => setTab("home")}><Icon name="home" />Главная</button>
        <button className={tab === "strong" ? "nav-active" : ""} onClick={() => setTab("strong")}><Icon name="grid" />Сильные</button>
        <button className={tab === "categories" ? "nav-active" : ""} onClick={() => setTab("categories")}><Icon name="grid" />Категории</button>
        <button className={tab === "analytics" ? "nav-active" : ""} onClick={() => setTab("analytics")}><Icon name="chart" />Аналитика</button>
        <button className={tab === "saved" ? "nav-active" : ""} onClick={() => setTab("saved")}><Icon name="heart" />Избранное{saved.length ? <i>{saved.length}</i> : null}</button>
        <button className={tab === "profile" ? "nav-active" : ""} onClick={() => setTab("profile")}><Icon name="user" />Профиль</button>
      </nav>

      {selected ? (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <section className="detail-modal" role="dialog" aria-modal="true" aria-label={selected.title} onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelected(null)}>×</button>
            <div className="detail-photo">
              {selected.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selected.image_url} alt={selected.title} referrerPolicy="no-referrer" />
              ) : <span>✦</span>}
            </div>
            <div className="detail-body">
              <div className="eyebrow">{selected.category_label} · {selected.status === "candidate" ? "ТРЕБУЕТ ПРОВЕРКИ" : selected.status === "good" ? "ХОРОШАЯ ЦЕНА" : selected.discount == null ? "ВЫГОДНО" : "−" + Math.round(Number(selected.discount) * 100) + "%"}</div>
              <h2>{selected.title}</h2>
              <div className="detail-price"><strong>{euro(selected.price)}</strong><span>{selected.market_price != null ? "Рынок ≈ " + euro(selected.market_price) : "Рыночная цена пока не подтверждена"}</span></div>
              {selected.estimated_profit != null ? <div className="detail-facts"><span>Ожидаемая прибыль: {euro(selected.estimated_profit)}</span><span>ROI: {selected.profit_roi != null ? Math.round(selected.profit_roi * 100) + "%" : "—"}</span></div> : null}
              {selected.new_price != null ? <div className="candidate-detail-note">Новый товар: {euro(selected.new_price)} · расчёт сделан с запасом на торг, комиссию и расходы</div> : null}
              {selected.evaluation_reason ? <div className="candidate-detail-note">{selected.evaluation_reason}</div> : null}
              {selected.market_samples ? <div className="detail-facts"><span>Сравнений: {selected.market_samples}</span><span>Уверенность: {selected.market_confidence === "high" ? "высокая" : "предварительная"}</span></div> : null}
              <p>{selected.description || "Описание отсутствует в исходном объявлении."}</p>
              <div className="detail-facts"><span>⌖ {selected.city || "Нидерланды"}{selected.distance_km != null ? " · " + Math.round(selected.distance_km) + " км" : ""}</span><span>Обнаружено {dateLabel(selected.detected_at)}</span></div>
              {selected.warning_flags?.length ? <div className="warning-list"><strong>Обрати внимание</strong>{selected.warning_flags.map((flag) => <span key={flag}>⚠ {flag}</span>)}</div> : null}
              <a className="primary-button full-button" href={selected.listing_url} target="_blank" rel="noreferrer">Открыть на Marktplaats ↗</a>
              <button className="secondary-button full-button" onClick={() => toggleSaved(selected.listing_id)}>{saved.includes(selected.listing_id) ? "Убрать из избранного" : "Добавить в избранное"}</button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
