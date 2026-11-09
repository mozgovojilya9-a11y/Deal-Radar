import { extractPage, textPrices, type ExtractedOffer, type OfferCondition } from "./price-extract";
import { buildIdentity, matchProduct, type MatchLevel, type ProductIdentity } from "./product-identity";
import { providerNames, safeWebUrl, searchWithFailover, type SearchAttempt, type SearchResult } from "./web-search";
import { groundedMarketOffers } from "./grounded-search";
import { domainMatchesShop } from "./shops";

export type Segment = "new" | "used" | "refurbished";

export type MarketOffer = {
  id: number;
  title: string;
  price: number;
  url: string;
  domain: string;
  segment: Segment;
  match: MatchLevel;
  matchReason: string;
  method: ExtractedOffer["method"] | "api" | "grounding";
  official: boolean;
  availability: ExtractedOffer["availability"];
  city?: string;
  distanceKm?: number | null;
  postedAt?: string | null;
  itemCondition?: string | null;
  priceType?: string | null;
  imageUrl?: string | null;
};

export type SegmentStats = {
  count: number;
  min: number | null;
  p25: number | null;
  median: number | null;
  max: number | null;
  domains: string[];
  official: MarketOffer | null;
};

export type MarketValuation = {
  /** Realistic market value of a used unit, from independent non-Marktplaats offers only. */
  marketValue: number | null;
  /** Conservative resale reference (lower quartile when the sample is large). */
  conservativeValue: number | null;
  usedValue: number | null;
  newValue: number | null;
  refurbishedValue: number | null;
  confidence: "high" | "medium" | "low" | "none";
  sourceCount: number;
  domainCount: number;
  spread: number | null;
  checkedAt: string;
  reason: string;
};

export type MarketResearch = {
  identity: ProductIdentity;
  checkedAt: string;
  durationMs: number;
  offers: MarketOffer[];
  segments: Record<Segment, SegmentStats>;
  rejected: { variants: number; accessories: number; mismatches: number; outliers: number };
  variantExamples: Array<{ title: string; price: number; url: string; reason: string }>;
  queries: string[];
  attempts: SearchAttempt[];
  providersUsed: string[];
  pagesFetched: number;
  pagesWithPrices: number;
  pageLog: Array<{ url: string; status: "ok" | "no_price" | "failed"; offers: number; kept: number; method?: string }>;
  errors: string[];
  /** Marktplaats/2dehands asking prices: context only, never part of the valuation. */
  marketplace: { offers: MarketOffer[]; stats: SegmentStats };
  valuation: MarketValuation;
  /** Per direct source: offers parsed and kept, or the error. Shows which sources work from this IP. */
  sourceHealth: Record<string, { ok: boolean; parsed: number; error?: string }>;
};

const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const OFFICIAL = /(?:^|\.)(?:apple\.com|samsung\.com|sony\.(?:nl|com|eu)|playstation\.com|meta\.com|ray-ban\.com|dji\.com|gopro\.com|bose\.(?:nl|com)|jbl\.com|sennheiser\.com|nintendo\.com|xbox\.com|microsoft\.com|garmin\.com|canon\.(?:nl|com)|nikon\.(?:nl|com)|fujifilm\.com|lg\.com|philips\.nl|dyson\.nl|google\.com|lenovo\.com|dell\.com|hp\.com|shure\.com|rode\.com|beatsbydre\.com|casio\.com|tissotwatch\.com|michaelkors\.(?:nl|eu|com)|fjallraven\.com|thenorthface\.(?:nl|com)|osprey\.com|deuter\.com|eastpak\.com|diesel\.com|hugoboss\.com|tommy\.com)$/;
const USED_DOMAINS = /(?:^|\.)(?:marktplaats\.nl|2dehands\.be|vinted\.nl|willhaben\.at|subito\.it|ebay\.[a-z.]+|vinted\.[a-z.]+|kleinanzeigen\.de|tweakers\.net|budgetgaming\.nl|gameshoptwente\.nl|catawiki\.[a-z]+|vintedgo\.com)$/;
const REFURB_DOMAINS = /(?:^|\.)(?:backmarket\.[a-z.]+|refurbed\.[a-z.]+|swappie\.com|forzarefurbished\.nl|rebuy\.[a-z.]+|leapp\.nl|renewd\.com|mobilezwaar\.nl|refurbishedstore\.nl|ireparatie\.nl|thephonelab\.nl)$/;
const NEW_RETAIL = /(?:^|\.)(?:alternate\.nl|coolblue\.(?:nl|be)|bol\.com|mediamarkt\.(?:nl|be)|amazon\.(?:nl|de|com\.be)|alternate\.(?:nl|be)|bcc\.nl|expert\.nl|ep\.nl|wehkamp\.nl|kamera-express\.nl|cameranu\.nl|fotokonijnenberg\.nl|belsimpel\.nl|megekko\.nl|azerty\.nl|informatique\.nl|paradigit\.nl|intertoys\.nl|gamemania\.nl|nedgame\.nl|koopmanoptics\.com|pearle\.nl|hansanders\.nl|specsavers\.nl|baumsport\.nl|supersales\.nl|kieskeurig\.nl|beslist\.nl|bax-shop\.nl|thomann\.(?:de|nl)|mobiel\.nl|gsmpunt\.nl|dreamland\.be|vandenborre\.be|krefel\.be|fnac\.(?:be|nl)|hifi\.nl|hificorner\.nl|zalando\.nl|debijenkorf\.nl|otto\.nl|sunglasshut\.com|optiek\.nl)$/;
const SKIP_PAGES = /(?:^|\.)(?:marktplaats\.nl|2dehands\.be)$/;
/** Same platform as the candidate listings: never independent evidence of market value. */
/** The only site whose listings the user buys from. */
export const isMarktplaats = (domain: string) => /(?:^|\.)marktplaats\.nl$/i.test(domain);
export const MARKETPLACE_DOMAINS = /(?:^|\.)(?:marktplaats\.nl|2dehands\.be|2ememain\.be)$/;
const WANTED_AD = /\b(ankauf|suche|gesucht|tausch|zoek|gezocht|ruilen|inkoop|wir kaufen|kaufe)\b/i;

