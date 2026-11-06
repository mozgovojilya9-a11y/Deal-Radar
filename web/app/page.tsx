"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Deal, ScannerStats } from "@/lib/deals";

type Tab = "home" | "categories" | "saved" | "analytics" | "profile";
type Sort = "discount" | "newest" | "price";
type TelegramProfile = { id: number; firstName: string; lastName: string; username: string };
type UserSettings = { categories: string[]; minDiscount: number; maxDistanceKm: number | null; minPrice: number | null; maxPrice: number | null };
const DEFAULT_SETTINGS: UserSettings = { categories: [], minDiscount: 0, maxDistanceKm: null, minPrice: null, maxPrice: null };
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

function euro(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(value));
}
 
function priceValue(raw: string): number | null {
  const parsed = Number(raw.replace(",", "."));
  return raw.trim() !== "" && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function readSettings(raw: unknown): UserSettings {
  const stored = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const positive = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null);
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
  const discount = Math.max(0, Math.round(Number(deal.discount) * 100));
  return (
    <article className="deal-card">
      <button className="image-button" onClick={onOpen} aria-label={"Открыть " + deal.title}>
        <div className="deal-image">
          {deal.image_url ? (
            // Marktplaats image hosts are dynamic; plain img avoids a hard-coded remote host allowlist.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={deal.image_url} alt={deal.title} loading="lazy" referrerPolicy="no-referrer" />
          ) : (
            <span className="image-fallback">✦</span>
          )}
          <span className="discount-pill">−{discount}%</span>
        </div>
      </button>
      <div className="deal-content">
        <div className="deal-meta">
          <span>{deal.category_label}</span>
          <span>{dateLabel(deal.posted_at || deal.detected_at)}</span>
        </div>
        <button className="deal-title" onClick={onOpen}>{deal.title}</button>
        <div className="price-row">
          <strong>{euro(deal.price)}</strong>
          <span className="old-price">{euro(deal.market_price)}</span>
        </div>
        <div className="saving-line">
          <span>Экономия</span>
          <strong>{euro(Math.max(0, Number(deal.market_price) - Number(deal.price)))}</strong>
        </div>
        <div className="card-footer">
          <span className="location">⌖ {deal.city || "Нидерланды"}{deal.distance_km != null ? <b className="distance"> · {Math.round(deal.distance_km)} км</b> : null}</span>
          <button className={"save-button" + (saved ? " active" : "")} onClick={onSave} aria-label="В избранное">
            {saved ? "♥" : "♡"}
          </button>
        </div>
        <a className="card-link" href={deal.listing_url} target="_blank" rel="noopener noreferrer">Открыть на Marktplaats <span>↗</span></a>
      </div>
    </article>
  );
}

