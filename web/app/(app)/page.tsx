"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CatalogCounts, Deal, ScannerStats } from "@/lib/deals";
import { CATEGORIES, CATEGORY_GROUPS, categoryLabel, groupOf } from "@/lib/categories";
import { normalizeText } from "@/lib/product-identity";
import { activeSettingsCount, loadSettings, radiusLabel, saveSettings, settingsQuery, type SearchSettings, DEFAULT_SETTINGS } from "@/lib/settings";
import { Analytics } from "./components/Analytics";
import { DealCard } from "./components/DealCard";
import { DealDetail } from "./components/DealDetail";
import { Research } from "./components/Research";
import { SettingsSheet } from "./components/SettingsSheet";
import { Icon, ageLabel, euro, plural } from "./components/ui";

type Tab = "home" | "explore" | "analytics" | "saved" | "profile";
type Tier = "all" | "strong" | "good" | "candidate";
type Sort = "profit" | "score" | "distance" | "discount" | "newest" | "price";
type TelegramProfile = { id: number; firstName: string; lastName: string; username: string };

const FAVORITES_KEY = "deal-radar-favorites";
const REFRESH_MS = 120_000;
const SORTS: Array<[Sort, string]> = [["profit", "По прибыли"], ["score", "Лучшее сочетание"], ["distance", "Ближе ко мне"], ["discount", "По скидке"], ["newest", "Сначала новые"], ["price", "Сначала дешевле"]];