/** Broken, fake or parts-only offers are never market comparables. */
const BROKEN_WORDS = /\b(defect\w*|kapot\w*|onderdelen|for parts|parts only|niet werkend|werkt niet|gebarsten|replica|kopie|nep|fake|imitatie|lookalike|icloud[\s-]*(?:lock|slot)|water ?schade|reparatie nodig|namaak|aaa[\s-]*kwaliteit|1\s*:\s*1|copy|high copy|clone)\b/i;
const NEGATED_BROKEN = /\b(geen|zonder|niet|no)\s+(defect\w*|kapot\w*|gebarsten|schade|krassen)/gi;

const REFURB_WORDS = /\b(refurbished|refurb|reconditioned|renewed|gereviseerd|tweedekans|certified pre-owned|nieuwe batterij|nieuwe accu|[abc][\s-]?grade|grade [abc]|zichtbaar gebruikt|licht gebruikt|als nieuw|zo goed als nieuw|premium refurbished)\b/i;
/** Search/category pages list many products: only their structured data is trustworthy. */
const LISTING_PAGE = /[?&](?:q|query|searchtext|search|k|text)=|\/(?:zoeken|search|s|l|c|categorie|category|q)\//i;
const USED_WORDS = /\b(tweedehands|gebruikt|used|pre-owned|occasion|2e hands|second hand)\b/i;

function domainOf(value: string): string {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

function segmentFor(domain: string, offer: { condition: OfferCondition; name: string }, pageText: string): Segment | null {
  if (REFURB_DOMAINS.test(domain)) return "refurbished";
  if (offer.condition === "refurbished" || REFURB_WORDS.test(offer.name)) return "refurbished";
  if (USED_DOMAINS.test(domain)) return "used";
  if (offer.condition === "used" || USED_WORDS.test(offer.name)) return "used";
  if (offer.condition === "new") return "new";
  if (OFFICIAL.test(domain) || NEW_RETAIL.test(domain)) return REFURB_WORDS.test(pageText.slice(0, 400)) ? "refurbished" : "new";
  return null; // unknown shop type: not used for prices
}

function percentile(sorted: number[], fraction: number): number | null {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return Math.round((sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)) * 100) / 100;
}

function stats(offers: MarketOffer[]): SegmentStats {
  const prices = offers.map((offer) => offer.price).sort((a, b) => a - b);
  return {
    count: prices.length,
    min: prices[0] ?? null,
    p25: percentile(prices, 0.25),
    median: percentile(prices, 0.5),
    max: prices[prices.length - 1] ?? null,
    domains: [...new Set(offers.map((offer) => offer.domain))],
    official: offers.find((offer) => offer.official) || null,
  };
}

/** Removes price outliers (parts, bundles, typos) relative to the segment median. */
function dropOutliers(offers: MarketOffer[]): { kept: MarketOffer[]; removed: number } {
  if (offers.length < 4) return { kept: offers, removed: 0 };
  const sorted = offers.map((offer) => offer.price).sort((a, b) => a - b);
  const median = percentile(sorted, 0.5) || 0;
  const kept = offers.filter((offer) => offer.price >= median * 0.4 && offer.price <= median * 2.5);
  return { kept, removed: offers.length - kept.length };
}

async function fetchPage(url: string, deadline: number): Promise<{ url: string; html: string } | null> {
  let current = url;
  for (let hop = 0; hop < 4; hop += 1) {
    if (!safeWebUrl(current)) return null;
    const remaining = deadline - Date.now();
    if (remaining < 800) return null;
    const response = await fetch(current, {
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8" },
      redirect: "manual",
      signal: AbortSignal.timeout(Math.min(7500, remaining)),
      cache: "no-store",
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) return null;
      current = new URL(location, current).href;
      continue;
    }
    if (!response.ok || !/html|xml/i.test(response.headers.get("content-type") || "")) return null;
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < 2_000_000) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      size += value.length;
    }
    reader.cancel().catch(() => undefined);
    return { url: current, html: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8") };
  }
  return null;
}

type MarktplaatsRow = Record<string, unknown>;

/** Marktplaats / 2dehands share the same public search API. */
async function searchClassifieds(
  host: "www.marktplaats.nl" | "www.2dehands.be",
  query: string,
  location: { postcode?: string | null; distanceKm?: number | null } | undefined,
  deadline: number,
  pages = 1,
): Promise<MarktplaatsRow[]> {
  const rows: MarktplaatsRow[] = [];
  // Page through results (100 per page) until the source runs out, the page limit or the time budget.
  for (let page = 0; page < Math.max(1, pages); page += 1) {
    if (deadline - Date.now() < 1500) break;
    const params = new URLSearchParams({ query, limit: "100", offset: String(page * 100), searchInTitleAndDescription: "true", sortBy: "SORT_INDEX", sortOrder: "DECREASING" });
    if (host === "www.marktplaats.nl" && location?.postcode && location.distanceKm) {
      params.set("postcode", location.postcode.replace(/\s/g, ""));
      params.set("distanceMeters", String(Math.round(location.distanceKm * 1000)));
    }
    const response = await fetch("https://" + host + "/lrp/api/search?" + params, {
      headers: { "User-Agent": BROWSER_UA, Accept: "application/json", "Accept-Language": "nl-NL,nl;q=0.9" },
      signal: AbortSignal.timeout(Math.max(1000, Math.min(9000, deadline - Date.now()))),
      cache: "no-store",
    });
    if (!response.ok) {
      if (page > 0) break; // keep what was already collected
      throw new Error(host + " HTTP " + response.status);
    }
    const data = await response.json() as { listings?: MarktplaatsRow[]; totalResultCount?: number };
    const batch = Array.isArray(data.listings) ? data.listings : [];
    rows.push(...batch);
    if (batch.length < 100 || (typeof data.totalResultCount === "number" && rows.length >= data.totalResultCount)) break;
  }
  return rows;
}