export default function HomePage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<Sort>("discount");
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
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [settingsDraft, setSettingsDraft] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [settingsMessage, setSettingsMessage] = useState("");

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
        setSettingsDraft(next);
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
      if (category) params.set("category", category);
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
  }, [category, sort]);

  useEffect(() => {
    void loadDeals();
    const timer = window.setInterval(() => void loadDeals(true), REFRESH_INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void loadDeals(true); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [loadDeals]);

  const filtered = useMemo(() => {
    let result = deals;
    if (tab === "saved") result = result.filter((deal) => saved.includes(deal.listing_id));
    if (settings.categories.length) result = result.filter((deal) => settings.categories.includes(deal.category_key));
    if (settings.minDiscount > 0) result = result.filter((deal) => Number(deal.discount) * 100 >= settings.minDiscount);
    if (settings.maxDistanceKm !== null) result = result.filter((deal) => deal.distance_km === null || Number(deal.distance_km) <= settings.maxDistanceKm!);
    if (settings.minPrice !== null) result = result.filter((deal) => Number(deal.price) >= settings.minPrice!);
    if (settings.maxPrice !== null) result = result.filter((deal) => Number(deal.price) <= settings.maxPrice!);
    if (search.trim()) {
      const term = search.trim().toLocaleLowerCase();
      result = result.filter((deal) => (deal.title + " " + (deal.description || "")).toLocaleLowerCase().includes(term));
    }
    return result;
  }, [deals, saved, search, tab, settings]);

  function toggleSaved(id: string) {
    setSaved((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      try { localStorage.setItem("deal-radar-favorites", JSON.stringify(next)); } catch { /* storage unavailable */ }
      return next;
    });
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("light");
  }

  function persistSettings(next: UserSettings) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  }

  function saveSettings() {
    setSettings(settingsDraft);
    persistSettings(settingsDraft);
    setSettingsMessage("Настройки сохранены на этом устройстве");
  }

  function updateFilters(patch: Partial<UserSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    setSettingsDraft((old) => ({ ...old, ...patch }));
    persistSettings(next);
  }

  const activeFilters = (settings.minDiscount > 0 ? 1 : 0) + (settings.minPrice !== null ? 1 : 0) + (settings.maxPrice !== null ? 1 : 0)
    + (settings.maxDistanceKm !== null ? 1 : 0) + (settings.categories.length ? 1 : 0) + (category ? 1 : 0) + (search.trim() ? 1 : 0);

  function resetFilters() {
    setSearch("");
    setCategory("");
    updateFilters({ ...DEFAULT_SETTINGS });
  }

  const strongest = deals.length ? Math.max(...deals.map((deal) => Number(deal.discount) || 0)) : 0;
  const activeCategory = CATEGORIES.find((item) => item.key === category)?.label || "Все категории";

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
          {profile ? <span>{profile.firstName || "Пользователь"}</span> : <span>LIVE SCAN</span>}
        </div>
      </header>

      <section className={"hero" + (tab === "home" ? "" : " hero-compact")}>
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> RADAR IS ACTIVE</div>
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

      <section className="stats-grid scanner-overview">
        <div className="stat-card"><span className="stat-label">Проверено сканером</span><strong>{scannerStats ? scannerStats.checked.toLocaleString("ru-RU") : "—"}</strong><span className="stat-caption">объявлений за последний запуск</span></div>
        <div className="stat-card accent-stat"><span className="stat-label">Выгодных в каталоге</span><strong>{deals.length}</strong><span className="stat-caption">прошли оценку цены и фильтры</span></div>
        <div className="stat-card"><span className="stat-label">Кандидатов оценено</span><strong>{scannerStats ? scannerStats.candidates.toLocaleString("ru-RU") : "—"}</strong><span className="stat-caption">после первичного отбора</span></div>
        <div className="stat-card"><span className="stat-label">Отсеяно правилами</span><strong>{scannerStats ? scannerStats.rejectedTotal.toLocaleString("ru-RU") : "—"}</strong><span className="stat-caption">возраст, риски, данные и скидка</span></div>
      </section>

      {tab === "analytics" ? (
        <section className="content-section analytics-section">
          <div className="section-heading">
            <div><div className="eyebrow">SCANNER PERFORMANCE</div><h2>Аналитика сканера</h2><p>Результаты последнего запуска Marktplaats scanner</p></div>
            <span className="scanner-live"><i /> {scannerStats ? "Данные получены" : "Ожидаем первый отчёт"}</span>
          </div>
          <div className="analytics-summary">
            <div className="analytics-primary"><span>Объявлений проверено</span><strong>{scannerStats ? scannerStats.checked.toLocaleString("ru-RU") : "—"}</strong><small>{scannerStats ? "за один запуск · " + ageLabel(scannerStats.finishedAt) : "статистика появится после публикации нового сканирования"}</small></div>
            <div className="analytics-primary green"><span>Выгодных добавлено за запуск</span><strong>{scannerStats ? scannerStats.newDeals.toLocaleString("ru-RU") : "—"}</strong><small>Всего активных предложений в каталоге: {deals.length}</small></div>
          </div>
          <div className="analytics-grid">
            <div className="analytics-card"><span>Прошли базовые фильтры</span><strong>{scannerStats ? scannerStats.accepted.toLocaleString("ru-RU") : "—"}</strong><small>подходящие по модели, цене и ключевым словам</small></div>
            <div className="analytics-card"><span>Кандидаты оценены</span><strong>{scannerStats ? scannerStats.candidates.toLocaleString("ru-RU") : "—"}</strong><small>для сравнения с рыночной стоимостью</small></div>
            <div className="analytics-card"><span>Ошибки поисковых запросов</span><strong>{scannerStats ? scannerStats.failedQueries + " / " + scannerStats.queryCount : "—"}</strong><small>ошибившиеся запросы из общего числа</small></div>
            <div className="analytics-card"><span>Максимальная скидка в каталоге</span><strong>{deals.length ? Math.round(strongest * 100) + "%" : "—"}</strong><small>от ориентировочной рыночной цены</small></div>
          </div>
          <div className="rejection-panel">
            <div className="rejection-heading"><div><div className="eyebrow">FILTER BREAKDOWN</div><h3>Почему объявления отсеялись</h3></div><strong>{scannerStats ? scannerStats.rejectedTotal.toLocaleString("ru-RU") : "—"} <small>всего</small></strong></div>
            {[
              { label: "Слишком старые", value: scannerStats?.rejectedAge ?? 0, color: "age" },
              { label: "Подозрительные / рисковые", value: scannerStats?.rejectedRisk ?? 0, color: "risk" },
              { label: "Недостаточно рыночных данных", value: scannerStats?.rejectedSamples ?? 0, color: "samples" },
              { label: "Скидка ниже заданного порога", value: scannerStats?.rejectedDiscount ?? 0, color: "discount" }
            ].map((item) => {
              const total = scannerStats?.rejectedTotal ?? 0;
              const width = total > 0 ? Math.min(100, (item.value / total) * 100) : 0;
              return <div className="rejection-row" key={item.color}><div className="rejection-label"><span>{item.label}</span><strong>{scannerStats ? item.value.toLocaleString("ru-RU") : "—"}</strong></div><div className="rejection-track"><i className={"rejection-fill " + item.color} style={{ width: width + "%" }} /></div></div>;
            })}
            <p className="analytics-note">Счётчики относятся к последнему запуску. Повторные объявления в разных поисковых категориях могут учитываться в общем количестве проверок более одного раза.</p>
          </div>
        </section>
      ) : null}

      {tab === "categories" ? (
        <section className="content-section categories-section">
          <div className="section-heading"><div><div className="eyebrow">BROWSE BY CATEGORY</div><h2>Категории товаров</h2><p>Выбери категорию, чтобы посмотреть подходящие предложения</p></div><span className="category-total">{deals.length} в каталоге</span></div>
          <div className="category-browser">
            <button className={"category-tile all-category" + (!category ? " selected" : "")} onClick={() => { setCategory(""); setTab("home"); }}><span className="category-symbol">✦</span><span><strong>Все категории</strong><small>{deals.length} предложений</small></span><b>↗</b></button>
            {CATEGORIES.filter((item) => item.key).map((item) => {
              const count = deals.filter((deal) => deal.category_key === item.key).length;
              return <button className="category-tile" key={item.key} onClick={() => { setCategory(item.key); setTab("home"); }}><span className="category-symbol">{item.icon}</span><span><strong>{item.label}</strong><small>{count} {count === 1 ? "предложение" : "предложений"}</small></span><b>↗</b></button>;
            })}
          </div>
        </section>
      ) : null}

      {(tab === "home" || tab === "saved") ? (
      <section className="content-section" id="deals">
        <div className="section-heading">
          <div>
            <div className="eyebrow">CURATED DEALS</div>
            <h2>{tab === "saved" ? "Избранное" : "Свежие находки"}<span className="heading-count">{filtered.length}</span></h2>
            <p>{tab === "saved" ? "Сохранённые тобой объявления" : "Только то, что прошло проверку выгодности"}</p>
          </div>
          <button className="refresh-button" onClick={() => void loadDeals(true)} disabled={loading || refreshing}><span className={loading || refreshing ? "spin" : ""}>↻</span> Обновить</button>
        </div>

        <div className="toolbar">
          <label className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти товар..." /></label>
          <label className="sort-select"><span>Сортировка</span><select value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="discount">По скидке</option><option value="newest">Сначала новые</option><option value="price">Сначала дешевле</option></select></label>
        </div>

        <div className="category-strip">
          {CATEGORIES.map((item) => (
            <button key={item.key || "all"} className={"category-chip" + (category === item.key ? " selected" : "")} onClick={() => { setCategory(item.key); setTab("home"); }}>
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </div>

        <div className="filter-panel" role="group" aria-label="Фильтры по цене и скидке">
          <div className="filter-group">
            <span className="filter-label">Цена, €</span>
            <div className="price-range">
              <input type="number" inputMode="numeric" min="0" placeholder="от" aria-label="Минимальная цена" value={settings.minPrice ?? ""} onChange={(event) => updateFilters({ minPrice: priceValue(event.target.value) })} />
              <i>—</i>
              <input type="number" inputMode="numeric" min="0" placeholder="до" aria-label="Максимальная цена" value={settings.maxPrice ?? ""} onChange={(event) => updateFilters({ maxPrice: priceValue(event.target.value) })} />
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

        {error && deals.length === 0 ? (
          <div className="state-panel error-panel">
            <div className="state-icon">!</div>
            <h3>Лента пока не подключена</h3>
            <p>{error}</p>
            <span>Проверьте доступность каталога и попробуйте обновить страницу ещё раз.</span>
            <button className="secondary-button" onClick={() => void loadDeals()}>Попробовать снова</button>
          </div>
        ) : loading && filtered.length === 0 ? (
          <div className="deal-grid">
            {Array.from({ length: 6 }).map((_, index) => <div className="skeleton-card" key={index}><div /><span /><span /><span /></div>)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="state-panel">
            <div className="state-icon">⌁</div>
            <h3>{tab === "saved" ? "Пока ничего не сохранено" : "Пока нет подходящих предложений"}</h3>
            <p>{tab === "saved" ? "Нажимай на сердечко в карточке, чтобы сохранить товар." : "Бот продолжает собирать рыночные цены. Когда появятся предложения с нужной скидкой, они отобразятся здесь."}</p>
            {tab === "saved" ? <button className="secondary-button" onClick={() => setTab("home")}>К предложениям</button> : null}
            {tab !== "saved" && activeFilters ? <button className="secondary-button" onClick={resetFilters}>Сбросить фильтры</button> : null}
          </div>
        ) : (
          <div className="deal-grid">
            {filtered.map((deal) => (
              <DealCard key={deal.listing_id} deal={deal} saved={saved.includes(deal.listing_id)} onSave={() => toggleSaved(deal.listing_id)} onOpen={() => setSelected(deal)} />
            ))}
          </div>
        )}
      </section>

      ) : null}

      <footer className="app-footer">
        <div className="footer-brand">DEAL RADAR <span>•</span> NL</div>
        <p>Цены объявлений — ориентир, а не гарантия цены продажи. Проверяй товар и продавца перед покупкой.</p>
        <span className="footer-location">{activeCategory} · {updatedAt ? "обновлено " + dateLabel(updatedAt) : "ожидаем данные"}</span>
      </footer>

      <nav className="bottom-nav" aria-label="Основная навигация">
        <button className={tab === "home" ? "nav-active" : ""} onClick={() => setTab("home")}><span>⌂</span>Главная</button>
        <button className={tab === "categories" ? "nav-active" : ""} onClick={() => setTab("categories")}><span>▦</span>Категории</button>
        <button className={tab === "analytics" ? "nav-active" : ""} onClick={() => setTab("analytics")}><span>▥</span>Аналитика</button>
        <button className={tab === "saved" ? "nav-active" : ""} onClick={() => setTab("saved")}><span>♡</span>Избранное{saved.length ? <i>{saved.length}</i> : null}</button>
        <button className={tab === "profile" ? "nav-active" : ""} onClick={() => setTab("profile")}><span>◉</span>Профиль</button>
      </nav>

      {tab === "profile" ? (
        <div className="profile-toast settings-panel" role="region" aria-label="Настройки Deal Radar">
          <div className="settings-head"><div><strong>{profile ? profile.firstName + (profile.lastName ? " " + profile.lastName : "") : "Гость Deal Radar"}</strong><span>{profile?.username ? "@" + profile.username : profile ? "Telegram подтверждён" : "Откройте приложение из Telegram"}</span></div><button onClick={() => setTab("home")}>×</button></div>
          <label className="settings-field">Минимальная скидка: <b>{settingsDraft.minDiscount}%</b>
            <input type="range" min="0" max="70" step="5" value={settingsDraft.minDiscount} onChange={(event) => setSettingsDraft((old) => ({ ...old, minDiscount: Number(event.target.value) }))} />
          </label>
          <label className="settings-field">Максимальное расстояние
            <select value={settingsDraft.maxDistanceKm ?? 0} onChange={(event) => setSettingsDraft((old) => ({ ...old, maxDistanceKm: Number(event.target.value) || null }))}>
              <option value="0">Без ограничения</option><option value="10">10 км</option><option value="25">25 км</option><option value="50">50 км</option><option value="100">100 км</option><option value="150">150 км</option>
            </select>
          </label>
          <div className="settings-field">Категории <span className="settings-hint">Пустой выбор = все категории</span>
            <div className="settings-category-grid">
              {CATEGORIES.filter((item) => item.key).map((item) => <button type="button" key={item.key} className={settingsDraft.categories.includes(item.key) ? "preference-chip active" : "preference-chip"} onClick={() => setSettingsDraft((old) => ({ ...old, categories: old.categories.includes(item.key) ? old.categories.filter((key) => key !== item.key) : [...old.categories, item.key] }))}>{item.label}</button>)}
            </div>
          </div>
          <div className="settings-actions"><span>{settingsMessage}</span><button className="secondary-button" onClick={saveSettings}>Сохранить настройки</button></div>
          <p className="settings-note">Эти фильтры влияют на ленту приложения. Базовый регион и радиус сканера задаются в config.json.</p>
        </div>
      ) : null}

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
              <div className="eyebrow">{selected.category_label} · −{Math.round(Number(selected.discount) * 100)}%</div>
              <h2>{selected.title}</h2>
              <div className="detail-price"><strong>{euro(selected.price)}</strong><span>Рынок ≈ {euro(selected.market_price)}</span></div>
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
