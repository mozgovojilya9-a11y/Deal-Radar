"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { AdvisorReport, SourceRef } from "@/lib/advisor";
import type { Deal } from "@/lib/deals";
import { euro, pct } from "./ui";

type Message = { role: "user" | "model"; text: string; report?: AdvisorReport };

const SUGGESTIONS = ["Сколько стоит этот товар?", "Стоит ли покупать за эту цену?", "Что проверить при осмотре?"];

/**
 * Temporary, per-listing chat. The parent mounts it with key={listing_id}, so switching or
 * closing a listing destroys this state. Nothing is written to storage or a database.
 */
export function ProductAdvisor({ deal }: { deal: Deal }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const sessionId = useRef(deal.listing_id + ":" + Math.random().toString(36).slice(2));
  const controller = useRef<AbortController | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      // Late answers for this listing must never reach another product's chat.
      alive.current = false;
      controller.current?.abort();
    };
  }, []);

  async function ask(question: string, event?: FormEvent) {
    event?.preventDefault();
    const text = question.trim();
    if (!text || loading) return;
    const initData = window.Telegram?.WebApp?.initData || "";
    if (!initData) { setError("Открой приложение внутри Telegram, чтобы задать вопрос AI."); return; }
    const history = [...messages, { role: "user" as const, text }];
    setMessages(history);
    setInput("");
    setError("");
    setLoading(true);
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    const session = sessionId.current;
    try {
      const response = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: request.signal,
        body: JSON.stringify({
          initData, sessionId: session,
          product: {
            listingId: deal.listing_id, title: deal.title, description: deal.description || "", price: deal.price,
            priceType: deal.price_type || "FIXED", marketPrice: deal.market_value ?? deal.market_price, marketMedian: deal.used_price ?? deal.market_median_price ?? null,
            newPrice: deal.new_price ?? null, marketSamples: deal.market_samples ?? 0, marketConfidence: deal.market_confidence ?? "none",
            priceReferenceType: deal.price_reference_type ?? "insufficient_data", marketUpdatedAt: deal.market_checked_at || deal.evaluated_at || null,
            marketSources: (deal.market_sources || []).slice(0, 12).map((source) => ({
              title: source.title, url: source.url, price: source.price ?? source.price_eur ?? null,
              condition: source.item_condition || source.condition || "used", domain: source.domain || "",
            })),
            category: deal.category_label, modelGroup: deal.model_group, city: deal.city || "", itemCondition: deal.item_condition || null,
            warningFlags: deal.warning_flags || [], listingUrl: deal.listing_url,
          },
          messages: history.map((message) => ({ role: message.role, text: message.role === "model" ? summary(message) : message.text })),
        }),
      });
      const data = await response.json() as { error?: string; report?: AdvisorReport; listingId?: string; sessionId?: string };
      if (!alive.current || data.sessionId !== session || data.listingId !== deal.listing_id) return;
      if (!response.ok || !data.report) throw new Error(data.error || "AI временно недоступен.");
      setMessages((current) => [...current, { role: "model", text: data.report!.lead, report: data.report }]);
    } catch (caught) {
      if (!alive.current || (caught instanceof DOMException && caught.name === "AbortError")) return;
      setError(caught instanceof Error ? caught.message : "Не удалось отправить вопрос.");
    } finally {
      if (alive.current && controller.current === request) setLoading(false);
    }
  }

  return (
    <section className="product-advisor" aria-label="AI-консультант по этому товару">
      <div className="advisor-heading">
        <div><span className="advisor-status-dot" /><strong>AI-консультант</strong></div>
        <small>Временный чат только для этого объявления</small>
      </div>
      {!messages.length ? (
        <div className="advisor-suggestions">
          {SUGGESTIONS.map((question) => <button type="button" key={question} onClick={() => void ask(question)} disabled={loading}>{question}</button>)}
        </div>
      ) : null}
      <div className="advisor-thread" aria-live="polite">
        {messages.map((message, index) => message.role === "user"
          ? <div className="advisor-message user" key={index}><p>{message.text}</p></div>
          : <AdvisorAnswer key={index} report={message.report!} asking={deal.price} />)}
        {loading ? <div className="advisor-thinking"><span /><span /><span /> Ищу цены в магазинах и на площадках…</div> : null}
      </div>
      {error ? <p className="advisor-error" role="alert">{error}</p> : null}
      <form className="advisor-form" onSubmit={(event) => void ask(input, event)}>
        <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Вопрос об этом товаре…" maxLength={700} disabled={loading} aria-label="Вопрос AI" />
        <button type="submit" disabled={loading || !input.trim()} aria-label="Отправить вопрос">↑</button>
      </form>
    </section>
  );
}

function summary(message: Message): string {
  const report = message.report;
  if (!report) return message.text;
  return [report.lead, report.verdict.label + ": " + report.verdict.reason, report.answer].filter(Boolean).join(" ").slice(0, 700);
}

function Cite({ ids, sources }: { ids: number[]; sources: SourceRef[] }) {
  const items = ids.map((id) => sources.find((source) => source.id === id)).filter((source): source is SourceRef => Boolean(source));
  if (!items.length) return null;
  return <span className="advisor-cites">{items.slice(0, 4).map((source) => (
    <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer" title={source.title}>[{source.id}]</a>
  ))}</span>;
}

