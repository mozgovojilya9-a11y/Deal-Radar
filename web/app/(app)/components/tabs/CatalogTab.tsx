"use client";

import { useMemo, useState } from "react";
import type { CatalogCounts, Deal } from "@/lib/deals";
import { categoryLabel, groupOf } from "@/lib/categories";
import { catalogMatcher } from "@/lib/catalog-search";
import { HISTORY_KEY, SAVED_KEY, addSavedSearch, isSaved, loadJson, readHistory, readSavedSearches, rememberQuery, removeSavedSearch, storeJson, type SavedSearch } from "@/lib/saved-searches";
import { DEFAULT_SETTINGS, type SearchSettings } from "@/lib/settings";
import { DealGrid } from "../DealGrid";
import { Icon, ageLabel, euro } from "../ui";

export type Tier = "all" | "strong" | "good" | "candidate";
export type Sort = "profit" | "score" | "distance" | "discount" | "newest" | "price";
export const SORTS: Array<[Sort, string]> = [["profit", "По прибыли"], ["score", "По баллу сделки"], ["distance", "Ближе ко мне"], ["discount", "По скидке"], ["newest", "Сначала новые"], ["price", "Сначала дешевле"]];

/** Catalogue view state kept by the page, so it survives switching tabs. */
export type CatalogFilters = { search: string; category: string; dropsOnly: boolean; tier: Tier };
export const NO_FILTERS: CatalogFilters = { search: "", category: "", dropsOnly: false, tier: "all" };

const inCategory = (deal: Deal, category: string) =>
  !category || (category.startsWith("group:") ? groupOf(deal.category_key) === category.slice(6) : deal.category_key === category);
const categoryName = (category: string) => category.startsWith("group:") ? category.slice(6) : categoryLabel(category);

