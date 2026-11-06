import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Condition = "used" | "new" | "unknown";
type Offer = { title: string; price: number; url: string; source: string; condition: Condition; kind: "marktplaats" | "web" };
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
    const response = await fetch(row.url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; DealRadarResearch/1.0)", Accept: "text/html" }, signal: AbortSignal.timeout(7000), redirect: "follow", cache: "no-store" });
    if (response.ok && safeUrl(response.url)) html = (await response.text()).slice(0, 700000);
  } catch { /* Search result snippet can contain the price. */ }
  const structured = structuredPrices(html);
  const price = structured[0] ?? textPrices(base + " " + stripHtml(html).slice(0, 6000))[0] ?? null;
  if (price === null || BAD_WORDS.test(base)) return null;
  return { title: row.title || host, price, url: row.url, source: host, condition: conditionFor(host, base), kind: "web" };
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
    result.push({ title, price, url: listingUrl, source: "marktplaats.nl", condition, kind: "marktplaats" });
  }
  return result;
}
async function searchMarktplaats(query: string, maxPrice: number) {
  const headers = { "User-Agent": "Mozilla/5.0 (compatible; DealRadarResearch/1.0)", Accept: "application/json", "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8" };
  const postcode = process.env.MARKTPLAATS_POSTCODE || "";
  const params = new URLSearchParams({ query, offset: "0", limit: "100", locale: "nl-NL", searchDescription: "true", sortBy: "default", sortOrder: "descending" });
  if (/^\d{4}[A-Z]{2}$/i.test(postcode)) { params.set("postCode", postcode.toUpperCase()); params.set("distance", "50000"); }
  let data: Record<string, unknown> | null = null;
  try {
    const response = await fetch("https://api.marktplaats.nl/v2/search?" + params.toString(), { headers, signal: AbortSignal.timeout(10000), cache: "no-store" });
    if (response.ok) data = await response.json() as Record<string, unknown>;
  } catch { /* Fall back below. */ }
  if (!data) {
    const legacy = new URLSearchParams({ query, limit: "100", offset: "0", sortBy: "SORT_INDEX", sortOrder: "DECREASING", searchInTitleAndDescription: "true" });
    if (postcode) { legacy.set("postcode", postcode); legacy.set("distanceMeters", "50000"); }
    const response = await fetch("https://www.marktplaats.nl/lrp/api/search?" + legacy.toString(), { headers, signal: AbortSignal.timeout(10000), cache: "no-store" });
    if (!response.ok) throw new Error("Marktplaats API HTTP " + response.status);
    data = await response.json() as Record<string, unknown>;
  }
  return parseMarktplaats(data, maxPrice);
}
function relevance(title: string, query: string) {
  const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length >= 3);
  if (!tokens.length) return 1;
  const text = title.toLowerCase();
  const code = query.match(/\b(?:rw\d{4}|a7[ivv]?|z\d{1,2}|eos\s*r\d{1,2}|wh-?1000xm\d)\b/i)?.[0]?.toLowerCase();
  if (code && text.replace(/[\s-]/g, "").includes(code.replace(/[\s-]/g, ""))) return 1;
  return tokens.filter((x) => text.includes(x)).length / tokens.length;
}

