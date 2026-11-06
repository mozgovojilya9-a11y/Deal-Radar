import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAiResearchPlan, getAiResearchModel, isAiResearchEnabled, researchMarketValuation, reviewAiOffers } from "@/lib/ai-research";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Condition = "used" | "new" | "unknown";
type MatchType = "exact" | "variant" | "related" | "accessory" | "unrelated";
type Offer = { title: string; description: string; price: number; url: string; source: string; condition: Condition; kind: "marktplaats" | "web"; matchType?: MatchType; matchConfidence?: number; matchReason?: string };
const USED_HOSTS = ["marktplaats.nl", "ebay.nl", "2dehands.be", "tweakers.net", "backmarket.nl", "refurbed.nl"];
const NEW_HOSTS = ["ray-ban.com", "bol.com", "coolblue.nl", "mediamarkt.nl", "amazon.nl", "kamera-express.nl", "cameranu.nl", "apple.com", "samsung.com", "sony.nl", "nikon.nl", "fujifilm.com", "alternate.nl"];
const USED_WORDS = /\b(tweedehands|gebruikt|used|pre-owned|occasion|refurbished|vraag\s*&\s*aanbod)\b/i;
const NEW_WORDS = /\b(nieuw|new|sealed|geseald|ongeopend)\b/i;
const BAD_WORDS = /\b(case only|hoesje|oplaadcase alleen|charging case only|onderdelen|onderdeel|losse lens|lens only|battery only|accu only|charger only|lader alleen|defect|kapot|reparatie|parts only|for parts)\b/i;
const PRICE_RE = /€\s?(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?|\d{2,5}(?:[.,]\d{2})?)/g;
const rateBuckets = new Map<string, number[]>();

