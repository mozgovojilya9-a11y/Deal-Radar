"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CatalogCounts, Deal, ScannerStats } from "@/lib/deals";
import { CATEGORIES, CATEGORY_GROUPS, categoryLabel, groupOf } from "@/lib/categories";
import { catalogMatcher } from "@/lib/catalog-search";
import { HISTORY_KEY, SAVED_KEY, addSavedSearch, isSaved, loadJson, readHistory, readSavedSearches, rememberQuery, removeSavedSearch, storeJson, type SavedSearch } from "@/lib/saved-searches";
import { activeSettingsCount, loadSettings, radiusLabel, saveSettings, settingsQuery, type SearchSettings, DEFAULT_SETTINGS } from "@/lib/settings";
import { addPurchase, loadPurchases, savePurchases, type Purchase } from "@/lib/purchases";
import { Analytics } from "./components/Analytics";
import { Dashboard } from "./components/Dashboard";
import { DealDetail } from "./components/DealDetail";
import { DealGrid } from "./components/DealGrid";
import { Purchases } from "./components/Purchases";
import { Research } from "./components/Research";
import { SettingsSheet } from "./components/SettingsSheet";
import { Icon, ageLabel, euro, plural } from "./components/ui";

type Tab = "overview" | "home" | "explore" | "analytics" | "saved" | "profile";
type Tier = "all" | "strong" | "good" | "candidate";
type Sort = "profit" | "score" | "distance" | "discount" | "newest" | "price";
type TelegramProfile = { id: number; firstName: string; lastName: string; username: string };

const FAVORITES_KEY = "deal-radar-favorites";
const REFRESH_MS = 120_000;
const HIDDEN_KEY = "deal-radar-hidden";
const SEEN_KEY = "deal-radar-seen-deals";
const SORT_KEY = "deal-radar-sort";
const SORTS: Array<[Sort, string]> = [["profit", "По прибыли"], ["score", "По баллу сделки"], ["distance", "Ближе ко мне"], ["discount", "По скидке"], ["newest", "Сначала новые"], ["price", "Сначала дешевле"]];

