"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { CatalogCounts, Deal, ScannerStats } from "@/lib/deals";
import { activeSettingsCount, loadSettings, radiusLabel, saveSettings, settingsQuery, type SearchSettings, DEFAULT_SETTINGS } from "@/lib/settings";
import { addPurchase, loadPurchases, savePurchases, type Purchase } from "@/lib/purchases";
import { Analytics } from "./components/Analytics";
import { Dashboard } from "./components/Dashboard";
import { DealDetail } from "./components/DealDetail";
import { SettingsSheet } from "./components/SettingsSheet";
import { CatalogTab, NO_FILTERS, SORTS, type CatalogFilters, type Sort } from "./components/tabs/CatalogTab";
import { ExploreTab } from "./components/tabs/ExploreTab";
import { ProfileTab, type TelegramProfile } from "./components/tabs/ProfileTab";
import { SavedTab } from "./components/tabs/SavedTab";
import { useTelegramTheme } from "./components/theme";
import { Paywall, SubscriptionCard, TrialBanner, useSubscription } from "./components/Subscription";
import { Icon, type IconName } from "./components/ui";

type Tab = "overview" | "home" | "explore" | "analytics" | "saved" | "profile";

const FAVORITES_KEY = "deal-radar-favorites";
const HIDDEN_KEY = "deal-radar-hidden";
const SEEN_KEY = "deal-radar-seen-deals";
const SORT_KEY = "deal-radar-sort";
const REFRESH_MS = 120_000;

function readIds(key: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];
  } catch { return []; }
}
function writeIds(key: string, ids: string[]): void {
  try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* storage unavailable: kept for this session */ }
}

const NAV: Array<[Tab, IconName, string]> = [["overview", "target", "Обзор"], ["home", "spark", "Каталог"], ["explore", "search", "Поиск"], ["analytics", "chart", "Аналитика"], ["saved", "heart", "Избранное"]];

