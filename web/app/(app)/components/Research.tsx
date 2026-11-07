"use client";

import { useRef, useState } from "react";
import type { MarketValuation, SegmentStats } from "@/lib/market-research";
import type { SearchSettings } from "@/lib/settings";
import { radiusLabel } from "@/lib/settings";
import { euro, pct } from "./ui";

type Offer = { id: number; title: string; price: number; url: string; domain: string; segment: "new" | "used" | "refurbished"; city?: string; distanceKm?: number | null; itemCondition?: string | null; official?: boolean; estimatedProfit?: number | null; profitRoi?: number | null; status?: string };
type Result = {
  query: string; checkedAt: string; durationMs: number;
  identity: { searchName: string; aliases: string[]; modelCodes: string[] };
  location: { postcode: string; radiusKm: number } | null;
  segments: { new: SegmentStats; used: SegmentStats; refurbished: SegmentStats };
  resale: { basis: number; basisLabel: string } | null;
  valuation: MarketValuation;
  marketplace: SegmentStats;
  listings: Offer[]; offers: Offer[];
  rejected: { variants: number; accessories: number; mismatches: number; outliers: number };
  variantExamples: Array<{ title: string; price: number; url: string; reason: string }>;
  search: { queries: string[]; providers: string[]; failedProviders: string[]; pagesFetched: number; pagesWithPrices: number };
  warnings: string[];
};

const SEGMENTS = [["new", "Новые (магазины)"], ["used", "Б/у (вне Marktplaats)"], ["refurbished", "Восстановленные"]] as const;
const CONF: Record<string, string> = { high: "высокая", medium: "средняя", low: "низкая", none: "нет данных" };

