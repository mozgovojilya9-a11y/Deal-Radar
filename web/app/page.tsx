"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Deal } from "@/lib/deals";

type Tab = "home" | "categories" | "saved" | "profile";
type Sort = "discount" | "newest" | "price";
type TelegramProfile = { id: number; firstName: string; lastName: string; username: string };
type UserSettings = { categories: string[]; minDiscount: number; maxDistanceKm: number | null };
const DEFAULT_SETTINGS: UserSettings = { categories: [], minDiscount: 0, maxDistanceKm: null };
const CATEGORIES = [
  { key: "", label: "Все", icon: "✦" },
  { key: "iphone-16", label: "iPhone 16", icon: "▣" },
  { key: "iphone-15", label: "iPhone 15", icon: "▣" },
  { key: "iphone-14", label: "iPhone 14", icon: "▣" },
  { key: "iphone-13", label: "iPhone 13", icon: "▣" },
  { key: "iphone-12", label: "iPhone 12", icon: "▣" },
  { key: "ps5", label: "PlayStation 5", icon: "⌘" },
  { key: "ps4", label: "PlayStation 4", icon: "⌘" },
  { key: "airpods-pro", label: "AirPods Pro", icon: "◉" },
  { key: "airpods-max", label: "AirPods Max", icon: "◉" },
  { key: "airpods", label: "AirPods", icon: "◉" },
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
          <span className="location">⌖ {deal.city || "Нидерланды"}{deal.distance_km != null ? " · " + Math.round(deal.distance_km) + " км" : ""}</span>
          <button className={"save-button" + (saved ? " active" : "")} onClick={onSave} aria-label="В избранное">
            {saved ? "♥" : "♡"}
          </button>
        </div>
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
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [settingsDraft, setSettingsDraft] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [settingsMessage, setSettingsMessage] = useState("");

  useEffect(() => {
    try { setSaved(JSON.parse(localStorage.getItem("deal-radar-favorites") || "[]") as string[]); }
    catch { setSaved([]); }
    const webApp = window.Telegram?.WebApp;
    if (!webApp) return;
    webApp.ready();
    webApp.expand();
    webApp.setHeaderColor?.("#0a0d12");
    webApp.setBackgroundColor?.("#0a0d12");
    if (!webApp.initData) return;
    setTelegramInitData(webApp.initData);
    const headers = { Authorization: `tma ${webApp.initData}` };
    void (async () => {
      try {
        const authResponse = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: webApp.initData })
        });
        if (!authResponse.ok) return;
        const authData = await authResponse.json();
        if (!authData.authenticated || !authData.user) return;
        setProfile(authData.user as TelegramProfile);
        const [favoritesResponse, settingsResponse, statsResponse] = await Promise.all([
          fetch("/api/favorites", { headers, cache: "no-store" }),
          fetch("/api/settings", { headers, cache: "no-store" }),
          fetch("/api/stats", { headers, cache: "no-store" })
        ]);
        if (favoritesResponse.ok) {
          const data = await favoritesResponse.json();
          const ids = Array.isArray(data.ids) ? data.ids as string[] : [];
          setSaved(ids);
          localStorage.setItem("deal-radar-favorites", JSON.stringify(ids));
        }
        if (settingsResponse.ok) {
          const data = await settingsResponse.json();
          const next = data.settings as UserSettings;
          setSettings(next);
          setSettingsDraft(next);
        }
        if (statsResponse.ok) {
          const data = await statsResponse.json();
          setBotStats(data.status as BotStats | null);
        }
      } catch { /* Personal features may be temporarily unavailable; keep the public feed usable. */ }
    })();
  }, []);

  const loadDeals = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ sort });
      if (category) params.set("category", category);
      const response = await fetch("/api/deals?" + params.toString(), { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить предложения");
      setDeals(Array.isArray(data.deals) ? data.deals as Deal[] : []);
      setUpdatedAt(data.updatedAt || new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [category, sort]);

  useEffect(() => {
    void loadDeals();
    const timer = window.setInterval(() => void loadDeals(), 90_000);
    return () => window.clearInterval(timer);
  }, [loadDeals]);

  const filtered = useMemo(() => {
    let result = deals;
    if (tab === "saved") result = result.filter((deal) => saved.includes(deal.listing_id));
    if (settings.categories.length) result = result.filter((deal) => settings.categories.includes(deal.category_key));
    if (settings.minDiscount > 0) result = result.filter((deal) => Number(deal.discount) * 100 >= settings.minDiscount);
    if (settings.maxDistanceKm !== null) result = result.filter((deal) => deal.distance_km === null || Number(deal.distance_km) <= settings.maxDistanceKm!);
    if (search.trim()) {
      const term = search.trim().toLocaleLowerCase();
      result = result.filter((deal) => (deal.title + " " + (deal.description || "")).toLocaleLowerCase().includes(term));
    }
    return result;
  }, [deals, saved, search, tab, settings]);

  function toggleSaved(id: string) {
    const wasSaved = saved.includes(id);
    const next = wasSaved ? saved.filter((item) => item !== id) : [...saved, id];
    setSaved(next);
    localStorage.setItem("deal-radar-favorites", JSON.stringify(next));
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("light");
    if (telegramInitData) {
      void fetch(wasSaved ? `/api/favorites?dealId=${encodeURIComponent(id)}` : "/api/favorites", {
        method: wasSaved ? "DELETE" : "POST",
        headers: telegramHeaders(true),
        ...(wasSaved ? {} : { body: JSON.stringify({ dealId: id }) })
      }).catch((error) => console.warn("Favorites sync failed", error));
    }
  }

  async function saveSettings() {
    setSettingsSaving(true);
    setSettingsMessage("");
    try {
      const response = await fetch("/api/settings", { method: "PUT", headers: telegramHeaders(true), body: JSON.stringify(settingsDraft) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось сохранить настройки");
      setSettings(data.settings as UserSettings);
      setSettingsDraft(data.settings as UserSettings);
      setSettingsMessage("Настройки сохранены");
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : "Ошибка сохранения");
    } finally { setSettingsSaving(false); }
  }

  useEffect(() => {
    setPriceHistory([]);
    if (!selected || !telegramInitData) return;
    const controller = new AbortController();
    fetch(`/api/deals/${encodeURIComponent(selected.listing_id)}/history`, { headers: telegramHeaders(), cache: "no-store", signal: controller.signal })
      .then(async (response) => { if (response.ok) { const data = await response.json(); setPriceHistory(Array.isArray(data.points) ? data.points as PricePoint[] : []); } })
      .catch(() => undefined);
    return () => controller.abort();
  }, [selected, telegramInitData]);

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

      <section className="hero">
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

      <section className="stats-grid">
        <div className="stat-card"><span className="stat-label">В ленте сейчас</span><strong>{deals.length}</strong><span className="stat-caption">актуальных предложений</span></div>
        <div className="stat-card accent-stat"><span className="stat-label">Максимальная скидка</span><strong>{deals.length ? Math.round(strongest * 100) + "%" : "—"}</strong><span className="stat-caption">от наблюдаемой цены рынка</span></div>
        <div className="stat-card"><span className="stat-label">Последний скан</span><strong className="stat-time">{botStats?.last_run_at ? new Date(botStats.last_run_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : updatedAt ? new Date(updatedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "—"}</strong><span className="stat-caption">{botStats ? `Проверено ${botStats.last_run_found} · новых ${botStats.last_run_new}${botStats.last_run_errors ? ` · ошибок ${botStats.last_run_errors}` : ""}` : "Статистика появится после запуска бота"}</span></div>
      </section>

      <section className="content-section" id="deals">
        <div className="section-heading">
          <div>
            <div className="eyebrow">CURATED DEALS</div>
            <h2>{tab === "saved" ? "Избранное" : "Свежие находки"}<span className="heading-count">{filtered.length}</span></h2>
            <p>{tab === "saved" ? "Сохранённые тобой объявления" : "Только то, что прошло проверку выгодности"}</p>
          </div>
          <button className="refresh-button" onClick={() => void loadDeals()} disabled={loading}><span className={loading ? "spin" : ""}>↻</span> Обновить</button>
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

        {error ? (
          <div className="state-panel error-panel">
            <div className="state-icon">!</div>
            <h3>Лента пока не подключена</h3>
            <p>{error}</p>
            <span>Нужны таблица Supabase и серверные переменные окружения. Инструкция есть в README репозитория.</span>
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
          </div>
        ) : (
          <div className="deal-grid">
            {filtered.map((deal) => (
              <DealCard key={deal.listing_id} deal={deal} saved={saved.includes(deal.listing_id)} onSave={() => toggleSaved(deal.listing_id)} onOpen={() => setSelected(deal)} />
            ))}
          </div>
        )}
      </section>

      <footer className="app-footer">
        <div className="footer-brand">DEAL RADAR <span>•</span> NL</div>
        <p>Цены объявлений — ориентир, а не гарантия цены продажи. Проверяй товар и продавца перед покупкой.</p>
        <span className="footer-location">{activeCategory} · {updatedAt ? "обновлено " + dateLabel(updatedAt) : "ожидаем данные"}</span>
      </footer>

      <nav className="bottom-nav" aria-label="Основная навигация">
        <button className={tab === "home" ? "nav-active" : ""} onClick={() => setTab("home")}><span>⌂</span>Главная</button>
        <button className={tab === "categories" ? "nav-active" : ""} onClick={() => { setTab("categories"); document.getElementById("deals")?.scrollIntoView({ behavior: "smooth" }); }}><span>▦</span>Категории</button>
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
          <div className="settings-actions"><span>{settingsMessage}</span><button className="secondary-button" onClick={() => void saveSettings()} disabled={settingsSaving || !telegramInitData}>{settingsSaving ? "Сохраняем…" : "Сохранить настройки"}</button></div>
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
              <div className="detail-facts"><span>⌖ {selected.city || "Нидерланды"}</span><span>Обнаружено {dateLabel(selected.detected_at)}</span></div>
              <div className="price-history">
                <strong>История цены</strong>
                {priceHistory.length ? <>
                  <div className="history-bars">
                    {priceHistory.map((point, index) => {
                      const values = priceHistory.map((item) => Number(item.price));
                      const min = Math.min(...values), max = Math.max(...values);
                      const height = max === min ? 55 : 18 + ((Number(point.price) - min) / (max - min)) * 62;
                      return <div className="history-point" key={point.observed_at + index} title={`${euro(point.price)} · ${dateLabel(point.observed_at)}`}><span className="history-bar" style={{ height: height + "%" }} /><small>{dateLabel(point.observed_at)}</small></div>;
                    })}
                  </div>
                  <p>{priceHistory.length} наблюдений. История пополняется при следующих сканированиях.</p>
                </> : <p>Пока мало данных. История начнёт собираться после следующих запусков бота.</p>}
              </div>
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