export default function HomePage() {
  useTelegramTheme();
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
  const [filters, setFilters] = useState<CatalogFilters>(NO_FILTERS);
  const [saved, setSaved] = useState<string[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [selected, setSelected] = useState<Deal | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profile, setProfile] = useState<TelegramProfile | null>(null);
  const requestId = useRef(0);
  const subscription = useSubscription();
  const [paywallOpen, setPaywallOpen] = useState(false);

  useEffect(() => {
    const stored = loadSettings();
    setSettings(stored);
    let storedSort: string | null = null;
    try { storedSort = localStorage.getItem(SORT_KEY); } catch { /* storage unavailable */ }
    setSort(SORTS.some(([key]) => key === storedSort) && (storedSort !== "distance" || stored.location) ? storedSort as Sort : stored.priority === "distance" && stored.location ? "distance" : "profit");
    setPurchases(loadPurchases());
    setHidden(readIds(HIDDEN_KEY));
    setSaved(readIds(FAVORITES_KEY));
    setSettingsReady(true);

    const webApp = window.Telegram?.WebApp;
    if (!webApp) return;
    webApp.ready();
    webApp.expand();
    if (!webApp.initData) return;
    void fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData: webApp.initData }) })
      .then(async (response) => { if (!response.ok) return; const data = await response.json(); if (data.authenticated && data.user) setProfile(data.user); })
      .catch(() => undefined);
  }, []);

  const query = useMemo(() => settingsQuery(settings, sort).toString(), [settings, sort]) + (subscription.locked ? "&locked=1" : "");

  const loadDeals = useCallback(async (silent = false) => {
    const id = ++requestId.current;
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const response = await apiFetch("/api/deals?compact=1&" + query, { cache: "no-store" });
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
    // The first catalogue request waits for the access check, which starts a new user's trial.
    if (!settingsReady || subscription.loading) return;
    void loadDeals();
    const timer = window.setInterval(() => void loadDeals(true), REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void loadDeals(true); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [loadDeals, settingsReady, subscription.loading]);

  function updateSettings(next: SearchSettings) {
    setSettings(next);
    saveSettings(next);
    if (next.priority !== settings.priority) setSort(next.priority === "distance" && next.location ? "distance" : "profit");
  }

  function changeSaved(next: string[]) {
    setSaved(next);
    writeIds(FAVORITES_KEY, next);
  }
  function toggleSaved(id: string) {
    changeSaved(saved.includes(id) ? saved.filter((item) => item !== id) : [...saved, id]);
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("light");
  }
  function changeHidden(next: string[]) {
    setHidden(next);
    writeIds(HIDDEN_KEY, next);
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

  const shownDeals = useMemo(() => { const skip = new Set(hidden); return deals.filter((deal) => !skip.has(deal.listing_id)); }, [deals, hidden]);
  const profitableIds = useMemo(() => deals.filter((deal) => deal.status !== "candidate").map((deal) => deal.listing_id), [deals]);

  // "New" means: a profitable listing this device has not been shown yet. The very first visit marks nothing.
  useEffect(() => {
    if (!lastLoaded) return;
    let seen: string[] | null = null;
    try { const raw = localStorage.getItem(SEEN_KEY); seen = raw ? JSON.parse(raw) : null; } catch { seen = null; }
    if (!Array.isArray(seen)) { writeIds(SEEN_KEY, profitableIds); return; }
    const known = new Set(seen);
    setNewIds(new Set(profitableIds.filter((id) => !known.has(id))));
  }, [profitableIds, lastLoaded]);

  const previousTab = useRef<Tab>("overview");
  useEffect(() => {
    if (previousTab.current === "home" && tab !== "home") {
      writeIds(SEEN_KEY, [...new Set([...readIds(SEEN_KEY), ...profitableIds])].slice(-3000));
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

  const activeCount = activeSettingsCount(settings);
  const closeDetail = useCallback(() => setSelected(null), []);
  /** Bottom menu: open the section and return to its top, also when it is already open. */
  const openTab = (next: Tab) => {
    window.scrollTo({ top: 0, behavior: next === tab ? "smooth" : "auto" });
    setTab(next);
  };
  const showCatalog = (patch: Partial<CatalogFilters>) => { setFilters((current) => ({ ...current, ...patch })); openTab("home"); };
  const afterPayment = () => { subscription.refresh(); setPaywallOpen(false); };
  // Without a subscription or trial every section except the overview figures shows the offer.
  const locked = subscription.locked;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup"><div className="brand-mark" aria-hidden="true"><Icon name="target" size={18} /></div><div className="brand-name">Deal Radar</div></div>
        <button type="button" className="top-location" onClick={() => setSettingsOpen(true)}>
          <Icon name="pin" size={16} />
          <span>{settings.location ? (settings.location.city || settings.location.label) + " · " + radiusLabel(settings.radiusKm) : "Вся страна"}</span>
        </button>
        <button type="button" className={"icon-button" + (tab === "profile" ? " on" : "")} onClick={() => openTab("profile")} aria-label="Профиль и настройки"><Icon name="sliders" size={18} /></button>
      </header>

      <TrialBanner subscription={subscription} onUpgrade={() => setPaywallOpen(true)} />

      <div className="tab-view" key={tab}>
        {locked && tab !== "profile" ? (
          <section className="content-section">
            {tab === "overview" ? (
              <div className="locked-kpis">
                <div className="kpi best"><span>Best deals сейчас</span><strong>{counts?.byStatus.strong ?? "—"}</strong></div>
                <div className="kpi good"><span>Good deals сейчас</span><strong>{counts?.byStatus.good ?? "—"}</strong></div>
                <div className="kpi"><span>Проверено за запуск</span><strong>{stats?.unique?.toLocaleString("ru-RU") ?? "—"}</strong></div>
              </div>
            ) : null}
            <Paywall subscription={subscription} onPaid={afterPayment} />
          </section>
        ) : null}
        {!locked && tab === "overview" ? (
          <Dashboard deals={shownDeals} stats={stats} scannedAt={scannedAt} lastLoaded={lastLoaded} saved={saved} onSave={toggleSaved} onOpen={setSelected}
            onShowAll={(tier) => showCatalog({ tier, dropsOnly: false })} onShowDrops={() => showCatalog({ tier: "all", dropsOnly: true })} />
        ) : null}
        {!locked && tab === "home" ? (
          <CatalogTab deals={shownDeals} counts={counts} scannedAt={scannedAt} lastLoaded={lastLoaded} loading={loading} refreshing={refreshing} error={error}
            onReload={(silent) => void loadDeals(silent)} filters={filters} onFilters={(patch) => setFilters((current) => ({ ...current, ...patch }))}
            sort={sort} onSort={changeSort} settings={settings} onSettings={updateSettings} activeCount={activeCount} onOpenSettings={() => setSettingsOpen(true)}
            savedIds={saved} newIds={newIds} onSave={toggleSaved} onOpen={setSelected} />
        ) : null}
        {!locked && tab === "explore" ? (
          <ExploreTab settings={settings} deals={shownDeals} category={filters.category} onOpen={setSelected}
            onPickCategory={(category) => showCatalog({ category })} />
        ) : null}
        {!locked && tab === "analytics" ? <Analytics stats={stats} counts={counts} scannedAt={scannedAt} lastLoaded={lastLoaded} purchases={purchases}
          onOpen={setSelected} onCategory={(category) => showCatalog({ category, tier: "all", dropsOnly: false, search: "" })} /> : null}
        {!locked && tab === "saved" ? (
          <SavedTab savedIds={saved} onSavedIds={changeSaved} location={settings.location} purchases={purchases} onPurchases={changePurchases}
            newIds={newIds} onSave={toggleSaved} onOpen={setSelected} onBrowse={() => openTab("home")} />
        ) : null}
        {tab === "profile" ? (
          <ProfileTab profile={profile} settings={settings} activeCount={activeCount} savedCount={saved.length} hiddenCount={hidden.length}
            onOpenSettings={() => setSettingsOpen(true)} onShowSaved={() => openTab("saved")} onRestoreHidden={() => changeHidden([])}>
            <SubscriptionCard subscription={subscription} onOpenPaywall={() => setPaywallOpen(true)} />
          </ProfileTab>
        ) : null}
      </div>

      <footer className="app-footer">
        <div className="footer-brand">DEAL RADAR <span>•</span> NL</div>
        <p>Цены объявлений — цены предложений, а не завершённых сделок. Проверяйте товар и продавца.</p>
      </footer>

      <nav className="bottom-nav" aria-label="Основная навигация">
        {NAV.map(([key, icon, label]) => {
          const active = tab === key || (key === "saved" && tab === "profile");
          const badge = key === "home" ? newIds.size : key === "saved" ? saved.length : 0;
          return (
            <button key={key} type="button" className={active ? "nav-active" : ""} aria-current={active ? "page" : undefined} onClick={() => openTab(key)}>
              <span className="nav-icon"><Icon name={icon} />{badge ? <i>{badge}</i> : null}</span>{label}
            </button>
          );
        })}
      </nav>

      {selected ? <DealDetail key={selected.listing_id} deal={selected} saved={saved.includes(selected.listing_id)} bought={purchases.some((row) => row.id === selected.listing_id)} onSave={() => toggleSaved(selected.listing_id)} onClose={closeDetail} onHide={() => { if (!hidden.includes(selected.listing_id)) changeHidden([...hidden, selected.listing_id]); }} onBuy={recordPurchase} /> : null}
      {paywallOpen ? (
        <div className="modal-backdrop" onClick={() => setPaywallOpen(false)}>
          <section className="detail-modal paywall-modal" role="dialog" aria-modal="true" aria-label="Подписка" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setPaywallOpen(false)} aria-label="Закрыть">×</button>
            <Paywall subscription={subscription} title="Подписка Deal Radar" onPaid={afterPayment} />
          </section>
        </div>
      ) : null}
      {settingsOpen ? <SettingsSheet settings={settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} resultCount={counts?.matched ?? deals.length} loading={loading || refreshing} /> : null}
    </main>
  );
}