export default function HomePage() {
  const [settings, setSettings] = useState<SearchSettings>(DEFAULT_SETTINGS);
  const [settingsReady, setSettingsReady] = useState(false);
  const [sort, setSort] = useState<Sort>("profit");
  const [deals, setDeals] = useState<Deal[]>([]);
  const [counts, setCounts] = useState<CatalogCounts | null>(null);
  const [stats, setStats] = useState<ScannerStats | null>(null);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastLoaded, setLastLoaded] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [tier, setTier] = useState<Tier>("all");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [dropsOnly, setDropsOnly] = useState(false);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [savedDeals, setSavedDeals] = useState<Deal[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [selected, setSelected] = useState<Deal | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [savedView, setSavedView] = useState<"saved" | "bought">("saved");
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profile, setProfile] = useState<TelegramProfile | null>(null);
  const [exploreView, setExploreView] = useState<"categories" | "research">("research");
  const requestId = useRef(0);

  useEffect(() => {
    const stored = loadSettings();
    setSettings(stored);
    let storedSort: string | null = null;
    try { storedSort = localStorage.getItem(SORT_KEY); } catch { /* storage unavailable */ }
    setSort(SORTS.some(([key]) => key === storedSort) && (storedSort !== "distance" || stored.location) ? storedSort as Sort : stored.priority === "distance" && stored.location ? "distance" : "profit");
    setPurchases(loadPurchases());
    setSavedSearches(loadJson(SAVED_KEY, readSavedSearches));
    setSearchHistory(loadJson(HISTORY_KEY, readHistory));
    try {
      const stored_hidden = JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]");
      setHidden(Array.isArray(stored_hidden) ? stored_hidden.filter((id): id is string => typeof id === "string") : []);
    } catch { setHidden([]); }
    try {
      const favorites = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
      setSaved(Array.isArray(favorites) ? favorites.filter((id): id is string => typeof id === "string") : []);
    } catch { setSaved([]); }
    setSettingsReady(true);

    const webApp = window.Telegram?.WebApp;
    if (!webApp) return;
    webApp.ready();
    webApp.expand();
    webApp.setHeaderColor?.("#0b0e13");
    webApp.setBackgroundColor?.("#0b0e13");
    if (!webApp.initData) return;
    void fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData: webApp.initData }) })
      .then(async (response) => { if (!response.ok) return; const data = await response.json(); if (data.authenticated && data.user) setProfile(data.user); })
      .catch(() => undefined);
  }, []);

  const query = useMemo(() => settingsQuery(settings, sort).toString(), [settings, sort]);

  const loadDeals = useCallback(async (silent = false) => {
    const id = ++requestId.current;
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const response = await fetch("/api/deals?compact=1&" + query, { cache: "no-store" });
      const data = await response.json();
      if (id !== requestId.current) return;
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить каталог");
      setDeals(Array.isArray(data.deals) ? data.deals : []);
      setCounts(data.counts || null);
      setStats(data.scannerStats || null);
      setScannedAt(data.scannedAt || data.updatedAt || null);
      setLastLoaded(Date.now());
      setError("");
    } catch (caught) {
      if (id !== requestId.current) return;
      setError(caught instanceof Error ? caught.message : "Ошибка загрузки");
    } finally {
      if (id === requestId.current) { setLoading(false); setRefreshing(false); }
    }
  }, [query]);

  useEffect(() => {
    if (!settingsReady) return;
    void loadDeals();
    const timer = window.setInterval(() => void loadDeals(true), REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void loadDeals(true); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [loadDeals, settingsReady]);

  // Favourites are loaded by id, independent of the active filters.
  useEffect(() => {
    if (tab !== "saved" || !saved.length) { if (!saved.length) setSavedDeals([]); return; }
    let cancelled = false;
    setSavedLoading(true);
    const params = new URLSearchParams({ ids: saved.join(",") });
    if (settings.location) { params.set("lat", String(settings.location.lat)); params.set("lon", String(settings.location.lon)); }
    fetch("/api/deals?" + params, { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => { if (!cancelled) setSavedDeals(Array.isArray(data.deals) ? data.deals : []); })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setSavedLoading(false); });
    return () => { cancelled = true; };
  }, [tab, saved, settings.location]);

  function updateSettings(next: SearchSettings) {
    setSettings(next);
    saveSettings(next);
    if (next.priority !== settings.priority) setSort(next.priority === "distance" && next.location ? "distance" : "profit");
  }

  function toggleSaved(id: string) {
    setSaved((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
      return next;
    });
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("light");
  }

  const shownDeals = useMemo(() => { const skip = new Set(hidden); return deals.filter((deal) => !skip.has(deal.listing_id)); }, [deals, hidden]);
  const profitableIds = useMemo(() => deals.filter((deal) => deal.status !== "candidate").map((deal) => deal.listing_id), [deals]);

  // "New" means: a profitable listing this device has not been shown yet. The very first visit marks nothing.
  useEffect(() => {
    if (!lastLoaded) return;
    let seen: string[] | null = null;
    try { const raw = localStorage.getItem(SEEN_KEY); seen = raw ? JSON.parse(raw) : null; } catch { seen = null; }
    if (!Array.isArray(seen)) {
      try { localStorage.setItem(SEEN_KEY, JSON.stringify(profitableIds)); } catch { /* storage unavailable */ }
      return;
    }
    const known = new Set(seen);
    setNewIds(new Set(profitableIds.filter((id) => !known.has(id))));
  }, [profitableIds, lastLoaded]);

  const previousTab = useRef<Tab>("overview");
  useEffect(() => {
    if (previousTab.current === "home" && tab !== "home") {
      try {
        const stored = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
        localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...(Array.isArray(stored) ? stored : []), ...profitableIds])].slice(-3000)));
      } catch { /* storage unavailable */ }
      setNewIds(new Set());
    }
    previousTab.current = tab;
  }, [tab, profitableIds]);

  // Telegram's own back arrow closes an open listing or filter sheet.
  useEffect(() => {
    const button = window.Telegram?.WebApp?.BackButton;
    if (!button) return;
    if (!selected && !settingsOpen) { button.hide(); return; }
    const close = () => { if (selected) setSelected(null); else setSettingsOpen(false); };
    button.show();
    button.onClick(close);
    return () => button.offClick(close);
  }, [selected, settingsOpen]);

  const matchesSearch = useMemo(() => catalogMatcher(search), [search]);
  const visible = useMemo(() => shownDeals.filter((deal) => {
    if (category.startsWith("group:") ? groupOf(deal.category_key) !== category.slice(6) : category && deal.category_key !== category) return false;
    if (dropsOnly && !deal.price_dropped_at) return false;
    return matchesSearch(deal);
  }), [shownDeals, category, matchesSearch, dropsOnly]);
  const dropCount = useMemo(() => shownDeals.filter((deal) => deal.price_dropped_at).length, [shownDeals]);
  const byTier = useMemo(() => ({
    strong: visible.filter((deal) => deal.status === "strong"),
    good: visible.filter((deal) => deal.status === "good"),
    candidate: visible.filter((deal) => deal.status === "candidate"),
  }), [visible]);
  const groupCounts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const deal of shownDeals) if (deal.status !== "candidate") result[deal.category_key] = (result[deal.category_key] || 0) + 1;
    return result;
  }, [shownDeals]);

  const activeCount = activeSettingsCount(settings);
  const scanAgeHours = scannedAt ? (Date.now() - new Date(scannedAt).getTime()) / 3_600_000 : null;
  const closeDetail = useCallback(() => setSelected(null), []);
  /** Bottom menu: open the section and return to its top, also when it is already open. */
  const openTab = (next: Tab) => {
    window.scrollTo({ top: 0, behavior: next === tab ? "smooth" : "auto" });
    setTab(next);
  };
  const shown = tier === "all" ? null : byTier[tier];

  const listKey = [tier, category, search, sort, dropsOnly].join("|");

  /** Profitable listings each saved search finds right now. */
  const savedCounts = useMemo(() => {
    const profitable = shownDeals.filter((deal) => deal.status !== "candidate");
    return Object.fromEntries(savedSearches.map((item) => {
      const matches = catalogMatcher(item.text);
      return [item.id, profitable.filter((deal) => matches(deal) && (!item.dropsOnly || deal.price_dropped_at)
        && (item.category.startsWith("group:") ? groupOf(deal.category_key) === item.category.slice(6) : !item.category || deal.category_key === item.category)).length];
    }));
  }, [shownDeals, savedSearches]);
  const currentSearch = { text: search.trim(), category, dropsOnly };
  const canSave = Boolean(currentSearch.text || category || dropsOnly) && !isSaved(savedSearches, currentSearch);
  const searchLabel = (item: Pick<SavedSearch, "text" | "category" | "dropsOnly">) =>
    [item.text, item.category ? (item.category.startsWith("group:") ? item.category.slice(6) : categoryLabel(item.category)) : "", item.dropsOnly ? "↓ цена" : ""].filter(Boolean).join(" · ");

  function recordSearch() {
    const next = rememberQuery(searchHistory, search);
    if (next !== searchHistory) { setSearchHistory(next); storeJson(HISTORY_KEY, next); }
  }
  function changeSavedSearches(next: SavedSearch[]) {
    setSavedSearches(next);
    storeJson(SAVED_KEY, next);
  }
  function applySearch(item: Pick<SavedSearch, "text" | "category" | "dropsOnly">) {
    setSearch(item.text);
    setCategory(item.category);
    setDropsOnly(item.dropsOnly);
    setSearchFocused(false);
  }
  const renderGrid = (list: Deal[]) => <DealGrid deals={list} savedIds={saved} newIds={newIds} resetKey={listKey} onSave={toggleSaved} onOpen={setSelected} />;

  function changeHidden(next: string[]) {
    setHidden(next);
    try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  }

  function changePurchases(next: Purchase[]) {
    setPurchases(next);
    savePurchases(next);
  }

  function changeSort(next: Sort) {
    setSort(next);
    try { localStorage.setItem(SORT_KEY, next); } catch { /* storage unavailable */ }
  }

  function recordPurchase(deal: Deal, paid: number) {
    const expectedProfit = deal.estimated_profit != null ? Math.round((deal.estimated_profit + deal.price - paid) * 100) / 100 : null;
    changePurchases(addPurchase(purchases, { id: deal.listing_id, title: deal.title, url: deal.listing_url, paid, expectedProfit, boughtAt: new Date().toISOString(), soldFor: null }));
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
  }

  function copyTelegramId() {
    if (!profile?.id) return;
    void navigator.clipboard?.writeText(String(profile.id)).then(() => setCopiedId(true)).catch(() => undefined);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup"><div className="brand-mark" aria-hidden="true">D</div><div className="brand-name">Deal Radar</div></div>
        <button type="button" className="top-location" onClick={() => setSettingsOpen(true)}>
          <Icon name="pin" size={16} />
          <span>{settings.location ? (settings.location.city || settings.location.label) + " · " + radiusLabel(settings.radiusKm) : "Вся страна"}</span>
        </button>
        <button type="button" className="icon-button" onClick={() => setTab("profile")} aria-label="Настройки"><Icon name="sliders" size={18} /></button>
      </header>

      {tab === "overview" ? (
        <Dashboard deals={shownDeals} stats={stats} scannedAt={scannedAt} saved={saved} onSave={toggleSaved} onOpen={setSelected}
          onShowAll={(nextTier) => { setTier(nextTier); openTab("home"); }} />
      ) : null}

      {tab === "home" ? (
        <section className="content-section" id="deals">
          <div className="section-heading">
            <div>
              <h2>Находки<span className="heading-count">{(byTier.strong.length + byTier.good.length).toLocaleString("ru-RU")}</span></h2>
              <p>
                {counts && counts.matched < counts.feed ? "из " + counts.feed.toLocaleString("ru-RU") + " в каталоге · " : ""}
                {scannedAt ? "сканирование " + ageLabel(scannedAt) : "ожидаем данные"}
                {lastLoaded ? " · загружено " + ageLabel(new Date(lastLoaded).toISOString()) : ""}
              </p>
            </div>
            <button className="refresh-button" onClick={() => void loadDeals(true)} disabled={loading || refreshing} aria-label="Обновить каталог">
              <span className={loading || refreshing ? "spin" : ""} aria-hidden="true">↻</span>{refreshing ? "Обновляю" : "Обновить"}
            </button>
          </div>

          {scanAgeHours !== null && scanAgeHours > 3 ? <p className="v2-note stale-note"><span>Последнее сканирование было {Math.round(scanAgeHours)} ч назад — цены могли измениться.</span></p> : null}
          {error && deals.length ? <p className="v2-note error-note"><span>Не удалось обновить: {error}. Показаны последние загруженные данные.</span><button type="button" onClick={() => void loadDeals()}>Повторить</button></p> : null}

          <div className="toolbar">
            <label className="search-box"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} onFocus={() => setSearchFocused(true)}
              onBlur={() => { recordSearch(); window.setTimeout(() => setSearchFocused(false), 150); }}
              onKeyDown={(event) => { if (event.key === "Enter") { recordSearch(); (event.target as HTMLInputElement).blur(); } }}
              enterKeyHint="search" placeholder="Модель на любом языке: «айфон 15», «ps5 slim»" aria-label="Поиск по находкам" />{search ? <button type="button" className="clear-input" onClick={() => setSearch("")} aria-label="Очистить">×</button> : null}</label>
            <label className="sort-select"><span>Сортировка</span>
              <select value={sort} onChange={(event) => changeSort(event.target.value as Sort)}>
                {SORTS.map(([key, label]) => <option key={key} value={key} disabled={key === "distance" && !settings.location}>{label}{key === "distance" && !settings.location ? " (укажите локацию)" : ""}</option>)}
              </select>
            </label>
            <button type="button" className={"filter-button" + (activeCount ? " active" : "")} onClick={() => setSettingsOpen(true)}><Icon name="sliders" size={18} />Фильтры{activeCount ? <b>{activeCount}</b> : null}</button>
          </div>

          {savedSearches.length || canSave || (searchFocused && !search && searchHistory.length) ? (
            <div className="search-memory">
              {searchFocused && !search && searchHistory.length ? (
                <div className="memory-row"><span>Недавние</span>
                  {searchHistory.map((item) => <button type="button" key={item} className="memory-chip" onMouseDown={(event) => event.preventDefault()} onClick={() => applySearch({ text: item, category: "", dropsOnly: false })}>{item}</button>)}
                  <button type="button" className="memory-clear" onMouseDown={(event) => event.preventDefault()} onClick={() => { setSearchHistory([]); storeJson(HISTORY_KEY, []); }}>очистить</button>
                </div>
              ) : null}
              {savedSearches.length || canSave ? (
                <div className="memory-row"><span>Мои поиски</span>
                  {savedSearches.map((item) => (
                    <span key={item.id} className={"memory-chip saved" + (isSaved([item], currentSearch) ? " on" : "")}>
                      <button type="button" onClick={() => applySearch(item)}>★ {searchLabel(item)}{savedCounts[item.id] ? <b>{savedCounts[item.id]}</b> : null}</button>
                      <button type="button" className="memory-remove" aria-label={"Удалить поиск " + searchLabel(item)} onClick={() => changeSavedSearches(removeSavedSearch(savedSearches, item.id))}>×</button>
                    </span>
                  ))}
                  {canSave ? <button type="button" className="memory-chip save" onClick={() => { changeSavedSearches(addSavedSearch(savedSearches, currentSearch)); recordSearch(); }}>☆ Сохранить «{searchLabel(currentSearch)}»</button> : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="active-chips">
            {dropCount || dropsOnly ? <button type="button" className={dropsOnly ? "chip-on" : "chip-toggle"} aria-pressed={dropsOnly} onClick={() => setDropsOnly(!dropsOnly)}>↓ Цена снижена · {dropCount}</button> : null}
            {settings.location && settings.radiusKm !== null ? <button type="button" onClick={() => updateSettings({ ...settings, radiusKm: null })}>≤ {settings.radiusKm} км от {settings.location.city || settings.location.label} ×</button> : null}
            {settings.minPrice !== null || settings.maxPrice !== null ? <button type="button" onClick={() => updateSettings({ ...settings, minPrice: null, maxPrice: null })}>{settings.minPrice !== null ? "от " + euro(settings.minPrice) + " " : ""}{settings.maxPrice !== null ? "до " + euro(settings.maxPrice) : ""} ×</button> : null}
            {settings.minDiscount ? <button type="button" onClick={() => updateSettings({ ...settings, minDiscount: 0 })}>скидка от {settings.minDiscount}% ×</button> : null}
            {settings.minProfit !== null ? <button type="button" onClick={() => updateSettings({ ...settings, minProfit: null })}>прибыль от {euro(settings.minProfit)} ×</button> : null}
            {settings.minRoi !== null ? <button type="button" onClick={() => updateSettings({ ...settings, minRoi: null })}>ROI от {settings.minRoi}% ×</button> : null}
            {settings.condition !== "all" ? <button type="button" onClick={() => updateSettings({ ...settings, condition: "all" })}>{settings.condition === "new" ? "только новые" : "только б/у"} ×</button> : null}
            {settings.exactOnly ? <button type="button" onClick={() => updateSettings({ ...settings, exactOnly: false })}>точная модель ×</button> : null}
            {settings.categories.length ? <button type="button" onClick={() => updateSettings({ ...settings, categories: [] })}>{settings.categories.length === 1 ? categoryLabel(settings.categories[0]) : settings.categories.length + " категорий"} ×</button> : null}
            {category ? <button type="button" onClick={() => setCategory("")}>{category.startsWith("group:") ? category.slice(6) : categoryLabel(category)} ×</button> : null}
          </div>
          {counts && (counts.unknownLocation > 0 || counts.outsideRadius > 0) ? (
            <p className="settings-note">Вне радиуса: {counts.outsideRadius.toLocaleString("ru-RU")}{counts.unknownLocation ? " · без координат (скрыты при радиусе): " + counts.unknownLocation.toLocaleString("ru-RU") : ""}</p>
          ) : null}

          <div className="seg" role="tablist" aria-label="Тип предложений">
            {([["all", "Выгодные", byTier.strong.length + byTier.good.length], ["strong", "Best", byTier.strong.length], ["good", "Good", byTier.good.length], ["candidate", "Ждут оценки", byTier.candidate.length]] as const).map(([key, label, count]) => (
              <button type="button" role="tab" aria-selected={tier === key} key={key} className={tier === key ? "on" : ""} onClick={() => setTier(key)}>{label}<b>{count}</b></button>
            ))}
          </div>

          {error && !deals.length ? (
            <div className="state-panel error-panel"><div className="state-icon">!</div><h3>Каталог не загрузился</h3><p>{error}</p><button className="secondary-button" onClick={() => void loadDeals()}>Попробовать снова</button></div>
          ) : loading && !deals.length ? (
            <div className="deal-grid">{Array.from({ length: 6 }).map((_, index) => <div className="skeleton-card" key={index}><div /><span /><span /><span /></div>)}</div>
          ) : !visible.length ? (
            <div className="state-panel"><div className="state-icon">⌁</div><h3>Ничего не подходит</h3>
              <p>{counts?.feed ? "В каталоге " + counts.feed.toLocaleString("ru-RU") + " выгодных предложений, но они не проходят текущие фильтры." : "Подтверждённо выгодных предложений сейчас нет. Здесь появятся только те, где прибыль подтверждена независимыми ценами."}</p>
              {activeCount || category || search || dropsOnly ? <button className="secondary-button" onClick={() => { setSearch(""); setCategory(""); setDropsOnly(false); updateSettings({ ...DEFAULT_SETTINGS, location: settings.location }); }}>Сбросить фильтры</button> : null}
            </div>
          ) : shown ? (shown.length ? renderGrid(shown) : <p className="tier-empty">В этой группе сейчас пусто.</p>) : (
            <div className="deal-tiers">
              {byTier.strong.length ? <section className="deal-tier strong-tier"><div className="tier-heading"><h3>Best deals<span>{byTier.strong.length}</span></h3><p>Высокая уверенность: независимые цены с ≥2 площадок, прибыль после всех расходов</p></div>{renderGrid(byTier.strong)}</section> : null}
              {byTier.good.length ? <section className="deal-tier good-tier"><div className="tier-heading"><h3>Good deals<span>{byTier.good.length}</span></h3><p>Подтверждённая прибыль, уверенность средняя или запас меньше</p></div>{renderGrid(byTier.good)}</section> : null}
              {!byTier.strong.length && !byTier.good.length ? <p className="tier-empty">Подтверждённо выгодных предложений сейчас нет. Объявления без рыночной цены — во вкладке «Ждут оценки».</p> : null}
            </div>
          )}
        </section>
      ) : null}

      {tab === "explore" ? (
        <section className="content-section v2-section">
          <div className="seg" role="tablist" aria-label="Раздел">
            <button type="button" role="tab" aria-selected={exploreView === "categories"} className={exploreView === "categories" ? "on" : ""} onClick={() => setExploreView("categories")}>Категории</button>
            <button type="button" role="tab" aria-selected={exploreView === "research"} className={exploreView === "research" ? "on" : ""} onClick={() => setExploreView("research")}>Поиск модели</button>
          </div>
          {exploreView === "research" ? <Research settings={settings} onOpen={setSelected} /> : (
            <>
              <div className="v2-head"><h2>Категории</h2><p>Количество — с учётом ваших фильтров. Нажмите, чтобы открыть находки.</p></div>
              <button type="button" className={"v2-all" + (!category ? " on" : "")} onClick={() => { setCategory(""); setTab("home"); }}><strong>Все находки</strong><span>{deals.length}</span></button>
              {CATEGORY_GROUPS.map((group) => {
                const items = CATEGORIES.filter((item) => item.group === group);
                const total = items.reduce((sum, item) => sum + (groupCounts[item.key] || 0), 0);
                return (
                  <div className="cg-group" key={group}>
                    <button type="button" className="cg-group-head" onClick={() => { setCategory("group:" + group); setTab("home"); }}><strong>{group}</strong><span>{total ? total + " " + plural(total, "находка", "находки", "находок") : "пока пусто"}</span></button>
                    <div className="cg-chips">{items.map((item) => (
                      <button type="button" key={item.key} className={"preference-chip" + (groupCounts[item.key] ? "" : " empty")} onClick={() => { setCategory(item.key); setTab("home"); }}>{item.label}{groupCounts[item.key] ? <b>{groupCounts[item.key]}</b> : null}</button>
                    ))}</div>
                  </div>
                );
              })}
            </>
          )}
        </section>
      ) : null}

      {tab === "analytics" ? <Analytics stats={stats} counts={counts} scannedAt={scannedAt} /> : null}

      {tab === "saved" ? (
        <section className="content-section v2-section">
          <div className="seg" role="tablist" aria-label="Мои объявления">
            <button type="button" role="tab" aria-selected={savedView === "saved"} className={savedView === "saved" ? "on" : ""} onClick={() => setSavedView("saved")}>Избранное<b>{saved.length}</b></button>
            <button type="button" role="tab" aria-selected={savedView === "bought"} className={savedView === "bought" ? "on" : ""} onClick={() => setSavedView("bought")}>Мои покупки<b>{purchases.length}</b></button>
          </div>
          {savedView === "bought" ? <Purchases rows={purchases} onChange={changePurchases} /> : <>
          {saved.length && !savedLoading && savedDeals.length < saved.length ? (
            <p className="v2-note"><span>{saved.length - savedDeals.length} {plural(saved.length - savedDeals.length, "объявление", "объявления", "объявлений")} больше нет в каталоге — вероятно, проданы или сняты.</span>
              <button type="button" onClick={() => { const alive = new Set(savedDeals.map((deal) => deal.listing_id)); const next = saved.filter((id) => alive.has(id)); setSaved(next); try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(next)); } catch { /* ignore */ } }}>Убрать их</button></p>
          ) : null}
          {savedLoading && !savedDeals.length ? <div className="deal-grid">{Array.from({ length: 3 }).map((_, index) => <div className="skeleton-card" key={index}><div /><span /><span /></div>)}</div>
            : savedDeals.length ? renderGrid(savedDeals)
              : <div className="state-panel"><div className="state-icon">♡</div><h3>Пока пусто</h3><p>Нажмите ♡ на карточке, чтобы сохранить объявление.</p><button className="secondary-button" onClick={() => setTab("home")}>К находкам</button></div>}
          </>}
        </section>
      ) : null}

      {tab === "profile" ? (
        <section className="content-section v2-section">
          <div className="v2-me">
            <div className="v2-ava" aria-hidden="true">{(profile?.firstName || "D").slice(0, 1).toUpperCase()}</div>
            <div><strong>{profile ? profile.firstName + (profile.lastName ? " " + profile.lastName : "") : "Гость"}</strong><span>{profile?.username ? "@" + profile.username : profile ? "Вход через Telegram" : "Откройте приложение из Telegram"}</span></div>
          </div>
          <button type="button" className="v2-row" onClick={() => setSettingsOpen(true)}><span>Настройки поиска</span><b>{activeCount ? activeCount + " активных" : "по умолчанию"}</b></button>
          <div className="v2-card">
            <div className="v2-card-head"><h3>Сейчас применяется</h3></div>
            <ul className="settings-summary">
              <li><span>Локация</span><b>{settings.location ? settings.location.label : "не задана"}</b></li>
              <li><span>Радиус</span><b>{settings.location ? radiusLabel(settings.radiusKm) : "вся страна"}</b></li>
              <li><span>Цена</span><b>{settings.minPrice === null && settings.maxPrice === null ? "без ограничений" : (settings.minPrice !== null ? "от " + euro(settings.minPrice) + " " : "") + (settings.maxPrice !== null ? "до " + euro(settings.maxPrice) : "")}</b></li>
              <li><span>Скидка / прибыль / ROI</span><b>{settings.minDiscount ? "от " + settings.minDiscount + "%" : "любая"} · {settings.minProfit !== null ? "от " + euro(settings.minProfit) : "любая"} · {settings.minRoi !== null ? "от " + settings.minRoi + "%" : "любой"}</b></li>
              <li><span>Состояние</span><b>{settings.condition === "all" ? "новые и б/у" : settings.condition === "new" ? "только новые" : "только б/у"}{settings.exactOnly ? " · точная модель" : ""}</b></li>
              <li><span>Категории</span><b>{settings.categories.length ? settings.categories.map(categoryLabel).join(", ") : "все"}</b></li>
            </ul>
          </div>
          <button type="button" className="v2-row" onClick={() => setTab("saved")}><span>Избранное</span><b>{saved.length || "пусто"}</b></button>
          {hidden.length ? <button type="button" className="v2-row" onClick={() => changeHidden([])}><span>Скрытые объявления</span><b>вернуть {hidden.length}</b></button> : null}
          <div className="v2-card">
            <div className="v2-card-head"><h3>Уведомления в Telegram</h3></div>
            <p className="v2-hint">Новые Best и Good придут в чат с ботом, если в GitHub добавлены секреты TELEGRAM_TOKEN и TELEGRAM_CHAT_ID.</p>
            {profile?.id ? <button type="button" className="v2-row" onClick={copyTelegramId}><span>Ваш Telegram ID: {profile.id}</span><b>{copiedId ? "скопирован" : "скопировать"}</b></button> : null}
          </div>
          <p className="v2-hint">Избранное и настройки хранятся на этом устройстве. Переписка с AI не сохраняется нигде.</p>
        </section>
      ) : null}

      <footer className="app-footer">
        <div className="footer-brand">DEAL RADAR <span>•</span> NL</div>
        <p>Цены объявлений — цены предложений, а не завершённых сделок. Проверяйте товар и продавца.</p>
      </footer>

      <nav className="bottom-nav" aria-label="Основная навигация">
        <button className={tab === "overview" ? "nav-active" : ""} onClick={() => openTab("overview")}><Icon name="home" />Обзор</button>
        <button className={tab === "home" ? "nav-active" : ""} onClick={() => openTab("home")}><Icon name="spark" />Каталог{newIds.size ? <i>{newIds.size}</i> : null}</button>
        <button className={tab === "explore" ? "nav-active" : ""} onClick={() => openTab("explore")}><Icon name="search" />Поиск</button>
        <button className={tab === "analytics" ? "nav-active" : ""} onClick={() => openTab("analytics")}><Icon name="chart" />Аналитика</button>
        <button className={tab === "saved" || tab === "profile" ? "nav-active" : ""} onClick={() => openTab("saved")}><Icon name="heart" />Избранное{saved.length ? <i>{saved.length}</i> : null}</button>
      </nav>

      {selected ? <DealDetail key={selected.listing_id} deal={selected} saved={saved.includes(selected.listing_id)} bought={purchases.some((row) => row.id === selected.listing_id)} onSave={() => toggleSaved(selected.listing_id)} onClose={closeDetail} onHide={() => { if (!hidden.includes(selected.listing_id)) changeHidden([...hidden, selected.listing_id]); }} onBuy={recordPurchase} /> : null}
      {settingsOpen ? <SettingsSheet settings={settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} resultCount={counts?.matched ?? deals.length} loading={loading || refreshing} /> : null}
    </main>
  );
}
