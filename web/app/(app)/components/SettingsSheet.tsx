"use client";

import { useEffect, useRef, useState } from "react";
import { CATEGORIES, CATEGORY_GROUPS } from "@/lib/categories";
import { DEFAULT_SETTINGS, PRICE_PRESETS, RADIUS_STEPS, radiusLabel, type SearchSettings, type UserLocation } from "@/lib/settings";
import { Icon } from "./ui";

type Suggestion = UserLocation & { province?: string | null; type?: string };

function numberOrNull(raw: string, min = 0): number | null {
  const value = Number(raw.replace(",", "."));
  return raw.trim() !== "" && Number.isFinite(value) && value >= min ? value : null;
}

export function LocationPicker({ value, onChange }: { value: UserLocation | null; onChange: (location: UserLocation | null) => void }) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState<"" | "gps" | "search">("");
  const [error, setError] = useState("");
  const timer = useRef<number | null>(null);
  const searchId = useRef(0);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    const term = query.trim();
    if (term.length < 2) { setSuggestions([]); return; }
    timer.current = window.setTimeout(async () => {
      const id = ++searchId.current;
      setBusy("search");
      try {
        const response = await fetch("/api/location?q=" + encodeURIComponent(term));
        const data = await response.json() as { suggestions?: Suggestion[]; error?: string };
        if (id !== searchId.current) return;
        if (!response.ok) throw new Error(data.error || "Поиск адреса недоступен");
        setSuggestions(data.suggestions || []);
        setError(data.suggestions?.length ? "" : "Ничего не найдено. Введите город или индекс (например, 3511 или 3511KE).");
      } catch (caught) {
        if (id === searchId.current) setError(caught instanceof Error ? caught.message : "Ошибка поиска адреса");
      } finally {
        if (id === searchId.current) setBusy("");
      }
    }, 350);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [query]);

  async function choose(item: Suggestion) {
    setSuggestions([]);
    setQuery("");
    let postcode = item.postcode;
    // A city centre needs a full postcode for Marktplaats radius search: resolve the nearest one.
    if (!postcode || postcode.length < 6) {
      try {
        const response = await fetch(`/api/location?lat=${item.lat}&lon=${item.lon}`);
        const data = await response.json() as { location?: UserLocation };
        postcode = data.location?.postcode || postcode;
      } catch { /* the coordinates alone still work for distance filtering */ }
    }
    onChange({ label: item.label, city: item.city, postcode, lat: item.lat, lon: item.lon, source: "manual" });
  }

  function useGps() {
    setError("");
    if (!("geolocation" in navigator)) { setError("Геолокация недоступна на этом устройстве — укажите город вручную."); return; }
    setBusy("gps");
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const response = await fetch(`/api/location?lat=${position.coords.latitude}&lon=${position.coords.longitude}`);
        const data = await response.json() as { location?: UserLocation; error?: string };
        if (!response.ok || !data.location) throw new Error(data.error || "Не удалось определить адрес");
        onChange(data.location);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Не удалось определить адрес");
      } finally {
        setBusy("");
      }
    }, (geoError) => {
      setBusy("");
      setError(geoError.code === geoError.PERMISSION_DENIED
        ? "Доступ к геолокации запрещён. Разрешите его в настройках или введите город вручную."
        : "Не удалось получить координаты. Введите город или индекс вручную.");
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 });
  }

  return (
    <div className="location-picker">
      {value ? (
        <div className="location-current">
          <Icon name="pin" size={18} />
          <div><strong>{value.label || value.city}</strong><small>{value.source === "gps" ? "по геолокации" : "указано вручную"}{value.postcode ? " · индекс " + value.postcode : ""}</small></div>
          <button type="button" className="link-button" onClick={() => onChange(null)}>Сбросить</button>
        </div>
      ) : <p className="settings-note">Локация не задана — поиск по всей стране, расстояние не учитывается.</p>}
      <div className="location-actions">
        <button type="button" className="secondary-button" onClick={useGps} disabled={busy === "gps"}><Icon name="target" size={18} />{busy === "gps" ? "Определяю…" : "Моя геолокация"}</button>
        <label className="search-box location-input">
          <span aria-hidden="true">⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Город или индекс" aria-label="Город или почтовый индекс" autoComplete="postal-code" />
        </label>
      </div>
      {busy === "search" ? <p className="settings-note">Ищу…</p> : null}
      {suggestions.length ? (
        <ul className="location-suggestions" role="listbox">
          {suggestions.map((item) => (
            <li key={item.label + item.lat}><button type="button" onClick={() => void choose(item)}>{item.label}<small>{item.type === "postcode" ? "индекс" : "населённый пункт"}{item.province ? " · " + item.province : ""}</small></button></li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="field-error" role="alert">{error}</p> : null}
    </div>
  );
}

export function SettingsSheet({ settings, onChange, onClose, resultCount, loading }: {
  settings: SearchSettings;
  onChange: (next: SearchSettings) => void;
  onClose: () => void;
  resultCount: number;
  loading: boolean;
}) {
  const [draftMin, setDraftMin] = useState(settings.minPrice?.toString() ?? "");
  const [draftMax, setDraftMax] = useState(settings.maxPrice?.toString() ?? "");
  const [draftRadius, setDraftRadius] = useState(settings.radiusKm?.toString() ?? "");
  useEffect(() => { setDraftMin(settings.minPrice?.toString() ?? ""); setDraftMax(settings.maxPrice?.toString() ?? ""); }, [settings.minPrice, settings.maxPrice]);
  useEffect(() => { setDraftRadius(settings.radiusKm?.toString() ?? ""); }, [settings.radiusKm]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (patch: Partial<SearchSettings>) => onChange({ ...settings, ...patch });
  const radiusIndex = Math.max(0, RADIUS_STEPS.indexOf(settings.radiusKm));
  const sliderIndex = RADIUS_STEPS.includes(settings.radiusKm) ? radiusIndex : RADIUS_STEPS.length - 1;
  const priceError = settings.minPrice !== null && settings.maxPrice !== null && settings.minPrice > settings.maxPrice;

  return (
    <div className="modal-backdrop sheet-backdrop" onClick={onClose}>
      <section className="settings-sheet" role="dialog" aria-modal="true" aria-label="Настройки поиска" onClick={(event) => event.stopPropagation()}>
        <header className="sheet-head">
          <h2>Настройки поиска</h2>
          <button type="button" className="modal-close static" onClick={onClose} aria-label="Закрыть">×</button>
        </header>
        <div className="sheet-body">
          <fieldset className="setting-block">
            <legend>Местоположение</legend>
            <LocationPicker value={settings.location} onChange={(location) => set({ location })} />
          </fieldset>

          <fieldset className="setting-block" disabled={!settings.location}>
            <legend>Радиус поиска · <b>{radiusLabel(settings.radiusKm)}</b></legend>
            {!settings.location ? <p className="settings-note">Сначала укажите местоположение — радиус считается от него.</p> : null}
            <input type="range" min={0} max={RADIUS_STEPS.length - 1} step={1} value={sliderIndex} aria-label="Радиус"
              onChange={(event) => set({ radiusKm: RADIUS_STEPS[Number(event.target.value)] })} className="radius-slider" />
            <div className="chip-row">
              {RADIUS_STEPS.map((step) => (
                <button type="button" key={String(step)} className={"discount-chip" + (settings.radiusKm === step ? " selected" : "")} onClick={() => set({ radiusKm: step })}>{radiusLabel(step)}</button>
              ))}
            </div>
            <label className="inline-field">Своё значение, км
              <input type="number" inputMode="numeric" min={1} max={400} value={draftRadius} placeholder="вся страна"
                onChange={(event) => setDraftRadius(event.target.value)}
                onBlur={() => set({ radiusKm: numberOrNull(draftRadius, 1) })} />
            </label>
          </fieldset>

          <fieldset className="setting-block">
            <legend>Цена</legend>
            <div className="chip-row">
              {PRICE_PRESETS.map((preset) => (
                <button type="button" key={preset.label}
                  className={"discount-chip" + (settings.minPrice === preset.min && settings.maxPrice === preset.max ? " selected" : "")}
                  onClick={() => set({ minPrice: preset.min, maxPrice: preset.max })}>{preset.label}</button>
              ))}
            </div>
            <div className="price-range">
              <label className="inline-field">от, €
                <input type="number" inputMode="decimal" min={0} value={draftMin} placeholder="без минимума"
                  onChange={(event) => setDraftMin(event.target.value)} onBlur={() => set({ minPrice: numberOrNull(draftMin) })} />
              </label>
              <label className="inline-field">до, €
                <input type="number" inputMode="decimal" min={0} value={draftMax} placeholder="без максимума"
                  onChange={(event) => setDraftMax(event.target.value)} onBlur={() => set({ maxPrice: numberOrNull(draftMax, 0.01) })} />
              </label>
            </div>
            <div className="toggle-row">
              <label><input type="checkbox" checked={settings.minPrice === null} onChange={(event) => { if (event.target.checked) set({ minPrice: null }); }} /> Без минимума</label>
              <label><input type="checkbox" checked={settings.maxPrice === null} onChange={(event) => { if (event.target.checked) set({ maxPrice: null }); }} /> Без максимума</label>
            </div>
            {priceError ? <p className="field-error">Минимальная цена больше максимальной — ничего не найдётся.</p> : null}
          </fieldset>

          <fieldset className="setting-block">
            <legend>Выгода</legend>
            <span className="filter-label">Минимальная скидка</span>
            <div className="chip-row">{[0, 10, 20, 30, 40, 50].map((step) => (
              <button type="button" key={step} className={"discount-chip" + (settings.minDiscount === step ? " selected" : "")} onClick={() => set({ minDiscount: step })}>{step ? "от " + step + "%" : "Любая"}</button>
            ))}</div>
            <div className="price-range">
              <label className="inline-field">Мин. прибыль, €
                <input type="number" inputMode="numeric" value={settings.minProfit ?? ""} placeholder="любая" onChange={(event) => set({ minProfit: numberOrNull(event.target.value, -100000) })} />
              </label>
              <label className="inline-field">Мин. ROI, %
                <input type="number" inputMode="numeric" value={settings.minRoi ?? ""} placeholder="любой" onChange={(event) => set({ minRoi: numberOrNull(event.target.value, -100) })} />
              </label>
            </div>
            <p className="settings-note">Фильтры по прибыли и ROI скрывают кандидатов, у которых прибыль ещё не рассчитана.</p>
          </fieldset>

          <fieldset className="setting-block">
            <legend>Товар</legend>
            <span className="filter-label">Состояние</span>
            <div className="seg compact">{([["all", "Новые и б/у"], ["used", "Только б/у"], ["new", "Только новые"]] as const).map(([key, label]) => (
              <button type="button" key={key} className={settings.condition === key ? "on" : ""} onClick={() => set({ condition: key })}>{label}</button>
            ))}</div>
            <label className="switch-row"><input type="checkbox" checked={settings.exactOnly} onChange={(event) => set({ exactOnly: event.target.checked })} />
              <span><b>Только точное совпадение модели</b><small>Скрыть объявления без распознанного поколения, памяти или размера</small></span></label>
            <span className="filter-label">Сортировка по умолчанию</span>
            <div className="seg compact">
              <button type="button" className={settings.priority === "profit" ? "on" : ""} onClick={() => set({ priority: "profit" })}>Прибыль важнее</button>
              <button type="button" className={settings.priority === "distance" ? "on" : ""} onClick={() => set({ priority: "distance" })}>Ближе важнее</button>
            </div>
          </fieldset>

          <fieldset className="setting-block">
            <legend>Категории · {settings.categories.length ? "выбрано " + settings.categories.length : "все"}</legend>
            {CATEGORY_GROUPS.map((group) => (
              <div className="v2-pick" key={group}>
                <span>{group}</span>
                <div>{CATEGORIES.filter((item) => item.group === group).map((item) => {
                  const active = settings.categories.includes(item.key);
                  return <button type="button" key={item.key} aria-pressed={active} className={"preference-chip" + (active ? " active" : "")}
                    onClick={() => set({ categories: active ? settings.categories.filter((key) => key !== item.key) : [...settings.categories, item.key] })}>{item.label}</button>;
                })}</div>
              </div>
            ))}
            {settings.categories.length ? <button type="button" className="link-button" onClick={() => set({ categories: [] })}>Показать все категории</button> : null}
          </fieldset>
        </div>
        <footer className="sheet-foot">
          <button type="button" className="secondary-button" onClick={() => onChange({ ...DEFAULT_SETTINGS, location: settings.location })}>Сбросить фильтры</button>
          <button type="button" className="primary-button" onClick={onClose}>{loading ? "Применяю…" : "Показать " + resultCount.toLocaleString("ru-RU")}</button>
        </footer>
        <p className="settings-note sheet-note">Настройки хранятся на этом устройстве. Сброс не удаляет избранное, объявления и историю сравнений.</p>
      </section>
    </div>
  );
}