function classifiedOffer(row: MarktplaatsRow, host: string): Omit<MarketOffer, "id" | "match" | "matchReason" | "segment"> | null {
  // A reserved ("Gereserveerd") listing is not an available offer.
  if (row.reserved === true) return null;
  const priceInfo = (row.priceInfo || {}) as Record<string, unknown>;
  const cents = Number(priceInfo.priceCents);
  const priceType = String(priceInfo.priceType || "");
  if (!Number.isFinite(cents) || cents <= 0) return null;
  let url = String(row.vipUrl || "");
  if (url.startsWith("/")) url = "https://" + host + url;
  if (!safeWebUrl(url)) return null;
  const location = (row.location || {}) as Record<string, unknown>;
  const attributes = Array.isArray(row.attributes) ? row.attributes as Array<Record<string, unknown>> : [];
  const condition = attributes.find((attribute) => attribute.key === "condition")?.value;
  const distance = Number(location.distanceMeters);
  return {
    title: String(row.title || "").slice(0, 220),
    price: cents / 100,
    url,
    domain: host.replace(/^www\./, ""),
    method: "api",
    official: false,
    availability: "in_stock",
    city: String(location.cityName || ""),
    distanceKm: Number.isFinite(distance) && distance >= 0 ? Math.round(distance / 100) / 10 : null,
    postedAt: typeof row.date === "string" ? row.date : null,
    itemCondition: typeof condition === "string" ? condition : null,
    priceType,
    imageUrl: Array.isArray(row.imageUrls) && typeof row.imageUrls[0] === "string" ? (String(row.imageUrls[0]).startsWith("//") ? "https:" + row.imageUrls[0] : String(row.imageUrls[0])) : null,
  };
}

const cache = new Map<string, { at: number; value: MarketResearch }>();
const CACHE_MS = 20 * 60 * 1000;

export type ResearchOptions = {
  includeNew?: boolean;
  includeUsed?: boolean;
  includeRefurbished?: boolean;
  location?: { postcode?: string | null; distanceKm?: number | null };
  maxPrice?: number | null;
  /** Absolute time budget in ms. */
  budgetMs?: number;
  excludeUrls?: string[];
  hint?: string | null;
  /** Asking price of the listing being judged; used only for plausibility checks. */
  referencePrice?: number | null;
  /** Also collect current Marktplaats/2dehands listings as context (default true). */
  includeMarketplace?: boolean;
  /** Leave Belgian 2dehands listings out of the buyable results. */
  marktplaatsOnly?: boolean;
  /** Scanner only: skip shops that never answer its servers. */
  skipBlockedRetail?: boolean;
  /** Marktplaats result pages for buyable listings (100 per page). */
  marketplacePages?: number;
  /** Skip the in-memory cache: a fresh valuation was requested. */
  fresh?: boolean;
  /** Use Google Search through the Gemini API when GEMINI_API_KEY is set (default true). */
  grounding?: boolean;
  /** Shops the user explicitly asked about (e.g. "price on Amazon"): searched in a targeted way. */
  focusShops?: Array<{ name: string; domains: string[] }>;
};

/**
 * Market value from independent sources only (shops, refurbishers, Kleinanzeigen, other used
 * platforms). Marktplaats/2dehands are excluded by construction: they are not in `offers`.
 */
export function computeValuation(offers: MarketOffer[], segments: Record<Segment, SegmentStats>, checkedAt: string): MarketValuation {
  const used = offers.filter((offer) => offer.segment === "used" && !MARKETPLACE_DOMAINS.test(offer.domain));
  const prices = used.map((offer) => offer.price).sort((a, b) => a - b);
  const domains = new Set(used.map((offer) => offer.domain));
  const q1 = percentile(prices, 0.25);
  const q3 = percentile(prices, 0.75);
  const median = percentile(prices, 0.5);
  const spread = prices.length >= 4 && median ? Math.round(((q3! - q1!) / median) * 1000) / 1000 : null;
  const newValue = segments.new.official?.price ?? segments.new.median;
  const refurbishedValue = segments.refurbished.median;
  const independentSources = offers.length;
  const independentDomains = new Set(offers.map((offer) => offer.domain)).size;
  let confidence: MarketValuation["confidence"] = "none";
  let reason = "";
  if (prices.length >= 6 && domains.size >= 2 && (spread === null || spread <= 0.6)) {
    confidence = "high";
    reason = `медиана ${prices.length} независимых б/у предложений с ${domains.size} площадок`;
  } else if (prices.length >= 3) {
    confidence = "medium";
    reason = `медиана ${prices.length} б/у предложений (${[...domains].join(", ")})` + (spread !== null && spread > 0.6 ? "; большой разброс цен" : "");
  } else if (prices.length > 0) {
    confidence = "low";
    reason = `только ${prices.length} независимых б/у предложения — недостаточно для рыночной оценки`;
  } else {
    reason = independentSources
      ? "найдены только цены новых/восстановленных товаров — б/у рынок вне Marktplaats не подтверждён"
      : "внешний поиск не дал достоверных цен для этой модели";
  }
  const marketValue = prices.length >= 3 ? median : null;
  return {
    marketValue,
    conservativeValue: prices.length >= 8 ? q1 : marketValue,
    usedValue: median,
    newValue: newValue ?? null,
    refurbishedValue: refurbishedValue ?? null,
    confidence,
    sourceCount: independentSources,
    domainCount: independentDomains,
    spread,
    checkedAt,
    reason,
  };
}

/**
 * Valuation of one listing from offers found for its model group: only offers that are the exact
 * same product as this listing count, re-checked with the current matcher (also for stored offers).
 */
export function revalueForListing(title: string, hint: string | null, offers: MarketOffer[], checkedAt: string): { valuation: MarketValuation; offers: MarketOffer[]; removed: number } {
  const identity = buildIdentity(title, hint);
  const exact = offers.filter((offer) => matchProduct(offer.title, identity).level === "exact");
  const bySegment = (segment: Segment) => dropOutliers(exact.filter((offer) => offer.segment === segment)).kept;
  const kept = (["used", "new", "refurbished"] as Segment[]).flatMap(bySegment);
  const segments = { used: stats(bySegment("used")), new: stats(bySegment("new")), refurbished: stats(bySegment("refurbished")) } as Record<Segment, SegmentStats>;
  return { valuation: computeValuation(kept, segments, checkedAt), offers: kept, removed: offers.length - kept.length };
}