export function Research({ settings }: { settings: SearchSettings }) {
  const [query, setQuery] = useState("");
  const [include, setInclude] = useState({ new: true, used: true, refurbished: true });
  const [useLocation, setUseLocation] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const requestId = useRef(0);
  const location = settings.location?.postcode && settings.radiusKm ? { postcode: settings.location.postcode, radiusKm: settings.radiusKm } : null;

  async function run() {
    const text = query.trim();
    if (text.length < 3) { setError("Укажите модель, например «Sony WH-1000XM5» или «iPhone 15 Pro 256GB»."); return; }
    const initData = window.Telegram?.WebApp?.initData || "";
    if (!initData) { setError("Откройте приложение внутри Telegram, чтобы запустить исследование."); return; }
    const id = ++requestId.current;
    setLoading(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/research", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData, query: text, includeNew: include.new, includeUsed: include.used, includeRefurbished: include.refurbished,
          minPrice: settings.minPrice, maxPrice: settings.maxPrice,
          postcode: useLocation && location ? location.postcode : null, radiusKm: useLocation && location ? location.radiusKm : null,
        }),
      });
      const data = await response.json();
      if (id !== requestId.current) return;
      if (!response.ok) throw new Error(data.error || "Исследование не удалось.");
      setResult(data as Result);
    } catch (caught) {
      if (id === requestId.current) setError(caught instanceof Error ? caught.message : "Ошибка исследования.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  return (
    <div className="research-card">
      <div className="research-head"><div><h3>Анализ любой модели</h3><p>Реальные объявления Marktplaats и 2dehands, цены магазинов и восстановленных товаров — отдельно по каждому сегменту.</p></div></div>
      <form className="research-form" onSubmit={(event) => { event.preventDefault(); void run(); }}>
        <label className="research-query"><span>Модель</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Например: PlayStation 5 Slim Disc" maxLength={120} /></label>
        <fieldset className="research-condition"><legend>Сегменты</legend>
          {SEGMENTS.map(([key, label]) => (
            <label key={key}><input type="checkbox" checked={include[key]} onChange={(event) => setInclude({ ...include, [key]: event.target.checked })} /> {label}</label>
          ))}
        </fieldset>
        <p className="settings-note">
          Цена: {settings.minPrice != null || settings.maxPrice != null ? (settings.minPrice != null ? "от " + euro(settings.minPrice) + " " : "") + (settings.maxPrice != null ? "до " + euro(settings.maxPrice) : "") : "без ограничений"}
          {" · "}
          {location ? <label className="inline-check"><input type="checkbox" checked={useLocation} onChange={(event) => setUseLocation(event.target.checked)} /> Marktplaats в радиусе {radiusLabel(location.radiusKm)} от {location.postcode}</label> : "Marktplaats по всей стране (локация не задана в настройках)"}
        </p>
        <button type="submit" className="primary-button research-submit" disabled={loading || (!include.new && !include.used && !include.refurbished)}>{loading ? "Ищу по магазинам и площадкам…" : "Найти цены"}</button>
      </form>
      {error ? <p className="research-error" role="alert">{error}</p> : null}
      {loading ? <div className="research-loading"><span className="research-pulse" />Открываю страницы магазинов и объявления — обычно 10–40 секунд</div> : null}
      {result ? (
        <div className="research-report">
          <p className="research-muted">Модель: <b>{result.identity.searchName}</b>{result.identity.modelCodes.length ? " · артикул " + result.identity.modelCodes.join(", ").toUpperCase() : ""}{result.location ? " · Marktplaats: " + result.location.radiusKm + " км от " + result.location.postcode : ""}</p>
          <div className="research-summary-grid">
            {SEGMENTS.map(([key, label]) => {
              const stats = result.segments[key];
              return <div key={key}><small>{label}</small><strong>{stats.count ? euro(key === "used" ? stats.median : stats.min, true) : "—"}</strong>
                <span>{stats.count ? (key === "used" ? "медиана, " : "минимум, ") + stats.count + " предл. · " + stats.domains.slice(0, 3).join(", ") : "не найдено"}</span></div>;
            })}
          </div>
          <div className="why-box">
            <b>Рыночная стоимость: {result.valuation.marketValue != null ? euro(result.valuation.marketValue, true) : "не определена"}</b>
            <p>{result.valuation.reason} · надёжность {CONF[result.valuation.confidence]} · независимых источников {result.valuation.sourceCount} на {result.valuation.domainCount} сайтах · проверено {new Date(result.valuation.checkedAt).toLocaleString("ru-RU")}</p>
            {result.marketplace.count ? <p>Marktplaats/2dehands сейчас: медиана {euro(result.marketplace.median, true)} по {result.marketplace.count} объявлениям — только для сравнения, в оценку не входит.</p> : null}
          </div>
          {result.resale ? <p className="research-muted">База перепродажи: {euro(result.resale.basis, true)} ({result.resale.basisLabel}); прибыль ниже — после торга, комиссии 8% и €10 расходов.</p> : null}
          <h4>Объявления Marktplaats, которые можно купить · {result.listings.length}</h4>
          {result.listings.length ? <div className="research-offers">{result.listings.slice(0, 12).map((item) => (
            <a className="research-offer" href={item.url} target="_blank" rel="noopener noreferrer" key={item.url}>
              <span><b>{item.title}</b><small>{[item.domain, item.itemCondition, item.city, item.distanceKm != null ? item.distanceKm + " км" : ""].filter(Boolean).join(" · ")}</small></span>
              <strong>{euro(item.price, true)}</strong>
              <em className={item.status === "strong" ? "profit-strong" : item.status === "good" ? "profit-good" : ""}>{item.estimatedProfit == null ? "нет базы" : (item.estimatedProfit >= 0 ? "+" : "") + euro(item.estimatedProfit) + " · " + pct(item.profitRoi)}</em>
            </a>
          ))}</div> : <p className="research-muted">Точных объявлений в выбранном диапазоне нет.</p>}
          <h4>Независимые источники цены · {result.offers.length}</h4>
          {result.offers.length ? <div className="research-web-links">{result.offers.slice(0, 14).map((item) => (
            <a href={item.url} target="_blank" rel="noopener noreferrer" key={item.url + item.price}><span>{item.title}</span><b>{euro(item.price, true)}</b>
              <small>{item.domain} · {item.segment === "new" ? "новый" : item.segment === "refurbished" ? "восстановленный" : "б/у"}{item.official ? " · официальный" : ""} · проверено {new Date(result.checkedAt).toLocaleDateString("ru-RU")}</small></a>
          ))}</div> : <p className="research-muted">Страницы магазинов с ценой точной модели не найдены.</p>}
          {result.variantExamples.length ? (
            <details className="source-list"><summary>Не смешаны с этой моделью · {result.rejected.variants} других версий, {result.rejected.accessories} аксессуаров</summary>
              <ul>{result.variantExamples.map((item) => <li key={item.url}><a href={item.url} target="_blank" rel="noopener noreferrer"><span>{item.title}</span><b>{euro(item.price, true)}</b><small>{item.reason}</small></a></li>)}</ul>
            </details>
          ) : null}
          <p className="advisor-search-meta">Поиск: {result.search.providers.join(", ") || "поисковики недоступны"}{result.search.failedProviders.length ? " (недоступны: " + result.search.failedProviders.join(", ") + ")" : ""} · страниц {result.search.pagesFetched}, с ценами {result.search.pagesWithPrices} · {Math.round(result.durationMs / 1000)} с</p>
          {result.warnings.map((warning) => <p className="research-warning" key={warning}>ⓘ {warning}</p>)}
        </div>
      ) : null}
    </div>
  );
}
