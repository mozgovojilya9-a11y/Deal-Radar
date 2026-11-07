import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReport, detectIntent, parseDealContext, stripUnsupportedAmounts } from "../lib/advisor";
import { buildIdentity } from "../lib/product-identity";
import type { MarketResearch } from "../lib/market-research";

const context = parseDealContext({
  listingId: "m2457352877", title: "Ray-Ban Wayfarer Gen 2 Smartbril - Nieuw", price: 150, marketPrice: 295, marketMedian: 324.99,
  marketSamples: 15, marketConfidence: "high", priceReferenceType: "marktplaats", listingUrl: "https://www.marktplaats.nl/v/x/m2457352877",
  marketSources: [{ title: "Ray-Ban Meta Gen 2", url: "https://www.marktplaats.nl/v/x/m1", price: 290, condition: "Zo goed als nieuw" }],
})!;

function research(offers: MarketResearch["offers"]): MarketResearch {
  const stats = (segment: string) => {
    const prices = offers.filter((offer) => offer.segment === segment).map((offer) => offer.price).sort((a, b) => a - b);
    return { count: prices.length, min: prices[0] ?? null, p25: prices[Math.floor((prices.length - 1) * 0.25)] ?? null, median: prices[Math.floor((prices.length - 1) / 2)] ?? null, max: prices.at(-1) ?? null, domains: [...new Set(offers.filter((o) => o.segment === segment).map((o) => o.domain))], official: offers.find((o) => o.segment === segment && o.official) || null };
  };
  return { identity: buildIdentity(context.title), checkedAt: "2026-11-07T00:00:00Z", durationMs: 1, offers,
    segments: { new: stats("new"), used: stats("used"), refurbished: stats("refurbished") },
    rejected: { variants: 0, accessories: 0, mismatches: 0, outliers: 0 }, variantExamples: [], queries: [], attempts: [], providersUsed: ["DuckDuckGo"],
    pagesFetched: 1, pagesWithPrices: 1, pageLog: [], errors: [] };
}
const offer = (id: number, price: number, segment: "new" | "used" | "refurbished", domain: string) => ({ id, title: "Ray-Ban Meta Wayfarer Gen 2", price, url: `https://${domain}/p${id}`, domain, segment, match: "exact" as const, matchReason: "", method: "jsonld" as const, official: false, availability: "in_stock" as const });

test("price questions are answered with amounts first and keep segments separate", () => {
  const report = buildReport(context, research([offer(1, 419, "new", "pearle.nl"), offer(2, 343.5, "new", "supersales.nl"), offer(3, 300, "used", "marktplaats.nl"), offer(4, 280, "used", "marktplaats.nl"), offer(5, 289, "refurbished", "refurbed.nl")]), "price");
  assert.match(report.lead, /^Новый €\s343,50/);
  assert.equal(report.newPrice?.count, 2);
  assert.equal(report.usedPrice?.count, 2);
  assert.equal(report.refurbished?.count, 1);
  // The scanner estimate is used, never replaced by "price unknown".
  assert.equal(report.estimate?.amount, 295);
  assert.equal(report.estimate?.samples, 15);
  assert.equal(report.profit?.amount, 87.52);
  assert.ok(report.sources.some((source) => source.segment === "deal_radar" && source.url.endsWith("/m1")));
});

test("an estimate from the database is shown even when the web returns nothing", () => {
  const report = buildReport(context, research([]), "price");
  assert.equal(report.estimate?.amount, 295);
  // Reliable scanner estimate (15 comparables, high confidence) and €87.52 profit: a buy.
  assert.equal(report.verdict.decision, "buy");
  assert.equal(report.profit?.basisLabel.startsWith("оценка Deal Radar"), true);
});

test("AI text with amounts not present in the data is removed", () => {
  const allowed = [150, 295, 419];
  const cleaned = stripUnsupportedAmounts("Новая цена €419 [1]. Обычно продают за €260. Оценка Deal Radar €295.", allowed);
  assert.equal(cleaned, "Новая цена €419 [1]. Оценка Deal Radar €295.");
});

test("a price far below the live used market triggers an authenticity risk and a cautious verdict", () => {
  const offers = [300, 340, 350, 360, 380].map((price, index) => offer(index + 1, price, "used", "marktplaats.nl"));
  const report = buildReport(context, research(offers), "buy");
  assert.equal(report.verdict.decision, "consider");
  assert.ok(report.risks.some((risk) => /ниже рынка/.test(risk)));
});

test("intent detection", () => {
  assert.equal(detectIntent("Сколько стоит этот товар?"), "price");
  assert.equal(detectIntent("Стоит ли покупать?"), "buy");
  assert.equal(detectIntent("Что проверить при осмотре?"), "inspect");
});