export async function POST(request: NextRequest) {
  const token = process.env.TELEGRAM_TOKEN;
  if (!token) return NextResponse.json({ error: "TELEGRAM_TOKEN не настроен." }, { status: 503 });
  let body: { initData?: string; query?: string; maxPrice?: number };
  try { body = await request.json() as typeof body; } catch { return NextResponse.json({ error: "Некорректный JSON." }, { status: 400 }); }
  const userId = verifyInitData(body.initData || "", token);
  if (!userId) return NextResponse.json({ error: "Откройте исследование внутри Telegram." }, { status: 401 });
  if (!rateAllowed(userId)) return NextResponse.json({ error: "Лимит исследований: не более 4 запусков в минуту." }, { status: 429 });
  const query = String(body.query || "").trim().replace(/\s+/g, " ");
  const maxPrice = Math.min(800, Math.max(10, Number(body.maxPrice) || 800));
  if (query.length < 3 || query.length > 100) return NextResponse.json({ error: "Укажите точную модель или название (от 3 до 100 символов)." }, { status: 400 });
  const usedQuery = 'site:marktplaats.nl OR site:ebay.nl OR site:2dehands.be OR site:tweakers.net "' + query + '" tweedehands used occasion';
  const newQuery = '"' + query + '" prijs nieuw kopen Nederland price';
  const [marketResult, usedResult, newResult] = await Promise.allSettled([
    searchMarktplaats(query, maxPrice), searchWeb(usedQuery), searchWeb(newQuery),
  ]);
  const marktplaats = marketResult.status === "fulfilled" ? marketResult.value : [];
  const searchRows = [
    ...(usedResult.status === "fulfilled" ? usedResult.value : []),
    ...(newResult.status === "fulfilled" ? newResult.value : []),
  ];
  const uniqueRows = Array.from(new Map(searchRows.map((x) => [x.url, x])).values()).slice(0, 12);
  const allWeb = (await Promise.all(uniqueRows.map(fetchWebOffer))).filter((x): x is Offer => x !== null);
  const relevantMarket = marktplaats.filter((x) => relevance(x.title, query) >= 0.30);
  const relevantWeb = allWeb.filter((x) => relevance(x.title, query) >= 0.25);
  const usedWeb = relevantWeb.filter((x) => x.condition === "used");
  const newWeb = relevantWeb.filter((x) => x.condition === "new");
  const usedPrices = [...relevantMarket.filter((x) => x.condition === "used").map((x) => x.price), ...usedWeb.map((x) => x.price)];
  const newPrices = [...relevantMarket.filter((x) => x.condition === "new").map((x) => x.price), ...newWeb.map((x) => x.price)];
  const usedMedian = median(usedPrices);
  const newMedian = median(newPrices);
  const expectedResale = usedMedian !== null ? usedMedian * 0.95 : newMedian !== null ? newMedian * 0.62 : null;
  const netResale = expectedResale === null ? null : expectedResale * 0.96 * 0.92 - 10;
  const listings = relevantMarket.map((x) => {
    const profit = netResale === null ? null : Number((netResale - x.price).toFixed(2));
    const roi = profit === null || x.price <= 0 ? null : profit / x.price;
    const status = usedPrices.length >= 8 && profit !== null && profit >= 50 && roi !== null && roi >= 0.30 ? "strong"
      : usedPrices.length >= 3 && profit !== null && profit >= 40 && roi !== null && roi >= 0.20 ? "good" : "candidate";
    return { ...x, estimatedProfit: profit, profitRoi: roi, status };
  }).sort((a, b) => (b.estimatedProfit ?? -Infinity) - (a.estimatedProfit ?? -Infinity));
  return NextResponse.json({
    query, maxPrice, checkedAt: new Date().toISOString(),
    sources: {
      marktplaats: { count: relevantMarket.length, medianPrice: median(relevantMarket.map((x) => x.price)) },
      otherUsed: { count: usedWeb.length, medianPrice: median(usedWeb.map((x) => x.price)) },
      newRetail: { count: newWeb.length, medianPrice: newMedian },
    },
    usedMedian, newMedian,
    expectedResalePrice: expectedResale === null ? null : Number(expectedResale.toFixed(2)),
    netResalePrice: netResale === null ? null : Number(netResale.toFixed(2)),
    sampleCount: usedPrices.length, listings, webOffers: relevantWeb.slice(0, 12),
    warnings: [
      ...(marketResult.status === "rejected" ? ["Не удалось получить объявления Marktplaats: " + String(marketResult.reason)] : []),
      ...(usedResult.status === "rejected" || newResult.status === "rejected" ? ["Веб-поиск временно ограничен; доступные цены всё равно показаны."] : []),
      ...(usedPrices.length < 3 ? ["Мало актуальных б/у сравнений: не считайте прибыль подтверждённой."] : []),
      "Цены — цены предложений, не подтверждённые цены закрытых сделок. Проверяйте товар и продавца перед покупкой.",
    ],
  }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
