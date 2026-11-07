import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReport, detectIntent, parseDealContext, stripUnsupportedAmounts } from "../lib/advisor";
import { buildIdentity } from "../lib/product-identity";
import { computeValuation, type MarketResearch } from "../lib/market-research";

const context = parseDealContext({
  listingId: "m2457352877", title: "Ray-Ban Wayfarer Gen 2 Smartbril - Nieuw", price: 150, marketPrice: 295, marketMedian: 324.99,
  marketSamples: 15, marketConfidence: "high", priceReferenceType: "external_used", listingUrl: "https://www.marktplaats.nl/v/x/m2457352877",
  marketSources: [{ title: "Ray-Ban Meta Gen 2", url: "https://www.kleinanzeigen.de/s-anzeige/m1", price: 290, condition: "used" },
    { title: "Old Marktplaats comparable", url: "https://www.marktplaats.nl/v/x/m2", price: 280, condition: "used" }],
})!;

function research(offers: MarketResearch["offers"]): MarketResearch {
  const stats = (segment: string) => {
    const prices = offers.filter((offer) => offer.segment === segment).map((offer) => offer.price).sort((a, b) => a - b);
    return { count: prices.length, min: prices[0] ?? null, p25: prices[Math.floor((prices.length - 1) * 0.25)] ?? null, median: prices[Math.floor((prices.length - 1) / 2)] ?? null, max: prices.at(-1) ?? null, domains: [...new Set(offers.filter((o) => o.segment === segment).map((o) => o.domain))], official: offers.find((o) => o.segment === segment && o.official) || null };
  };
  return { identity: buildIdentity(context.title), checkedAt: "2026-11-07T00:00:00Z", durationMs: 1, offers,
    segments: { new: stats("new"), used: stats("used"), refurbished: stats("refurbished") },
    rejected: { variants: 0, accessories: 0, mismatches: 0, outliers: 0 }, variantExamples: [], queries: [], attempts: [], providersUsed: ["DuckDuckGo"],
    pagesFetched: 1, pagesWithPrices: 1, pageLog: [], errors: [],
    marketplace: { offers: [], stats: { count: 0, min: null, p25: null, median: null, max: null, domains: [], official: null } },
    valuation: computeValuation(offers, { new: stats("new"), used: stats("used"), refurbished: stats("refurbished") }, "2026-11-07T00:00:00Z"), sourceHealth: {} };
}
const offer = (id: number, price: number, segment: "new" | "used" | "refurbished", domain: string) => ({ id, title: "Ray-Ban Meta Wayfarer Gen 2", price, url: `https://${domain}/p${id}`, domain, segment, match: "exact" as const, matchReason: "", method: "jsonld" as const, official: false, availability: "in_stock" as const });

test("price questions are answered with amounts first and keep segments separate", () => {
  const report = buildReport(context, research([offer(1, 419, "new", "pearle.nl"), offer(2, 343.5, "new", "supersales.nl"), offer(3, 300, "used", "kleinanzeigen.de"), offer(4, 280, "used", "backmarket.nl"), offer(5, 289, "refurbished", "refurbed.nl")]), "price");
  assert.match(report.lead, /^Новый €\s343,50/);
  assert.equal(report.newPrice?.count, 2);
  assert.equal(report.usedPrice?.count, 2);
  assert.equal(report.refurbished?.count, 1);
  // The scanner estimate is used, never replaced by "price unknown".
  assert.equal(report.estimate?.amount, 295);
  assert.equal(report.estimate?.samples, 15);
  assert.equal(report.profit?.amount, 87.52);
  assert.ok(report.sources.some((source) => source.segment === "deal_radar" && source.url.endsWith("/m1")));
  // Marktplaats links are never presented as evidence of market value.
  assert.ok(!report.sources.some((source) => source.url.includes("marktplaats.nl")));
});

test("an estimate from the database is shown even when the web returns nothing", () => {
  const report = buildReport(context, research([]), "price");
  assert.equal(report.estimate?.amount, 295);
  // Reliable scanner estimate (15 comparables, high confidence) and €87.52 profit: a buy.
  assert.equal(report.verdict.decision, "buy");
  assert.equal(report.profit?.basisLabel.startsWith("независимая оценка сканера"), true);
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

test("a legacy Marktplaats-based estimate is not used as market value", () => {
  const legacy = parseDealContext({ title: "Ray-Ban Wayfarer Gen 2", price: 150, marketPrice: 295, marketSamples: 15, marketConfidence: "high", priceReferenceType: "marktplaats" })!;
  const report = buildReport(legacy, research([]), "price");
  assert.equal(report.estimate, null);
  assert.equal(report.profit, null);
  assert.equal(report.verdict.decision, "unknown");
});

test("valuation ignores marketplace domains and needs three independent used offers", () => {
  const offers = [offer(1, 300, "used", "kleinanzeigen.de"), offer(2, 320, "used", "kleinanzeigen.de"), offer(3, 900, "used", "marktplaats.nl")];
  const two = computeValuation(offers, research(offers).segments, "t");
  assert.equal(two.marketValue, null);
  assert.equal(two.confidence, "low");
  const three = [...offers, offer(4, 340, "used", "backmarket.nl")];
  assert.equal(computeValuation(three, research(three).segments, "t").marketValue, 320);
});

test("intent detection", () => {
  assert.equal(detectIntent("Сколько стоит этот товар?"), "price");
  assert.equal(detectIntent("Стоит ли покупать?"), "buy");
  assert.equal(detectIntent("Что проверить при осмотре?"), "inspect");
});

test("a question about Amazon is answered with the Amazon price first", () => {
  const offers = [offer(1, 389, "new", "amazon.nl"), offer(2, 419, "new", "coolblue.nl"), offer(3, 300, "used", "kleinanzeigen.de")];
  const report = buildReport(context, research(offers), "price", "Сколько стоит на Amazon?");
  assert.match(report.lead, /^Amazon: €\s389/);
  assert.equal(report.shops[0].found, true);
  assert.ok(report.sources.some((source) => source.domain === "amazon.nl" && source.price === 389));
});

test("when Amazon has no verified price the answer says so instead of showing Marktplaats", () => {
  const report = buildReport(context, research([offer(1, 419, "new", "coolblue.nl")]), "price", "цена на амазон?");
  assert.match(report.lead, /^Amazon: цена не найдена/);
  assert.equal(report.shops[0].found, false);
  assert.match(report.shops[0].note, /не найдена/);
});
