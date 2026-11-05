"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Deal } from "@/lib/supabase";

type Tab = "home" | "categories" | "saved" | "profile";
type Sort = "discount" | "newest" | "price";
type TelegramProfile = { id: number; firstName: string; lastName: string; username: string };

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

  useEffect(() => {
    try {
      setSaved(JSON.parse(localStorage.getItem("deal-radar-favorites") || "[]") as string[]);
    } catch {
      setSaved([]);
    }
    const webApp = window.Telegram?.WebApp;
    if (webApp) {
      webApp.ready();
      webApp.expand();
      webApp.setHeaderColor?.("#0a0d12");
      webApp.setBackgroundColor?.("#0a0d12");
      if (webApp.initData) {
        fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: webApp.initData })
        })
          .then(async (response) => {
            if (!response.ok) return;
            const data = await response.json();
            if (data.authenticated && data.user) setProfile(data.user as TelegramProfile);
          })
          .catch(() => undefined);
      }
    }
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
    if (search.trim()) {
      const term = search.trim().toLocaleLowerCase();
      result = result.filter((deal) => (deal.title + " " + (deal.description || "")).toLocaleLowerCase().includes(term));
    }
    return result;
  }, [deals, saved, search, tab]);

  function toggleSaved(id: string) {
    setSaved((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      localStorage.setItem("deal-radar-favorites", JSON.stringify(next));
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("light");
      return next;
    });
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
        <div className="stat-card"><span className="stat-label">Обновление</span><strong className="stat-time">{updatedAt ? new Date(updatedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "—"}</strong><span className="stat-caption">автоматическая проверка</span></div>
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
        <div className="profile-toast" role="status">
          <strong>{profile ? profile.firstName + (profile.lastName ? " " + profile.lastName : "") : "Гость Deal Radar"}</strong>
          <span>{profile?.username ? "@" + profile.username : profile ? "Telegram подтверждён" : "Открой Mini App из Telegram для подтверждения профиля."}</span>
          <button onClick={() => setTab("home")}>Закрыть</button>
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