function verifyInitData(raw: string, token: string): string | null {
  if (!raw || raw.length > 8192) return null;
  const params = new URLSearchParams(raw);
  const hash = params.get("hash");
  const authDate = Number(params.get("auth_date"));
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash) || !Number.isFinite(authDate)) return null;
  const now = Math.floor(Date.now() / 1000);
  if (authDate > now + 60 || now - authDate > 86400) return null;
  params.delete("hash");
  const check = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => k + "=" + v).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const expected = createHmac("sha256", secret).update(check).digest();
  const actual = Buffer.from(hash, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const user = JSON.parse(params.get("user") || "{}") as { id?: number };
    return Number.isSafeInteger(user.id) && Number(user.id) > 0 ? String(user.id) : null;
  } catch { return null; }
}
function rateAllowed(userId: string) {
  const now = Date.now();
  const recent = (rateBuckets.get(userId) || []).filter((t) => now - t < 60000);
  if (recent.length >= 4) return false;
  recent.push(now);
  rateBuckets.set(userId, recent);
  return true;
}
function decodeHtml(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)));
}
function stripHtml(s: string) {
  return decodeHtml(s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}
function hostOf(value: string) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}
function safeUrl(value: string) {
  try {
    const u = new URL(value);
    const h = u.hostname.toLowerCase();
    return u.protocol === "https:" && h.includes(".") && !h.includes("localhost") && !h.endsWith(".local")
      && !h.endsWith(".internal") && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(h);
  } catch { return false; }
}
function conditionFor(host: string, text: string): Condition {
  if (USED_HOSTS.some((d) => host === d || host.endsWith("." + d)) || USED_WORDS.test(text)) return "used";
  if (NEW_HOSTS.some((d) => host === d || host.endsWith("." + d)) || NEW_WORDS.test(text)) return "new";
  return "unknown";
}
function parseEuro(s: string) {
  let value = s.replace(/[^\d.,]/g, "");
  if (value.includes(",") && value.includes(".")) value = value.replace(/\./g, "").replace(",", ".");
  else if (value.includes(",")) value = value.replace(",", ".");
  else if (/^\d{1,3}(?:\.\d{3})+$/.test(value)) value = value.replace(/\./g, "");
  const n = Number(value);
  return Number.isFinite(n) && n >= 10 && n <= 20000 ? n : null;
}
function textPrices(s: string) {
  const found: number[] = [];
  for (const match of s.matchAll(PRICE_RE)) {
    const number = parseEuro(match[1]);
    if (number !== null) found.push(number);
  }
  return found;
}
function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const i = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[i] : Number(((sorted[i - 1] + sorted[i]) / 2).toFixed(2));
}
function conservativeQuartile(values: number[]) {
  if (!values.length) return null;
  if (values.length < 4) return median(values);
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * 0.25;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return Number((sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)).toFixed(2));
}
function unwrap(raw: string) {
  try {
    const u = new URL(raw, "https://html.duckduckgo.com");
    return u.searchParams.get("uddg") ? decodeURIComponent(u.searchParams.get("uddg") || "") : u.href;
  } catch { return raw; }
}
function attr(tag: string, name: string) {
  const m = tag.match(new RegExp(name + "\\s*=\\s*[\"']([^\"']+)[\"']", "i"));
  return m?.[1] ? decodeHtml(m[1]) : "";
}
function parseSearchResults(html: string) {
  const anchors = [...html.matchAll(/<a\b[^>]*class=["'][^"']*result__a[^"']*["'][^>]*>[\s\S]*?<\/a>/gi)];
  const snippets = [...html.matchAll(/<(?:a|div)\b[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div)>/gi)];
  return anchors.slice(0, 8).map((m, i) => {
    const tag = m[0].match(/^<a\b[^>]*>/i)?.[0] || "";
    return { url: unwrap(attr(tag, "href")), title: stripHtml(m[0].replace(/^<a\b[^>]*>/i, "").replace(/<\/a>$/i, "")), snippet: snippets[i]?.[1] ? stripHtml(snippets[i][1]) : "" };
  }).filter((x) => safeUrl(x.url));
}
async function searchWeb(query: string) {
  const url = "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query);
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; DealRadarResearch/1.0)", Accept: "text/html" }, signal: AbortSignal.timeout(9000), cache: "no-store" });
  if (!response.ok) throw new Error("Веб-поиск HTTP " + response.status);
  return parseSearchResults(await response.text());
}
function structuredPrices(html: string) {
  const result: number[] = [];
  const metas = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of metas) {
    const key = (attr(tag, "property") || attr(tag, "name") || "").toLowerCase();
    if (/price|product:price/.test(key)) {
      const n = Number(attr(tag, "content").replace(",", "."));
      if (Number.isFinite(n) && n >= 10 && n <= 20000) result.push(n);
    }
  }
  const scripts = html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  const visit = (v: unknown, depth = 0) => {
    if (depth > 8 || v == null) return;
    if (Array.isArray(v)) { v.forEach((x) => visit(x, depth + 1)); return; }
    if (typeof v !== "object") return;
    const obj = v as Record<string, unknown>;
    const offers = obj.offers;
    if (offers && typeof offers === "object") {
      for (const offer of (Array.isArray(offers) ? offers : [offers])) {
        if (offer && typeof offer === "object") {
          const n = Number((offer as Record<string, unknown>).price ?? (offer as Record<string, unknown>).lowPrice);
          if (Number.isFinite(n) && n >= 10 && n <= 20000) result.push(n);
        }
      }
    }
    Object.values(obj).forEach((x) => { if (typeof x === "object") visit(x, depth + 1); });
  };
  for (const script of scripts) {
    const body = script.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>$/i, "");
    try { visit(JSON.parse(body)); } catch { /* Ignore malformed source metadata. */ }
  }
  return result;
}
async function fetchWebOffer(row: { url: string; title: string; snippet: string }): Promise<Offer | null> {
  const host = hostOf(row.url);
  const base = row.title + " " + row.snippet;
  let html = "";
  try {
    const response = await fetch(row.url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; DealRadarResearch/1.0)", Accept: "text/html" }, signal: AbortSignal.timeout(7000), redirect: "error", cache: "no-store" });
    if (response.ok && safeUrl(response.url)) html = (await response.text()).slice(0, 700000);
  } catch { /* Search result snippet can contain the price. */ }
  const pageText = stripHtml(html).slice(0, 6000);
  const structured = structuredPrices(html);
  const price = structured[0] ?? textPrices(base + " " + pageText)[0] ?? null;
  if (price === null || BAD_WORDS.test(base)) return null;
  return { title: row.title || host, description: pageText, price, url: row.url, source: host, condition: conditionFor(host, base + " " + pageText), kind: "web" };
}
function parseMarktplaats(data: Record<string, unknown>, maxPrice: number): Offer[] {
  const embedded = (data._embedded && typeof data._embedded === "object" ? data._embedded : {}) as Record<string, unknown>;
  const rows = (embedded["mp:search-result"] || data.listings || []) as unknown[];
  const result: Offer[] = [];
  for (const value of rows) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const priceInfo = (row.priceInfo || {}) as Record<string, unknown>;
    const priceModel = (row.priceModel || {}) as Record<string, unknown>;
    const cents = Number(priceModel.askingPrice ?? priceInfo.priceCents);
    const price = cents > 0 ? cents / 100 : Number(row.price);
    const title = String(row.title || "");
    const description = String(row.description || "");
    if (!Number.isFinite(price) || price < 10 || price > maxPrice || BAD_WORDS.test(title)) continue;
    const links = row._links as Record<string, unknown> | undefined;
    const rel = (links?.["mp:advertisement-website-link"] || links?.["mp:advertisement"]) as Record<string, unknown> | undefined;
    let listingUrl = String(row.vipUrl || rel?.href || "");
    if (listingUrl.startsWith("/")) listingUrl = "https://www.marktplaats.nl" + listingUrl;
    if (listingUrl.startsWith("http://link.marktplaats.nl/")) listingUrl = listingUrl.replace("http://", "https://");
    if (!safeUrl(listingUrl)) continue;
    const words = title + " " + description + " " + String(row.condition || "");
    const condition = USED_WORDS.test(words) ? "used" : NEW_WORDS.test(words) ? "new" : "used";
    result.push({ title, description, price, url: listingUrl, source: "marktplaats.nl", condition, kind: "marktplaats" });
  }
  return result;
}
async function searchMarktplaats(query: string, maxPrice: number) {
  const headers = { "User-Agent": "Mozilla/5.0 (compatible; DealRadarResearch/1.0)", Accept: "application/json", "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8" };
  const params = new URLSearchParams({ query, offset: "0", limit: "100", locale: "nl-NL", searchDescription: "true", sortBy: "price", sortOrder: "ascending" });
  let data: Record<string, unknown> | null = null;
  // Nationwide search: omit postcode and distance from both Marktplaats endpoints.
  try {
    const response = await fetch("https://api.marktplaats.nl/v2/search?" + params.toString(), { headers, signal: AbortSignal.timeout(10000), cache: "no-store" });
    if (response.ok) data = await response.json() as Record<string, unknown>;
  } catch { /* Fall back to the legacy nationwide endpoint. */ }
  if (!data) {
    const legacy = new URLSearchParams({ query, limit: "100", offset: "0", sortBy: "PRICE", sortOrder: "INCREASING", searchInTitleAndDescription: "true" });
    const response = await fetch("https://www.marktplaats.nl/lrp/api/search?" + legacy.toString(), { headers, signal: AbortSignal.timeout(10000), cache: "no-store" });
    if (!response.ok) throw new Error("Marktplaats API HTTP " + response.status);
    data = await response.json() as Record<string, unknown>;
  }
  return parseMarktplaats(data, maxPrice);
}
function isConsoleHardwareOffer(title: string, query: string) {
  const consoleQuery = /\b(?:ps5|playstation[\s-]*5)\b/i.test(query);
  const asksForGames = /\b(?:games?|spel|spellen|videogames?)\b/i.test(query);
  if (!consoleQuery || asksForGames) return true;
  return /\b(?:console|slim|pro|digital\s+(?:edition|versie)|disc\s+(?:edition|versie)|cfi[\s-]?\d{4})\b/i.test(title)
    || /(?:\+|met|with|incl(?:uding)?|inclusief).{0,30}\b(?:\d+\s*)?controllers?\b/i.test(title);
}
function relevance(candidate: string, query: string) {
  const text = candidate.toLowerCase();
  const normalized = text.replace(/[\s-]/g, "");
  const code = query.match(/\b(?:rw\d{4}|a7[ivv]?|z\d{1,2}|eos\s*r\d{1,2}|wh-?1000xm\d)\b/i)?.[0]?.toLowerCase();
  if (code) return normalized.includes(code.replace(/[\s-]/g, "")) ? 1 : 0;

  const storage = query.match(/\b(16|32|64|128|256|512|1024|2048)\s?gb\b/i)?.[1];
  if (storage && !new RegExp("\\b" + storage + "\\s?gb\\b", "i").test(candidate)) return 0;
  const generation = query.match(/\b(?:gen(?:eration)?|generatie)\s*[.-]?\s*(\d+)\b/i)?.[1];
  if (generation && !new RegExp("\\b(?:gen(?:eration)?|generatie)\\s*[.-]?\\s*" + generation + "\\b", "i").test(candidate)) return 0;
  const diagonal = query.match(/\b(32|40|42|43|48|49|50|55|58|60|65|70|75|77|83|85|98)\s*(?:inch|inches|in)?\b/i)?.[1];
  if (diagonal && !new RegExp("\\b" + diagonal + "\\b", "i").test(candidate)) return 0;

  const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length >= 3);
  if (!tokens.length) return 1;
  return tokens.filter((x) => text.includes(x)).length / tokens.length;
}