function withCitations(text: string, sources: SourceRef[]) {
  return text.split(/(\[\d+\])/g).map((part, index) => {
    const match = /^\[(\d+)\]$/.exec(part);
    const source = match ? sources.find((item) => item.id === Number(match[1])) : null;
    return source ? <a key={index} href={source.url} target="_blank" rel="noopener noreferrer" className="advisor-cite">[{source.id}]</a> : <span key={index}>{part}</span>;
  });
}

const SEGMENT_LABEL: Record<string, string> = { new: "новый", used: "б/у (независимый)", refurbished: "восстановленный", deal_radar: "источник оценки сканера" };

function AdvisorAnswer({ report, asking }: { report: AdvisorReport; asking: number }) {
  const verdictClass = "verdict-" + report.verdict.decision;
  const rows: Array<{ label: string; value: string; note: string; ids: number[] }> = [];
  if (report.newPrice) rows.push({ label: "Новая цена", value: euro(report.newPrice.headline, true), note: report.newPrice.note, ids: report.newPrice.sourceIds });
  if (report.usedPrice) rows.push({ label: "Цена б/у", value: euro(report.usedPrice.median, true) + (report.usedPrice.min != null ? " · от " + euro(report.usedPrice.min, true) : ""), note: report.usedPrice.note, ids: report.usedPrice.sourceIds });
  if (report.refurbished) rows.push({ label: "Восстановленный", value: "от " + euro(report.refurbished.headline, true), note: report.refurbished.note, ids: report.refurbished.sourceIds });
  if (report.estimate) rows.push({
    label: "Оценка сканера", value: euro(report.estimate.amount, true),
    note: report.estimate.samples + " независимых предложений · уверенность " + report.estimate.confidenceLabel + " · " + report.estimate.referenceLabel
      + (report.estimate.updatedAt ? " · проверено " + report.estimate.updatedAt.slice(0, 10) : "")
      + (report.estimate.median ? " · медиана " + euro(report.estimate.median, true) : ""),
    ids: report.estimate.sourceIds,
  });
  if (report.marketplace) rows.push({ label: "Marktplaats (контекст)", value: "≈ " + euro(report.marketplace.median, true), note: report.marketplace.count + " объявлений · " + report.marketplace.note, ids: [] });
  return (
    <div className="advisor-message model advisor-report">
      <p className="advisor-lead">{report.lead}</p>
      <div className={"advisor-verdict " + verdictClass}><b>{report.verdict.label}</b><span>{report.verdict.reason}</span></div>
      {report.answer ? <p className="advisor-answer">{withCitations(report.answer, report.sources)}</p> : null}
      {rows.length ? (
        <dl className="advisor-facts">
          {rows.map((row) => (
            <div key={row.label}><dt>{row.label}</dt><dd><strong>{row.value}</strong><Cite ids={row.ids} sources={report.sources} /><small>{row.note}</small></dd></div>
          ))}
          {report.profit ? (
            <div><dt>Прибыль</dt><dd>
              <strong className={report.profit.amount >= 0 ? "profit-plus" : "profit-minus"}>{euro(report.profit.amount, true)} · ROI {pct(report.profit.roi)}</strong>
              <small>Продажа {euro(report.profit.expectedResale, true)} − торг {euro(report.profit.costs.negotiation, true)} − комиссия {euro(report.profit.costs.fees, true)} − расходы {euro(report.profit.costs.fixed, true)} − покупка {euro(asking, true)}. База: {report.profit.basisLabel}.</small>
            </dd></div>
          ) : null}
        </dl>
      ) : <p className="advisor-muted">Подтверждённых цен для этой модели сейчас не найдено — прибыль не рассчитывается.</p>}
      {report.risks.length ? <ul className="advisor-risks">{report.risks.map((risk) => <li key={risk}>{risk}</li>)}</ul> : null}
      {report.sources.length ? (
        <details className="advisor-sources">
          <summary>Источники · {report.sources.length}</summary>
          <ol>{report.sources.map((source) => (
            <li key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer">
              <span>[{source.id}] {source.title}</span>
              <b>{source.price != null ? euro(source.price, true) : ""}</b>
              <small>{source.domain} · {SEGMENT_LABEL[source.segment] || source.segment}{source.note ? " · " + source.note : ""}</small>
            </a></li>
          ))}</ol>
        </details>
      ) : null}
      <p className="advisor-search-meta">
        Поиск: {report.search.providers.length ? report.search.providers.join(", ") : "поисковики недоступны"}
        {report.search.failedProviders.length ? " (недоступны: " + report.search.failedProviders.join(", ") + ")" : ""}
        {" · страниц открыто " + report.search.pagesFetched + ", с ценами " + report.search.pagesWithPrices}
        {" · Marktplaats (только контекст): " + report.search.marketplaceOffers}
        {report.search.rejected.variants || report.search.rejected.accessories ? " · отброшено: другие версии " + report.search.rejected.variants + ", аксессуары " + report.search.rejected.accessories : ""}
        {report.ai.note ? " · " + report.ai.note : ""}
      </p>
    </div>
  );
}