const KLEINANZEIGEN_ARTICLE = /<article\b[^>]*data-adid="(\d+)"[^>]*data-href="([^"]+)"[^>]*>([\s\S]*?)<\/article>/gi;

/** Kleinanzeigen.de: independent used market (Germany). Parses the public search result cards. */
async function fetchKleinanzeigen(name: string, deadline: number) {
  const slug = name.toLowerCase().replace(/[^a-z0-9äöüß]+/gi, "+").replace(/^\+|\+$/g, "");
  const page = await fetchPage("https://www.kleinanzeigen.de/s-" + slug + "/k0", deadline);
  if (!page) throw new Error("страница недоступна");
  const rows: Array<{ title: string; description: string; offer: Omit<MarketOffer, "id" | "match" | "matchReason" | "segment"> }> = [];
  for (const match of page.html.matchAll(KLEINANZEIGEN_ARTICLE)) {
    const [, , href, body] = match;
    let title = "";
    let description = "";
    const ld = body.match(/<script[^>]*ld\+json[^>]*>([\s\S]*?)<\/script>/i);
    if (ld) { try { const data = JSON.parse(ld[1]) as { title?: string; description?: string }; title = data.title || ""; description = data.description || ""; } catch { /* ignore */ } }
    const text = stripTags(body.replace(/<script[\s\S]*?<\/script>/gi, " "));
    // The price follows the teaser text: "500 € VB", "1.149 €". "Zu verschenken" has no price.
    const priceMatch = [...text.matchAll(/(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{2}))?\s*€/g)].pop();
    if (!title || !priceMatch) continue;
    const price = Number(priceMatch[1].replace(/\./g, "") + (priceMatch[2] ? "." + priceMatch[2] : ""));
    if (!Number.isFinite(price) || price < 5) continue;
    rows.push({ title, description, offer: { title: title.slice(0, 220), price, url: "https://www.kleinanzeigen.de" + href, domain: "kleinanzeigen.de", method: "jsonld", official: false, availability: "in_stock", priceType: /\bVB\b/.test(text) ? "VB" : "FIXED" } });
  }
  return rows;
}

/** Refurbed.nl: refurbished offers from the public search page ("vanaf" price per product). */
async function fetchRefurbed(name: string, deadline: number) {
  const page = await fetchPage("https://www.refurbed.nl/search/?query=" + encodeURIComponent(name), deadline);
  if (!page) throw new Error("страница недоступна");
  const rows: Array<{ title: string; offer: Omit<MarketOffer, "id" | "match" | "matchReason" | "segment"> }> = [];
  for (const match of page.html.matchAll(/<a\b[^>]*href="(\/p\/[^"]+)"[^>]*data-test="productcard-link"[^>]*>/gi)) {
    const start = match.index ?? 0;
    const priceIndex = page.html.indexOf('data-test="product-price"', start);
    if (priceIndex < 0 || priceIndex - start > 12000) continue;
    const chunk = stripTags(page.html.slice(start, priceIndex + 120).replace(/<svg[\s\S]*?<\/svg>/gi, " "));
    const priceMatch = chunk.match(/€\s?(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{2}))?\s*$/) || chunk.match(/€\s?(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{2}))?/);
    if (!priceMatch) continue;
    const price = Number(priceMatch[1].replace(/\./g, "") + (priceMatch[2] ? "." + priceMatch[2] : ""));
    const title = chunk.slice(0, chunk.indexOf("€")).replace(/\b(beperkte voorraad|bestseller|nieuw binnen|uitverkocht)\b/gi, " ").replace(/\s\d,\d\s*$/, "").replace(/\s+/g, " ").trim();
    if (!title || !Number.isFinite(price)) continue;
    rows.push({ title, offer: { title: title.slice(0, 220), price, url: "https://www.refurbed.nl" + match[1], domain: "refurbed.nl", method: "text", official: false, availability: "in_stock" } });
  }
  return rows;
}

/** Vinted.nl: independent second-hand marketplace in the Netherlands (catalog search cards). */
async function fetchVinted(name: string, deadline: number) {
  const page = await fetchPage("https://www.vinted.nl/catalog?search_text=" + encodeURIComponent(name), deadline);
  if (!page) throw new Error("страница недоступна");
  const rows: Array<{ title: string; offer: Omit<MarketOffer, "id" | "match" | "matchReason" | "segment"> }> = [];
  // <a href="/items/123-…" data-testid="product-item-id-123--overlay-link" title="Title, Merk: X, Staat: Y, 200.00 €, 211.20 €">
  for (const match of page.html.matchAll(/<a\b[^>]*href="(\/items\/[^"?]+)[^"]*"[^>]*data-testid="product-item-id-\d+--overlay-link"[^>]*title="([^"]+)"/gi)) {
    const label = decodeEntities(match[2]);
    const parts = label.split(/,\s*/);
    const title = parts.filter((part) => !/^(merk|staat|maat):/i.test(part) && !/€/.test(part)).join(", ").trim();
    const price = Number((label.match(/(\d+(?:\.\d{1,2})?)\s*€/) || [])[1]);
    const condition = (parts.find((part) => /^staat:/i.test(part)) || "").replace(/^staat:\s*/i, "");
    if (!title || !Number.isFinite(price) || price < 5) continue;
    rows.push({ title, offer: { title: title.slice(0, 220), price, url: "https://www.vinted.nl" + match[1], domain: "vinted.nl", method: "text", official: false, availability: "in_stock", itemCondition: condition || null } });
  }
  return rows;
}

type ClassifiedRow = { title: string; description: string; offer: Omit<MarketOffer, "id" | "match" | "matchReason" | "segment"> };