export async function POST(request: NextRequest) {
  const token = process.env.TELEGRAM_TOKEN;
  if (!token) return NextResponse.json({ error: "TELEGRAM_TOKEN не настроен." }, { status: 503 });
  let body: { initData?: string; query?: string; maxPrice?: number; includeUsed?: boolean; includeNew?: boolean };
  try { body = await request.json() as typeof body; } catch { return NextResponse.json({ error: "Некорректный JSON." }, { status: 400 }); }
  const userId = verifyInitData(body.initData || "", token);
  if (!userId) return NextResponse.json({ error: "Откройте исследование внутри Telegram." }, { status: 401 });
  if (!rateAllowed(userId)) return NextResponse.json({ error: "Лимит исследований: не более 4 запусков в минуту." }, { status: 429 });
  const query = String(body.query || "").trim().replace(/\s+/g, " ");
  const requestedMaxPrice = Number(body.maxPrice);
  const maxPrice = Number.isFinite(requestedMaxPrice) && requestedMaxPrice >= 10
    ? requestedMaxPrice
    : 800;
  const includeUsed = body.includeUsed !== false;
  const includeNew = body.includeNew !== false;
  if (!includeUsed && !includeNew) return NextResponse.json({ error: "Выбери хотя бы один режим: б/у или новый товар." }, { status: 400 });
  if (query.length < 3 || query.length > 100) return NextResponse.json({ error: "Укажите точную модель или название (от 3 до 100 символов)." }, { status: 400 });
  // Gemini identifies the exact product and proposes Dutch/English phrases.
  // Its used-market phrases are now searched on Marktplaats, not only on external sites.
  const usedQuery = 'site:ebay.nl OR site:2dehands.be OR site:tweakers.net "' + query + '" tweedehands used occasion';
  const newQuery = '"' + query + '" prijs nieuw kopen Nederland price';
  const [primaryMarketResult, planResult] = await Promise.all([
    includeUsed ? searchMarktplaats(query, maxPrice).then((value) => ({ status: "fulfilled" as const, value }))
      .catch((reason) => ({ status: "rejected" as const, reason }))
      : Promise.resolve({ status: "fulfilled" as const, value: [] as Offer[] }),
    createAiResearchPlan(query, includeUsed, includeNew)
      .then((value) => ({ status: "fulfilled" as const, value }))
      .catch((reason) => {
        console.error("Deal Radar AI search planning failed:", reason);
        return { status: "rejected" as const, reason };
      }),
  ]);

  const plan = planResult.status === "fulfilled" ? planResult.value : null;
  const usedMarktplaatsQueries = includeUsed
    ? Array.from(new Set([query, ...(plan?.usedQueries || [])].map((term) => term.trim()).filter(Boolean))).slice(0, 4)
    : [];
  const extraMarketResults = await Promise.all(usedMarktplaatsQueries.slice(1).map((term) =>
    searchMarktplaats(term, maxPrice)
      .then((value) => ({ status: "fulfilled" as const, value }))
      .catch((reason) => ({ status: "rejected" as const, reason }))
  ));
  const marketParts = [
    ...(primaryMarketResult.status === "fulfilled" ? [primaryMarketResult.value] : []),
    ...extraMarketResults.filter((result) => result.status === "fulfilled").map((result) => result.value),
  ];
  const uniqueMarket = Array.from(new Map(
    marketParts.flat().map((offer) => [offer.url || (offer.title + "|" + offer.price), offer]),
  ).values());
  const marketFailures = [
    ...(primaryMarketResult.status === "rejected" ? [primaryMarketResult.reason] : []),
    ...extraMarketResults.filter((result) => result.status === "rejected").map((result) => result.reason),
  ];
  const marketResult = marketParts.length
    ? { status: "fulfilled" as const, value: uniqueMarket }
    : { status: "rejected" as const, reason: marketFailures[0] || new Error("Marktplaats search unavailable") };
  const usedSearchQueries = includeUsed
    ? [usedQuery, ...(plan?.usedQueries || []).map((term) => 'site:ebay.nl OR site:2dehands.be OR site:tweakers.net "' + term + '" tweedehands used occasion')]
    : [];
  const newSearchQueries = includeNew
    ? [newQuery, ...(plan?.newQueries || []).map((term) => '"' + term + '" prijs nieuw Nederland price')]
    : [];
  const searchQueries = Array.from(new Set([...usedSearchQueries, ...newSearchQueries])).slice(0, 5);
  const webSearchResults = await Promise.all(searchQueries.map((searchQuery) =>
    searchWeb(searchQuery).then((value) => ({ status: "fulfilled" as const, value }))
      .catch((reason) => ({ status: "rejected" as const, reason }))
  ));
  const searchRows = webSearchResults.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const uniqueRows = Array.from(new Map(searchRows.map((item) => [item.url, item])).values()).slice(0, 16);
  const allWeb = (await Promise.all(uniqueRows.map(fetchWebOffer))).filter((item): item is Offer => item !== null);
  const marktplaats = marketResult.status === "fulfilled" ? marketResult.value : [];

  const marketAiCandidates = marktplaats
    .map((offer, index) => ({ offer, id: "mp_" + index, score: relevance(offer.title + " " + offer.description, query) }))
    .sort((a, b) => b.score - a.score || a.offer.price - b.offer.price)
    .slice(0, 20);
  const webAiCandidates = allWeb.map((offer, index) => ({ offer, id: "web_" + index }));
  const aiCandidates = [
    ...marketAiCandidates.map(({ offer, id }) => ({ id, title: offer.title, description: offer.description, price: offer.price, source: offer.source, condition: offer.condition })),
    ...webAiCandidates.map(({ offer, id }) => ({ id, title: offer.title, description: offer.description, price: offer.price, source: offer.source, condition: offer.condition })),
  ];
  let aiReview = null;
  if (isAiResearchEnabled() && aiCandidates.length) {
    try {
      aiReview = await reviewAiOffers(query, aiCandidates);
    } catch (error) {
      console.error("Deal Radar AI offer review failed:", error);
    }
  }
  const verdicts = new Map((aiReview?.offers || []).map((verdict) => [verdict.id, verdict]));
  const annotate = (offer: Offer, id: string): Offer => {
    const verdict = verdicts.get(id);
    if (verdict) {
      return {
        ...offer,
        condition: verdict.condition === "unknown" ? offer.condition : verdict.condition,
        matchType: verdict.matchType,
        matchConfidence: verdict.confidence,
        matchReason: verdict.reason,
      };
    }
    const score = relevance(offer.title + " " + offer.description, query);
    return {
      ...offer,
      matchType: score >= 0.45 ? "exact" : "unrelated",
      matchConfidence: score,
      matchReason: score >= 0.45 ? "Совпадение по поисковому запросу; AI-проверка не дала отдельного вердикта" : "Недостаточное совпадение с запросом",
    };
  };
  const marketByIndex = new Map(marketAiCandidates.map(({ offer, id }) => [id, annotate(offer, id)]));
  const relevantMarket = marktplaats
    .map((offer, index) => marketByIndex.get("mp_" + index) || annotate(offer, "mp_unreviewed_" + index))
    .filter((offer) => offer.matchType === "exact" && (offer.matchConfidence ?? 0) >= 0.45
      && isConsoleHardwareOffer(offer.title, query));
  const relevantWeb = webAiCandidates
    .map(({ offer, id }) => annotate(offer, id))
    .filter((offer) => ["exact", "variant", "related"].includes(offer.matchType || "unrelated")
      && (offer.matchConfidence ?? 0) >= 0.45
      && isConsoleHardwareOffer(offer.title, query));
  const exactWeb = relevantWeb.filter((offer) => offer.matchType === "exact");
  const usedWeb = exactWeb.filter((offer) => offer.condition === "used");
  const newWeb = exactWeb.filter((offer) => offer.condition === "new");
  const mpUsedPrices = relevantMarket.filter((offer) => offer.condition === "used").map((offer) => offer.price);
  // Use Marktplaats alone when there are enough local comparables; external used prices only fill small samples.
  const usedPrices = mpUsedPrices.length >= 3 ? mpUsedPrices : [...mpUsedPrices, ...usedWeb.map((offer) => offer.price)];
  const newPrices = [
    ...relevantMarket.filter((offer) => offer.condition === "new").map((offer) => offer.price),
    ...newWeb.map((offer) => offer.price),
  ];
  const usedMedian = median(usedPrices);
  const localUsedReferencePrice = conservativeQuartile(usedPrices);
  const newMedian = median(newPrices);
  let marketValuation = null;
  if (isAiResearchEnabled()) {
    try {
      marketValuation = await researchMarketValuation(
        query,
        [...relevantMarket, ...relevantWeb].map((offer) => ({
          title: offer.title, price: offer.price, source: offer.source,
          condition: offer.condition, url: offer.url,
        })),
        includeUsed,
        includeNew,
      );
    } catch (error) {
      console.warn("Deal Radar grounded market valuation failed:", error);
    }
  }
  // Local comparable listings remain the primary evidence. Gemini can refine the
  // estimate modestly, or provide a conservative fallback when local samples are thin.
  const aiUsedPrice = marketValuation?.confidence >= 0.55
    ? marketValuation.estimatedUsedPrice
    : null;
  const usedReferencePrice = localUsedReferencePrice !== null && aiUsedPrice !== null
    ? Number((localUsedReferencePrice * 0.75 + aiUsedPrice * 0.25).toFixed(2))
    : localUsedReferencePrice !== null
      ? localUsedReferencePrice
      : aiUsedPrice !== null
        ? Number((aiUsedPrice * 0.90).toFixed(2))
        : null;
  const groundedNewPrice = marketValuation?.confidence >= 0.55
    ? marketValuation.estimatedNewPrice
    : null;
  const newRetailReference = newMedian ?? groundedNewPrice;
  const expectedResale = usedReferencePrice !== null ? usedReferencePrice * 0.95 : newRetailReference !== null ? newRetailReference * 0.62 : null;
  const netResale = expectedResale === null ? null : expectedResale * 0.96 * 0.92 - 10;
  const listings = relevantMarket.map((offer) => {
    const profit = netResale === null ? null : Number((netResale - offer.price).toFixed(2));
    const roi = profit === null || offer.price <= 0 ? null : profit / offer.price;
    const status = usedPrices.length >= 8 && profit !== null && profit >= 50 && roi !== null && roi >= 0.30 ? "strong"
      : usedPrices.length >= 3 && profit !== null && profit >= 40 && roi !== null && roi >= 0.20 ? "good" : "candidate";
    return { ...offer, estimatedProfit: profit, profitRoi: roi, status };
  }).sort((a, b) => (b.estimatedProfit ?? -Infinity) - (a.estimatedProfit ?? -Infinity));

  const exactCount = relevantMarket.length + exactWeb.length;
  const variantCount = relevantWeb.filter((offer) => offer.matchType === "variant").length;
  const warnings = [
    ...(marketResult.status === "rejected" && includeUsed ? ["Не удалось получить объявления Marktplaats: " + String(marketResult.reason)] : []),
    ...(webSearchResults.some((result) => result.status === "rejected") ? ["Некоторые поисковые запросы временно не сработали; показаны доступные результаты."] : []),
    ...(usedPrices.length < 3 ? ["Мало актуальных б/у сравнений: не считайте прибыль подтверждённой."] : []),
    ...(!isAiResearchEnabled() ? ["Ручной веб-отчёт работает без облачного AI API. Бесплатная локальная AI-проверка выполняется сканером на вашем Mac через Ollama."] : []),
    ...(isAiResearchEnabled() && !aiReview ? ["AI-проверка совпадений временно недоступна; результаты отфильтрованы резервными правилами."] : []),
    ...(isAiResearchEnabled() && !marketValuation ? ["Gemini Google Search не смог подтвердить отдельную рыночную оценку; использованы найденные цены объявлений."] : []),
    "Цены — цены предложений, не подтверждённые цены закрытых сделок. Проверяйте товар и продавца перед покупкой.",
  ];

  return NextResponse.json({
    query, maxPrice, includeUsed, includeNew, checkedAt: new Date().toISOString(),
    sources: {
      marktplaats: { count: relevantMarket.length, medianPrice: median(relevantMarket.map((offer) => offer.price)) },
      otherUsed: { count: usedWeb.length, medianPrice: median(usedWeb.map((offer) => offer.price)) },
      newRetail: { count: newWeb.length, medianPrice: newMedian },
      geminiGrounded: { usedPrice: marketValuation?.estimatedUsedPrice ?? null, newPrice: marketValuation?.estimatedNewPrice ?? null, confidence: marketValuation?.confidence ?? 0 },
    },
    ai: {
      enabled: isAiResearchEnabled(),
      available: Boolean(plan || aiReview || marketValuation),
      model: getAiResearchModel(),
      productSummary: plan?.productSummary || "",
      keyAttributes: plan?.keyAttributes || [],
      marketSummary: marketValuation?.rationale || aiReview?.summary || "",
      valuation: marketValuation ? {
        estimatedUsedPrice: marketValuation.estimatedUsedPrice,
        estimatedNewPrice: marketValuation.estimatedNewPrice,
        confidence: marketValuation.confidence,
        sampleCount: marketValuation.sampleCount,
        rationale: marketValuation.rationale,
        googleSearchQueries: marketValuation.googleSearchQueries,
        groundedSources: marketValuation.groundedSources,
      } : null,
      exactMatches: exactCount,
      variants: variantCount,
      reviewedOffers: aiReview?.offers.length || 0,
      googleSearchQueries: plan?.googleSearchQueries || [],
      groundedSources: plan?.groundedSources || [],
    },
    searchQueries,
    marktplaatsSearchQueries: usedMarktplaatsQueries,
    usedMedian, usedReferencePrice, newMedian,
    expectedResalePrice: expectedResale === null ? null : Number(expectedResale.toFixed(2)),
    netResalePrice: netResale === null ? null : Number(netResale.toFixed(2)),
    sampleCount: usedPrices.length, listings, webOffers: relevantWeb.slice(0, 12), warnings,
  }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