function matchesText(deal: Deal, query: string): boolean {
  const tokens = normalizeText(query).split(" ").filter((token) => token.length >= 2);
  if (!tokens.length) return true;
  const haystack = normalizeText(deal.title + " " + deal.category_label).replace(/\s+/g, " ");
  const compact = haystack.replace(/[\s.-]/g, "");
  return tokens.every((token) => haystack.includes(token) || compact.includes(token));
}

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
  const [tab, setTab] = useState<Tab>("home");
  const [tier, setTier] = useState<Tier>("all");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [saved, setSaved] = useState<string[]>([]);
  const [savedDeals, setSavedDeals] = useState<Deal[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [selected, setSelected] = useState<Deal | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profile, setProfile] = useState<TelegramProfile | null>(null);
  const [exploreView, setExploreView] = useState<"categories" | "research">("categories");
  const requestId = useRef(0);

  useEffect(() => {
    const stored = loadSettings();
    setSettings(stored);
    setSort(stored.priority === "distance" && stored.location ? "distance" : "profit");
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
      const response = await fetch("/api/deals?" + query, { cache: "no-store" });
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

  const visible = useMemo(() => deals.filter((deal) => {
    if (category.startsWith("group:") ? groupOf(deal.category_key) !== category.slice(6) : category && deal.category_key !== category) return false;
    return !search.trim() || matchesText(deal, search);
  }), [deals, category, search]);
  const byTier = useMemo(() => ({
    strong: visible.filter((deal) => deal.status === "strong"),
    good: visible.filter((deal) => deal.status === "good"),
    candidate: visible.filter((deal) => deal.status === "candidate"),
  }), [visible]);
  const groupCounts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const deal of deals) result[deal.category_key] = (result[deal.category_key] || 0) + 1;
    return result;
  }, [deals]);

  const activeCount = activeSettingsCount(settings);
  const scanAgeHours = scannedAt ? (Date.now() - new Date(scannedAt).getTime()) / 3_600_000 : null;
  const closeDetail = useCallback(() => setSelected(null), []);
  const shown = tier === "all" ? null : byTier[tier];

  const renderGrid = (list: Deal[]) => (
    <div className="deal-grid">{list.map((deal) => (
      <DealCard key={deal.listing_id} deal={deal} saved={saved.includes(deal.listing_id)} onSave={() => toggleSaved(deal.listing_id)} onOpen={() => setSelected(deal)} />
    ))}</div>
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup"><div className="brand-mark" aria-hidden="true">D</div><div className="brand-name">Deal Radar</div></div>
        <button type="button" className="top-location" onClick={() => setSettingsOpen(true)}>
          <Icon name="pin" size={16} />
          <span>{settings.location ? (settings.location.city || settings.location.label) + " · " + radiusLabel(settings.radiusKm) : "Вся страна"}</span>
        </button>
      </header>

      {tab === "home" ? (
        <section className="content-section" id="deals">
          <div className="section-heading">
            <div>
              <h2>Находки<span className="heading-count">{visible.length.toLocaleString("ru-RU")}</span></h2>
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
            <label className="search-box"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Модель, например «ps5 slim»" aria-label="Поиск по находкам" />{search ? <button type="button" className="clear-input" onClick={() => setSearch("")} aria-label="Очистить">×</button> : null}</label>
            <label className="sort-select"><span>Сортировка</span>
              <select value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
                {SORTS.map(([key, label]) => <option key={key} value={key} disabled={key === "distance" && !settings.location}>{label}{key === "distance" && !settings.location ? " (укажите локацию)" : ""}</option>)}
              </select>
            </label>
            <button type="button" className={"filter-button" + (activeCount ? " active" : "")} onClick={() => setSettingsOpen(true)}><Icon name="sliders" size={18} />Фильтры{activeCount ? <b>{activeCount}</b> : null}</button>
          </div>

          <div className="active-chips">
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
            {([["all", "Все", visible.length], ["strong", "Лучшие", byTier.strong.length], ["good", "Хорошие", byTier.good.length], ["candidate", "На проверке", byTier.candidate.length]] as const).map(([key, label, count]) => (
              <button type="button" role="tab" aria-selected={tier === key} key={key} className={tier === key ? "on" : ""} onClick={() => setTier(key)}>{label}<b>{count}</b></button>
            ))}
          </div>

          {error && !deals.length ? (
            <div className="state-panel error-panel"><div className="state-icon">!</div><h3>Каталог не загрузился</h3><p>{error}</p><button className="secondary-button" onClick={() => void loadDeals()}>Попробовать снова</button></div>
          ) : loading && !deals.length ? (
            <div className="deal-grid">{Array.from({ length: 6 }).map((_, index) => <div className="skeleton-card" key={index}><div /><span /><span /><span /></div>)}</div>
          ) : !visible.length ? (
            <div className="state-panel"><div className="state-icon">⌁</div><h3>Ничего не подходит</h3>
              <p>{counts?.feed ? "В каталоге " + counts.feed.toLocaleString("ru-RU") + " объявлений, но они не проходят текущие фильтры." : "Сканер ещё не опубликовал объявления."}</p>
              {activeCount || category || search ? <button className="secondary-button" onClick={() => { setSearch(""); setCategory(""); updateSettings({ ...DEFAULT_SETTINGS, location: settings.location }); }}>Сбросить фильтры</button> : null}
            </div>
          ) : shown ? (shown.length ? renderGrid(shown) : <p className="tier-empty">В этой группе сейчас пусто.</p>) : (
            <div className="deal-tiers">
              {byTier.strong.length ? <section className="deal-tier strong-tier"><div className="tier-heading"><h3>Очень выгодно<span>{byTier.strong.length}</span></h3><p>Достаточно сравнений, прибыль после всех расходов</p></div>{renderGrid(byTier.strong)}</section> : null}
              {byTier.good.length ? <section className="deal-tier good-tier"><div className="tier-heading"><h3>Хорошая цена<span>{byTier.good.length}</span></h3><p>Прибыль есть, запас меньше</p></div>{renderGrid(byTier.good)}</section> : null}
              {byTier.candidate.length ? <section className="deal-tier review-tier"><div className="tier-heading"><h3>На проверке<span>{byTier.candidate.length}</span></h3><p>Модель распознана, сканер собирает цены и перепроверяет по очереди</p></div>{renderGrid(byTier.candidate)}</section> : null}
            </div>
          )}
        </section>
      ) : null}

      {tab === "explore" ? (
        <section className="content-section v2-section">
          <div className="seg" role="tablist" aria-label="Раздел">
            <button type="button" role="tab" aria-selected={exploreView === "categories"} className={exploreView === "categories" ? "on" : ""} onClick={() => setExploreView("categories")}>Категории</button>
            <button type="button" role="tab" aria-selected={exploreView === "research"} className={exploreView === "research" ? "on" : ""} onClick={() => setExploreView("research")}>Анализ модели</button>
          </div>
          {exploreView === "research" ? <Research settings={settings} /> : (
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
          <div className="v2-head"><h2>Избранное<span className="heading-count">{saved.length}</span></h2><p>Показываются всегда, независимо от фильтров.</p></div>
          {saved.length && !savedLoading && savedDeals.length < saved.length ? (
            <p className="v2-note"><span>{saved.length - savedDeals.length} {plural(saved.length - savedDeals.length, "объявление", "объявления", "объявлений")} больше нет в каталоге — вероятно, проданы или сняты.</span>
              <button type="button" onClick={() => { const alive = new Set(savedDeals.map((deal) => deal.listing_id)); const next = saved.filter((id) => alive.has(id)); setSaved(next); try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(next)); } catch { /* ignore */ } }}>Убрать их</button></p>
          ) : null}
          {savedLoading && !savedDeals.length ? <div className="deal-grid">{Array.from({ length: 3 }).map((_, index) => <div className="skeleton-card" key={index}><div /><span /><span /></div>)}</div>
            : savedDeals.length ? renderGrid(savedDeals)
              : <div className="state-panel"><div className="state-icon">♡</div><h3>Пока пусто</h3><p>Нажмите ♡ на карточке, чтобы сохранить объявление.</p><button className="secondary-button" onClick={() => setTab("home")}>К находкам</button></div>}
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
          <p className="v2-hint">Избранное и настройки хранятся на этом устройстве. Переписка с AI не сохраняется нигде.</p>
        </section>
      ) : null}

      <footer className="app-footer">
        <div className="footer-brand">DEAL RADAR <span>•</span> NL</div>
        <p>Цены объявлений — цены предложений, а не завершённых сделок. Проверяйте товар и продавца.</p>
      </footer>

      <nav className="bottom-nav" aria-label="Основная навигация">
        <button className={tab === "home" ? "nav-active" : ""} onClick={() => setTab("home")}><Icon name="home" />Находки</button>
        <button className={tab === "explore" ? "nav-active" : ""} onClick={() => setTab("explore")}><Icon name="search" />Поиск</button>
        <button className={tab === "analytics" ? "nav-active" : ""} onClick={() => setTab("analytics")}><Icon name="chart" />Сканер</button>
        <button className={tab === "saved" ? "nav-active" : ""} onClick={() => setTab("saved")}><Icon name="heart" />Избранное{saved.length ? <i>{saved.length}</i> : null}</button>
        <button className={tab === "profile" ? "nav-active" : ""} onClick={() => setTab("profile")}><Icon name="sliders" />Настройки</button>
      </nav>

      {selected ? <DealDetail key={selected.listing_id} deal={selected} saved={saved.includes(selected.listing_id)} onSave={() => toggleSaved(selected.listing_id)} onClose={closeDetail} /> : null}
      {settingsOpen ? <SettingsSheet settings={settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} resultCount={counts?.matched ?? deals.length} loading={loading || refreshing} /> : null}
    </main>
  );
}