function nextData(html: string): unknown {
  const raw = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/** Willhaben.at search page: private and shop listings in euro from the page's own data. */
export function parseWillhaben(html: string): ClassifiedRow[] {
  const data = nextData(html) as { props?: { pageProps?: { searchResult?: { advertSummaryList?: { advertSummary?: Array<{ description?: string; attributes?: { attribute?: Array<{ name: string; values: string[] }> } }> } } } } } | null;
  const rows: ClassifiedRow[] = [];
  for (const ad of data?.props?.pageProps?.searchResult?.advertSummaryList?.advertSummary || []) {
    const attribute = (name: string) => ad.attributes?.attribute?.find((item) => item.name === name)?.values?.[0] || "";
    const title = attribute("HEADING") || ad.description || "";
    const price = Number(attribute("PRICE"));
    const path = attribute("SEO_URL");
    if (!title || !path || !Number.isFinite(price) || price < 5) continue;
    rows.push({ title, description: attribute("BODY_DYN"), offer: { title: title.slice(0, 220), price, url: "https://www.willhaben.at/iad/" + path.replace(/^\//, ""), domain: "willhaben.at", method: "text", official: false, availability: "in_stock", priceType: "FIXED" } });
  }
  return rows;
}

/** Subito.it search page: "in vendita" listings only; "cerco" (wanted) ads are skipped. */
export function parseSubito(html: string): ClassifiedRow[] {
  type Ad = { kind?: string; subject?: string; body?: string; type?: { key?: string }; urls?: { default?: string }; features?: Record<string, { values?: Array<{ key?: string }> }> };
  const data = nextData(html) as { props?: { pageProps?: { initialState?: { items?: { originalList?: Ad[]; list?: Array<Ad & { item?: Ad }> } } } } } | null;
  const items = data?.props?.pageProps?.initialState?.items;
  const ads = items?.originalList?.length ? items.originalList : (items?.list || []).map((row) => row.item || row);
  const rows: ClassifiedRow[] = [];
  for (const ad of ads) {
    const price = Number(ad.features?.["/price"]?.values?.[0]?.key);
    if (ad.kind !== "AdItem" || ad.type?.key !== "s" || !ad.subject || !ad.urls?.default || !Number.isFinite(price) || price < 5) continue;
    rows.push({ title: ad.subject, description: ad.body || "", offer: { title: ad.subject.slice(0, 220), price, url: ad.urls.default, domain: "subito.it", method: "text", official: false, availability: "in_stock", priceType: "FIXED" } });
  }
  return rows;
}

async function fetchWillhaben(name: string, deadline: number) {
  const page = await fetchPage("https://www.willhaben.at/iad/kaufen-und-verkaufen/marktplatz?keyword=" + encodeURIComponent(name), deadline);
  if (!page) throw new Error("страница недоступна");
  return parseWillhaben(page.html);
}

async function fetchSubito(name: string, deadline: number) {
  const page = await fetchPage("https://www.subito.it/annunci-italia/vendita/usato/?q=" + encodeURIComponent(name), deadline);
  if (!page) throw new Error("страница недоступна");
  return parseSubito(page.html);
}

/** Alternate.nl: Dutch electronics shop (search result cards with name and price). */
async function fetchAlternate(name: string, deadline: number) {
  const page = await fetchPage("https://www.alternate.nl/listing.xhtml?q=" + encodeURIComponent(name), deadline);
  if (!page) throw new Error("страница недоступна");
  const rows: Array<{ title: string; offer: Omit<MarketOffer, "id" | "match" | "matchReason" | "segment"> }> = [];
  const cards = [...page.html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*class="[^"]*\bproductBox\b[^"]*"[^>]*>/gi)];
  cards.forEach((card, index) => {
    const end = cards[index + 1]?.index ?? Math.min(page.html.length, (card.index ?? 0) + 20000);
    const chunk = page.html.slice(card.index ?? 0, end);
    const title = stripTags(chunk.match(/class="product-name[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || "");
    const priceText = chunk.match(/<span class="price[^"]*">\s*€\s*([\d.]+,\d{2}|[\d.]+)/i)?.[1];
    if (!title || !priceText) return;
    const price = Number(priceText.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(price)) return;
    rows.push({ title, offer: { title: title.slice(0, 220), price, url: new URL(decodeEntities(card[1]), "https://www.alternate.nl").href, domain: "alternate.nl", method: "text", official: false, availability: "in_stock" } });
  });
  return rows;
}

function decodeEntities(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&euro;/g, "€").replace(/&nbsp;/g, " ");
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&euro;/g, "€").replace(/\s+/g, " ").trim();
}

export async function researchMarket(title: string, options: ResearchOptions = {}): Promise<MarketResearch> {
  const identity = buildIdentity(title, options.hint);
  const includeNew = options.includeNew !== false;
  const includeUsed = options.includeUsed !== false;
  const includeRefurbished = options.includeRefurbished !== false;
  const cacheKey = JSON.stringify([identity.searchName, includeNew, includeUsed, includeRefurbished, options.location?.postcode || "", options.location?.distanceKm || 0, options.maxPrice || 0, (options.focusShops || []).map((shop) => shop.name), providerNames()]);
  const cached = options.fresh ? undefined : cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  const started = Date.now();
  const deadline = started + (options.budgetMs ?? 32000);
  const errors: string[] = [];
  const attempts: SearchAttempt[] = [];
  const offers: MarketOffer[] = [];
  const variantExamples: MarketResearch["variantExamples"] = [];
  const rejected = { variants: 0, accessories: 0, mismatches: 0, outliers: 0 };
  const exclude = new Set((options.excludeUrls || []).map((url) => url.replace(/[?#].*$/, "")));
  // Distinctive words only: the brand alone ("apple") matches support pages and homepages.
  const brandWords = new Set((identity.brand || "").split(" "));
  const distinctive = identity.coreTokens.filter((token) => !/^\d+$/.test(token) && !brandWords.has(token));
  const mustContain = [...(distinctive.length ? distinctive : identity.coreTokens).slice(0, 3), ...identity.criticalTokens.filter((token) => /^[a-z]+\d{1,2}$/.test(token)).map((token) => token.replace(/^[a-z]+/, "")).slice(0, 0)];
  const name = identity.searchName;

  const marketplaceOffers: MarketOffer[] = [];
  const accept = (base: Omit<MarketOffer, "id" | "match" | "matchReason" | "segment">, segment: Segment, matchText: string, extraText = "", target: MarketOffer[] = offers) => {
    if (exclude.has(base.url.replace(/[?#].*$/, ""))) return;
    if (WANTED_AD.test(matchText)) { rejected.mismatches += 1; return; }
    if (BROKEN_WORDS.test((matchText + " " + extraText).replace(NEGATED_BROKEN, " "))) { rejected.mismatches += 1; return; }
    const match = matchProduct(matchText, identity);
    if (match.level === "accessory") { rejected.accessories += 1; return; }
    if (match.level === "variant") {
      rejected.variants += 1;
      if (variantExamples.length < 5) variantExamples.push({ title: base.title, price: base.price, url: base.url, reason: match.reason });
      return;
    }
    if (match.level !== "exact") { rejected.mismatches += 1; return; }
    // One page with several colour variants at the same price is one offer, not several.
    const pageKey = base.url.replace(/[?#].*$/, "");
    if (target.some((offer) => offer.url.replace(/[?#].*$/, "") === pageKey && Math.abs(offer.price - base.price) < 0.01)) return;
    target.push({ ...base, id: 0, segment, match: match.level, matchReason: match.reason });
  };

  // 1) Marktplaats / 2dehands: current listings for context and buying; NOT market evidence.
  const classifiedTasks: Promise<void>[] = [];
  if (includeUsed && options.includeMarketplace !== false) {
    const terms = [name, ...identity.aliases.filter((alias) => !/^[A-Z0-9]{4,}$/.test(alias))].slice(0, 2);
    for (const term of terms) {
      classifiedTasks.push(searchClassifieds("www.marktplaats.nl", term, options.location, deadline, options.marketplacePages ?? 1)
        .then((rows) => {
          for (const row of rows) {
            const offer = classifiedOffer(row, "www.marktplaats.nl");
            // Only fixed asking prices are comparable; "bieden vanaf" is a lower bound.
            if (!offer || (offer.priceType && offer.priceType !== "FIXED")) continue;
            if (options.maxPrice && offer.price > options.maxPrice * 3) continue;
            // Private sellers' "nieuw" items are still the second-hand market, not retail.
            accept(offer, "used", offer.title + " " + String(row.description || "").slice(0, 160), String(row.description || "").slice(0, 600), marketplaceOffers);
          }
        })
        .catch((error) => { errors.push("Marktplaats: " + (error instanceof Error ? error.message : String(error))); }));
    }
    if (!options.marktplaatsOnly) classifiedTasks.push(searchClassifieds("www.2dehands.be", name, undefined, deadline)
      .then((rows) => {
        for (const row of rows.slice(0, 60)) {
          const offer = classifiedOffer(row, "www.2dehands.be");
          if (!offer || (offer.priceType && offer.priceType !== "FIXED")) continue;
          accept(offer, "used", offer.title, "", marketplaceOffers);
        }
      })
      .catch((error) => { errors.push("2dehands: " + (error instanceof Error ? error.message : String(error))); }));
  }

  // 2) Web search for retail / refurbished / other used platforms, with provider failover.
  const queries: string[] = [];
  if (includeNew) queries.push(name + " prijs", name + " kopen");
  if (includeRefurbished) queries.push(name + " refurbished");
  if (includeUsed) queries.push(name + " tweedehands");
  for (const code of identity.modelCodes.slice(0, 1)) queries.push(code.toUpperCase() + " prijs");
  const alias = identity.aliases.find((value) => !/^[A-Z0-9]{4,}$/.test(value));
  if (alias && includeNew) queries.push(alias + " prijs");

  const searchRows: Array<SearchResult & { query: string }> = [];
  const runSearches = async () => {
    // Small concurrency keeps every provider under its rate limit.
    const pending = [...new Set(queries)];
    const workers = Array.from({ length: 3 }, async () => {
      while (pending.length && Date.now() < deadline - 9000) {
        const query = pending.shift()!;
        const outcome = await searchWithFailover(query, { mustContain, minRelevant: 4, maxProviders: 4, timeoutMs: 7000 });
        attempts.push(...outcome.attempts);
        for (const row of outcome.results) searchRows.push({ ...row, query });
      }
    });
    await Promise.all(workers);
  };

  // 3) Direct sources with structured data, independent of search engines.
  const directPages: string[] = [];
  if (includeNew) {
    directPages.push("https://www.coolblue.nl/zoeken?query=" + encodeURIComponent(name));
    // These two answered 0 of 120 requests from the scanner's servers: not worth its time budget.
    if (!options.skipBlockedRetail) {
      directPages.push("https://www.mediamarkt.nl/nl/search.html?query=" + encodeURIComponent(name));
      // beslist.nl aggregates many Dutch shops (JSON-LD ItemList of Products with prices).
      directPages.push("https://www.beslist.nl/products/r/" + encodeURIComponent(name.toLowerCase()).replace(/%20/g, "+") + "/");
    }
  }
  const directTasks: Promise<void>[] = [];
  const sourceHealth: MarketResearch["sourceHealth"] = {};
  const sourceErrors = (label: string) => (error: unknown) => {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 80);
    errors.push(label + ": " + message);
    sourceHealth[label] = { ok: false, parsed: 0, error: message };
  };
  const healthy = (label: string, parsed: number) => { sourceHealth[label] = { ok: parsed > 0, parsed, error: parsed ? undefined : "0 предложений" }; };
  if (includeUsed) {
    directTasks.push(fetchVinted(name, deadline).then((rows) => {
      healthy("Vinted", rows.length);
      for (const row of rows) accept(row.offer, "used", row.title);
    }).catch(sourceErrors("Vinted")));
  }
  if (includeNew) {
    directTasks.push(fetchAlternate(name, deadline).then((rows) => {
      healthy("Alternate", rows.length);
      for (const row of rows) accept(row.offer, "new", row.title);
    }).catch(sourceErrors("Alternate")));
  }
  if (includeUsed) {
    directTasks.push(fetchKleinanzeigen(name, deadline).then(async (rows) => {
      // Long seller titles often return nothing: retry with the article code or a shorter name.
      if (rows.length < 3) {
        const fallback = identity.modelCodes[0]?.toUpperCase() || name.split(/\s+/).slice(0, 4).join(" ");
        if (fallback && fallback !== name) rows = [...rows, ...(await fetchKleinanzeigen(fallback, deadline).catch(() => []))];
      }
      healthy("Kleinanzeigen", rows.length);
      for (const row of rows) accept(row.offer, "used", row.title, row.description);
    }).catch(sourceErrors("Kleinanzeigen")));
  }
  if (includeUsed) {
    for (const [label, fetcher] of [["Willhaben", fetchWillhaben], ["Subito", fetchSubito]] as const) {
      directTasks.push(fetcher(name, deadline).then((rows) => {
        healthy(label, rows.length);
        for (const row of rows) accept(row.offer, "used", row.title, row.description);
      }).catch(sourceErrors(label)));
    }
  }
  if (includeRefurbished) {
    directTasks.push(fetchRefurbed(name, deadline).then((rows) => {
      healthy("Refurbed", rows.length);
      for (const row of rows) accept(row.offer, "refurbished", row.title);
    }).catch(sourceErrors("Refurbed")));
  }

  // Google Search via the Gemini API: the provider that works from server IPs (Vercel, GitHub Actions).
  if (process.env.GEMINI_API_KEY && options.grounding !== false) {
    const started = Date.now();
    directTasks.push(groundedMarketOffers(name, deadline, { new: includeNew, used: includeUsed, refurbished: includeRefurbished }).then((grounded) => {
      attempts.push({ provider: "Google Search (Gemini)", query: grounded.queries.join(" | ") || name, ok: grounded.offers.length > 0,
        count: grounded.offers.length, error: grounded.error || (grounded.offers.length ? undefined : "нет подтверждённых цен в источниках"), ms: Date.now() - started });
      if (grounded.queries.length) queries.push(...grounded.queries.map((query) => "Google: " + query));
      for (const offer of grounded.offers) {
        const segment = segmentFor(offer.domain, { condition: offer.condition, name: offer.evidence }, offer.evidence);
        if (!segment) continue;
        if ((segment === "new" && !includeNew) || (segment === "used" && !includeUsed) || (segment === "refurbished" && !includeRefurbished)) continue;
        accept({ title: offer.title, price: offer.price, url: offer.url, domain: offer.domain, method: "grounding",
          official: OFFICIAL.test(offer.domain), availability: "unknown" }, segment, offer.evidence);
      }
    }).catch(sourceErrors("Google Search (Gemini)")));
  }

  // Shops named by the user: targeted Google search for that shop plus "site:" engine queries.
  for (const shop of options.focusShops || []) {
    queries.push(...shop.domains.slice(0, 1).map((domain) => "site:" + domain + " " + name));
    if (process.env.GEMINI_API_KEY && options.grounding !== false) {
      const started = Date.now();
      directTasks.push(groundedMarketOffers(name, deadline, { new: true, used: true, refurbished: true }, shop).then((grounded) => {
        attempts.push({ provider: "Google Search: " + shop.name, query: grounded.queries.join(" | ") || name, ok: grounded.offers.length > 0,
          count: grounded.offers.length, error: grounded.error || (grounded.offers.length ? undefined : "Google не вернул цену " + shop.name + " с подтверждённым источником"), ms: Date.now() - started });
        for (const offer of grounded.offers.filter((item) => domainMatchesShop(item.domain, shop))) {
          const segment = segmentFor(offer.domain, { condition: offer.condition, name: offer.evidence }, offer.evidence) || "new";
          accept({ title: offer.title, price: offer.price, url: offer.url, domain: offer.domain, method: "grounding",
            official: false, availability: "unknown" }, segment, offer.evidence);
        }
      }).catch(sourceErrors("Google Search: " + shop.name)));
    }
  }

  await Promise.all([runSearches(), ...classifiedTasks, ...directTasks]);

  // Rank candidate pages: known shops first, then title relevance.
  const rank = (row: SearchResult) => {
    const domain = domainOf(row.url);
    const known = OFFICIAL.test(domain) ? 4 : REFURB_DOMAINS.test(domain) ? 3.5 : NEW_RETAIL.test(domain) ? 3 : USED_DOMAINS.test(domain) ? 2.5 : 0;
    const match = matchProduct(row.title + " " + decodeURIComponent(new URL(row.url).pathname).replace(/[-_/]+/g, " "), identity);
    const matchScore = match.level === "exact" ? 2 : match.level === "similar" ? 1 : match.level === "variant" ? -1 : match.level === "accessory" ? -3 : -4;
    // Homepages, support and account pages never carry the product price.
    if (/^(?:support|account|locate|asw|help|service|klantenservice|developer)\./.test(domain) || new URL(row.url).pathname.length <= 4) return -10;
    return known + matchScore;
  };
  const seenUrls = new Set<string>();
  const candidates = searchRows
    .filter((row) => !SKIP_PAGES.test(domainOf(row.url)) && !/\/(?:forum|nieuws|news|review|reviews|blog|artikel|vergelijk(?!en\/)|community)\b/i.test(row.url))
    .map((row) => ({ row, score: rank(row) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .filter(({ row }) => { const key = row.url.replace(/[?#].*$/, ""); if (seenUrls.has(key)) return false; seenUrls.add(key); return true; });
  // Keep the per-domain count low so one shop cannot dominate the estimate.
  const perDomain = new Map<string, number>();
  const pageUrls = [...directPages];
  for (const { row } of candidates) {
    const domain = domainOf(row.url);
    if ((perDomain.get(domain) || 0) >= 2) continue;
    perDomain.set(domain, (perDomain.get(domain) || 0) + 1);
    pageUrls.push(row.url);
    if (pageUrls.length >= 16) break;
  }

  // Pages a provider already fetched (Tavily raw content): extract prices from that text directly.
  const prefetched = new Map<string, string>();
  for (const row of searchRows) if (row.rawContent && !prefetched.has(row.url)) prefetched.set(row.url, row.rawContent);
  const fromRawText = (url: string, title: string, raw: string) => {
    const domain = domainOf(url);
    if (MARKETPLACE_DOMAINS.test(domain) || LISTING_PAGE.test(url)) return 0;
    // The product page price: the first euro amount after the product name appears in the text.
    const lower = raw.toLowerCase();
    const anchor = identity.coreTokens.map((token) => lower.indexOf(token)).filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? 0;
    const window = raw.slice(anchor, anchor + 1500);
    const price = textPrices(window)[0]?.price;
    if (!price) return 0;
    const segment = segmentFor(domain, { condition: "unknown", name: title }, window);
    if (!segment) return 0;
    const before = offers.length;
    accept({ title: title.slice(0, 220), price, url, domain, method: "text", official: OFFICIAL.test(domain), availability: "unknown" }, segment, title);
    return offers.length - before;
  };

  let pagesFetched = 0;
  let pagesWithPrices = 0;
  const pageLog: MarketResearch["pageLog"] = [];
  const queue = [...pageUrls];
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length && Date.now() < deadline - 1500) {
      const url = queue.shift()!;
      const raw = prefetched.get(url);
      if (raw) {
        const row = searchRows.find((item) => item.url === url);
        const found = fromRawText(url, row?.title || url, raw);
        pagesFetched += 1;
        if (found) pagesWithPrices += 1;
        pageLog.push({ url, status: found ? "ok" : "no_price", offers: found, kept: found, method: "text" });
        continue;
      }
      try {
        const page = await fetchPage(url, deadline);
        if (!page) {
          pageLog.push({ url, status: "failed", offers: 0, kept: 0 });
          if (directPages.includes(url)) sourceHealth[domainOf(url)] = { ok: false, parsed: 0, error: "страница недоступна" };
          continue;
        }
        pagesFetched += 1;
        const domain = domainOf(page.url);
        const extracted = extractPage(page.html, page.url);
        let found = 0;
        for (const offer of extracted.offers) {
          if (offer.availability === "out_of_stock" && !OFFICIAL.test(domain)) continue;
          // Visible-text prices on search/category pages belong to random tiles, not this product.
          if (offer.method === "text" && LISTING_PAGE.test(page.url)) continue;
          const segment = segmentFor(domainOf(offer.url) || domain, offer, extracted.heading + " " + extracted.excerpt);
          if (!segment) continue;
          if ((segment === "new" && !includeNew) || (segment === "used" && !includeUsed) || (segment === "refurbished" && !includeRefurbished)) continue;
          const before = offers.length;
          // Structured offers carry their own product name; text prices use the page heading.
          const matchText = offer.method === "text" ? (extracted.heading || extracted.title) : (offer.name || extracted.heading || extracted.title);
          accept({
            title: (offer.name || extracted.heading || extracted.title).slice(0, 220),
            price: offer.price,
            url: offer.url || page.url,
            domain: domainOf(offer.url) || domain,
            method: offer.method,
            official: OFFICIAL.test(domainOf(offer.url) || domain),
            availability: offer.availability,
          }, segment, matchText);
          if (offers.length > before) found += 1;
        }
        if (found) pagesWithPrices += 1;
        pageLog.push({ url: page.url, status: found ? "ok" : "no_price", offers: extracted.offers.length, kept: found, method: extracted.offers[0]?.method });
        if (directPages.includes(url)) sourceHealth[domainOf(url)] = { ok: extracted.offers.length > 0, parsed: extracted.offers.length, error: extracted.offers.length ? undefined : "нет цен на странице" };
      } catch (error) {
        pageLog.push({ url, status: "failed", offers: 0, kept: 0 });
        errors.push(domainOf(url) + ": " + (error instanceof Error ? (error.name === "TimeoutError" ? "таймаут" : error.message) : String(error)).slice(0, 80));
      }
    }
  }));

  const bySegment = (segment: Segment) => {
    const { kept, removed } = dropOutliers(offers.filter((offer) => offer.segment === segment));
    rejected.outliers += removed;
    return kept.sort((a, b) => a.price - b.price);
  };
  const usedProbe = offers.filter((offer) => offer.segment === "used").map((offer) => offer.price).sort((a, b) => a - b);
  const usedProbeMedian = usedProbe.length >= 3 ? percentile(usedProbe, 0.5) : null;
  const newOffers = bySegment("new").filter((offer) => {
    // A "new" price far below the used market or the listing itself is a wrong tile, an accessory or a typo.
    const floor = Math.max(usedProbeMedian ? usedProbeMedian * 0.5 : 0, options.referencePrice ? options.referencePrice * 0.3 : 0);
    if (offer.price >= floor) return true;
    rejected.outliers += 1;
    return false;
  });
  // A used price far below the new retail price is almost always a fake, a part or a typo.
  const newMedian = percentile(newOffers.map((offer) => offer.price).sort((a, b) => a - b), 0.5);
  const plausible = (offer: MarketOffer) => newOffers.length < 2 || !newMedian || offer.price >= newMedian * 0.25;
  const usedAll = bySegment("used");
  const usedOffers = usedAll.filter(plausible);
  const refurbishedAll = bySegment("refurbished");
  const refurbishedOffers = refurbishedAll.filter(plausible);
  rejected.outliers += usedAll.length - usedOffers.length + refurbishedAll.length - refurbishedOffers.length;
  const finalOffers = [...newOffers, ...usedOffers, ...refurbishedOffers].map((offer, index) => ({ ...offer, id: index + 1 }));
  const { kept: marketplaceKept } = dropOutliers(marketplaceOffers);
  const marketplaceFinal = marketplaceKept.sort((a, b) => a.price - b.price).map((offer, index) => ({ ...offer, id: finalOffers.length + index + 1 }));
  const checkedAt = new Date().toISOString();

  const segments = {
    new: stats(finalOffers.filter((offer) => offer.segment === "new")),
    used: stats(finalOffers.filter((offer) => offer.segment === "used")),
    refurbished: stats(finalOffers.filter((offer) => offer.segment === "refurbished")),
  };
  const result: MarketResearch = {
    identity,
    checkedAt,
    durationMs: Date.now() - started,
    offers: finalOffers,
    segments,
    rejected,
    variantExamples,
    queries: [...new Set(queries)],
    attempts,
    providersUsed: [...new Set(attempts.filter((attempt) => attempt.ok).map((attempt) => attempt.provider))],
    pagesFetched,
    pagesWithPrices,
    pageLog,
    errors: errors.slice(0, 12),
    marketplace: { offers: marketplaceFinal, stats: stats(marketplaceFinal) },
    valuation: computeValuation(finalOffers, segments, checkedAt),
    sourceHealth,
  };
  if (finalOffers.length && !options.fresh) cache.set(cacheKey, { at: Date.now(), value: result });
  if (cache.size > 200) cache.delete(cache.keys().next().value as string);
  return result;
}