export function CatalogTab({ deals, counts, scannedAt, lastLoaded, loading, refreshing, error, onReload, filters, onFilters, sort, onSort,
  settings, onSettings, activeCount, onOpenSettings, savedIds, newIds, onSave, onOpen }: {
  deals: Deal[]; counts: CatalogCounts | null; scannedAt: string | null; lastLoaded: number | null;
  loading: boolean; refreshing: boolean; error: string; onReload: (silent: boolean) => void;
  filters: CatalogFilters; onFilters: (patch: Partial<CatalogFilters>) => void; sort: Sort; onSort: (sort: Sort) => void;
  settings: SearchSettings; onSettings: (next: SearchSettings) => void; activeCount: number; onOpenSettings: () => void;
  savedIds: string[]; newIds: Set<string>; onSave: (id: string) => void; onOpen: (deal: Deal) => void;
}) {
  const { search, category, dropsOnly, tier } = filters;
  // This tab is mounted after hydration, so device storage can be read on the first render.
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>(() => typeof window === "undefined" ? [] : loadJson(SAVED_KEY, readSavedSearches));
  const [history, setHistory] = useState<string[]>(() => typeof window === "undefined" ? [] : loadJson(HISTORY_KEY, readHistory));
  const [focused, setFocused] = useState(false);

  const matchesSearch = useMemo(() => catalogMatcher(search), [search]);
  const visible = useMemo(() => deals.filter((deal) => inCategory(deal, category) && (!dropsOnly || deal.price_dropped_at) && matchesSearch(deal)),
    [deals, category, matchesSearch, dropsOnly]);
  const dropCount = useMemo(() => deals.filter((deal) => deal.price_dropped_at).length, [deals]);
  const byTier = useMemo(() => ({
    strong: visible.filter((deal) => deal.status === "strong"),
    good: visible.filter((deal) => deal.status === "good"),
    candidate: visible.filter((deal) => deal.status === "candidate"),
  }), [visible]);
  /** Profitable listings each saved search finds right now. */
  const savedCounts = useMemo(() => {
    const profitable = deals.filter((deal) => deal.status !== "candidate");
    return Object.fromEntries(savedSearches.map((item) => {
      const matches = catalogMatcher(item.text);
      return [item.id, profitable.filter((deal) => matches(deal) && (!item.dropsOnly || deal.price_dropped_at) && inCategory(deal, item.category)).length];
    }));
  }, [deals, savedSearches]);

  const current = { text: search.trim(), category, dropsOnly };
  const canSave = Boolean(current.text || category || dropsOnly) && !isSaved(savedSearches, current);
  const label = (item: Pick<SavedSearch, "text" | "category" | "dropsOnly">) =>
    [item.text, item.category ? categoryName(item.category) : "", item.dropsOnly ? "↓ цена" : ""].filter(Boolean).join(" · ");
  const scanAgeHours = scannedAt && lastLoaded ? (lastLoaded - new Date(scannedAt).getTime()) / 3_600_000 : null;
  const shown = tier === "all" ? null : byTier[tier];
  const listKey = [tier, category, search, sort, dropsOnly].join("|");
  const grid = (list: Deal[]) => <DealGrid deals={list} savedIds={savedIds} newIds={newIds} resetKey={listKey} onSave={onSave} onOpen={onOpen} />;

  function remember() {
    const next = rememberQuery(history, search);
    if (next !== history) { setHistory(next); storeJson(HISTORY_KEY, next); }
  }
  function changeSaved(next: SavedSearch[]) {
    setSavedSearches(next);
    storeJson(SAVED_KEY, next);
  }
  function apply(item: Pick<SavedSearch, "text" | "category" | "dropsOnly">) {
    onFilters({ search: item.text, category: item.category, dropsOnly: item.dropsOnly });
    setFocused(false);
  }

  return (
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
        <button className="refresh-button" onClick={() => onReload(true)} disabled={loading || refreshing} aria-label="Обновить каталог">
          <span className={loading || refreshing ? "spin" : ""} aria-hidden="true">↻</span>{refreshing ? "Обновляю" : "Обновить"}
        </button>
      </div>

      {scanAgeHours !== null && scanAgeHours > 3 ? <p className="v2-note stale-note"><span>Последнее сканирование было {Math.round(scanAgeHours)} ч назад — цены могли измениться.</span></p> : null}
      {error && deals.length ? <p className="v2-note error-note"><span>Не удалось обновить: {error}. Показаны последние загруженные данные.</span><button type="button" onClick={() => onReload(false)}>Повторить</button></p> : null}

      <div className="toolbar">
        <label className="search-box"><Icon name="search" size={18} /><input value={search} onChange={(event) => onFilters({ search: event.target.value })} onFocus={() => setFocused(true)}
          onBlur={() => { remember(); window.setTimeout(() => setFocused(false), 150); }}
          onKeyDown={(event) => { if (event.key === "Enter") { remember(); (event.target as HTMLInputElement).blur(); } }}
          enterKeyHint="search" placeholder="Модель на любом языке: «айфон 15», «ps5 slim»" aria-label="Поиск по находкам" />{search ? <button type="button" className="clear-input" onClick={() => onFilters({ search: "" })} aria-label="Очистить">×</button> : null}</label>
        <label className="sort-select"><span>Сортировка</span>
          <select value={sort} onChange={(event) => onSort(event.target.value as Sort)}>
            {SORTS.map(([key, name]) => <option key={key} value={key} disabled={key === "distance" && !settings.location}>{name}{key === "distance" && !settings.location ? " (укажите локацию)" : ""}</option>)}
          </select>
        </label>
        <button type="button" className={"filter-button" + (activeCount ? " active" : "")} onClick={onOpenSettings}><Icon name="sliders" size={18} />Фильтры{activeCount ? <b>{activeCount}</b> : null}</button>
      </div>

      {savedSearches.length || canSave || (focused && !search && history.length) ? (
        <div className="search-memory">
          {focused && !search && history.length ? (
            <div className="memory-row"><span>Недавние</span>
              {history.map((item) => <button type="button" key={item} className="memory-chip" onMouseDown={(event) => event.preventDefault()} onClick={() => apply({ text: item, category: "", dropsOnly: false })}>{item}</button>)}
              <button type="button" className="memory-clear" onMouseDown={(event) => event.preventDefault()} onClick={() => { setHistory([]); storeJson(HISTORY_KEY, []); }}>очистить</button>
            </div>
          ) : null}
          {savedSearches.length || canSave ? (
            <div className="memory-row"><span>Мои поиски</span>
              {savedSearches.map((item) => (
                <span key={item.id} className={"memory-chip saved" + (isSaved([item], current) ? " on" : "")}>
                  <button type="button" onClick={() => apply(item)}>★ {label(item)}{savedCounts[item.id] ? <b>{savedCounts[item.id]}</b> : null}</button>
                  <button type="button" className="memory-remove" aria-label={"Удалить поиск " + label(item)} onClick={() => changeSaved(removeSavedSearch(savedSearches, item.id))}>×</button>
                </span>
              ))}
              {canSave ? <button type="button" className="memory-chip save" onClick={() => { changeSaved(addSavedSearch(savedSearches, current)); remember(); }}>☆ Сохранить «{label(current)}»</button> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="active-chips">
        {dropCount || dropsOnly ? <button type="button" className={dropsOnly ? "chip-on" : "chip-toggle"} aria-pressed={dropsOnly} onClick={() => onFilters({ dropsOnly: !dropsOnly })}>↓ Цена снижена · {dropCount}</button> : null}
        {settings.location && settings.radiusKm !== null ? <button type="button" onClick={() => onSettings({ ...settings, radiusKm: null })}>≤ {settings.radiusKm} км от {settings.location.city || settings.location.label} ×</button> : null}
        {settings.minPrice !== null || settings.maxPrice !== null ? <button type="button" onClick={() => onSettings({ ...settings, minPrice: null, maxPrice: null })}>{settings.minPrice !== null ? "от " + euro(settings.minPrice) + " " : ""}{settings.maxPrice !== null ? "до " + euro(settings.maxPrice) : ""} ×</button> : null}
        {settings.minDiscount ? <button type="button" onClick={() => onSettings({ ...settings, minDiscount: 0 })}>скидка от {settings.minDiscount}% ×</button> : null}
        {settings.minProfit !== null ? <button type="button" onClick={() => onSettings({ ...settings, minProfit: null })}>прибыль от {euro(settings.minProfit)} ×</button> : null}
        {settings.minRoi !== null ? <button type="button" onClick={() => onSettings({ ...settings, minRoi: null })}>ROI от {settings.minRoi}% ×</button> : null}
        {settings.condition !== "all" ? <button type="button" onClick={() => onSettings({ ...settings, condition: "all" })}>{settings.condition === "new" ? "только новые" : "только б/у"} ×</button> : null}
        {settings.exactOnly ? <button type="button" onClick={() => onSettings({ ...settings, exactOnly: false })}>точная модель ×</button> : null}
        {settings.categories.length ? <button type="button" onClick={() => onSettings({ ...settings, categories: [] })}>{settings.categories.length === 1 ? categoryLabel(settings.categories[0]) : settings.categories.length + " категорий"} ×</button> : null}
        {category ? <button type="button" onClick={() => onFilters({ category: "" })}>{categoryName(category)} ×</button> : null}
      </div>
      {counts && (counts.unknownLocation > 0 || counts.outsideRadius > 0) ? (
        <p className="settings-note">Вне радиуса: {counts.outsideRadius.toLocaleString("ru-RU")}{counts.unknownLocation ? " · без координат (скрыты при радиусе): " + counts.unknownLocation.toLocaleString("ru-RU") : ""}</p>
      ) : null}

      <div className="seg" role="tablist" aria-label="Тип предложений">
        {([["all", "Выгодные", byTier.strong.length + byTier.good.length], ["strong", "Best", byTier.strong.length], ["good", "Good", byTier.good.length], ["candidate", "Ждут оценки", byTier.candidate.length]] as const).map(([key, name, count]) => (
          <button type="button" role="tab" aria-selected={tier === key} key={key} className={tier === key ? "on" : ""} onClick={() => onFilters({ tier: key })}>{name}<b>{count}</b></button>
        ))}
      </div>

      {error && !deals.length ? (
        <div className="state-panel error-panel"><div className="state-icon">!</div><h3>Каталог не загрузился</h3><p>{error}</p><button className="secondary-button" onClick={() => onReload(false)}>Попробовать снова</button></div>
      ) : loading && !deals.length ? (
        <div className="deal-grid">{Array.from({ length: 6 }).map((_, index) => <div className="skeleton-card" key={index}><div /><span /><span /><span /></div>)}</div>
      ) : !visible.length ? (
        <div className="state-panel"><div className="state-icon">⌁</div><h3>Ничего не подходит</h3>
          <p>{counts?.feed ? "В каталоге " + counts.feed.toLocaleString("ru-RU") + " выгодных предложений, но они не проходят текущие фильтры." : "Подтверждённо выгодных предложений сейчас нет. Здесь появятся только те, где прибыль подтверждена независимыми ценами."}</p>
          {activeCount || category || search || dropsOnly ? <button className="secondary-button" onClick={() => { onFilters({ search: "", category: "", dropsOnly: false }); onSettings({ ...DEFAULT_SETTINGS, location: settings.location }); }}>Сбросить фильтры</button> : null}
        </div>
      ) : shown ? (shown.length ? grid(shown) : <p className="tier-empty">В этой группе сейчас пусто.</p>) : (
        <div className="deal-tiers">
          {byTier.strong.length ? <section className="deal-tier strong-tier"><div className="tier-heading"><h3>Best deals<span>{byTier.strong.length}</span></h3><p>Высокая уверенность: независимые цены с ≥2 площадок, прибыль после всех расходов</p></div>{grid(byTier.strong)}</section> : null}
          {byTier.good.length ? <section className="deal-tier good-tier"><div className="tier-heading"><h3>Good deals<span>{byTier.good.length}</span></h3><p>Подтверждённая прибыль, уверенность средняя или запас меньше</p></div>{grid(byTier.good)}</section> : null}
          {!byTier.strong.length && !byTier.good.length ? <p className="tier-empty">Подтверждённо выгодных предложений сейчас нет. Объявления без рыночной цены — во вкладке «Ждут оценки».</p> : null}
        </div>
      )}
    </section>
  );
}
