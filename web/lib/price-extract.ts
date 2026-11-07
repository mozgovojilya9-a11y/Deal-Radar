/**
 * Price extraction from full HTML pages.
 * Order of trust: JSON-LD Product/Offer -> microdata -> meta tags -> visible text near the product name.
 */

export type OfferCondition = "new" | "used" | "refurbished" | "unknown";
export type ExtractMethod = "jsonld" | "microdata" | "meta" | "text";

export type ExtractedOffer = {
  name: string;
  price: number;
  currency: "EUR";
  url: string;
  condition: OfferCondition;
  availability: "in_stock" | "out_of_stock" | "unknown";
  method: ExtractMethod;
};

const MIN_PRICE = 5;
const MAX_PRICE = 100000;

export function decodeHtml(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;|&#160;/g, " ").replace(/&euro;/g, "€")
    .replace(/&#(\d+);/g, (_, n: string) => { try { return String.fromCodePoint(Number(n)); } catch { return " "; } })
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch { return " "; } });
}

export function stripHtml(value: string): string {
  return decodeHtml(value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ").trim();
}

export function htmlAttribute(tag: string, name: string): string {
  const match = tag.match(new RegExp("\\b" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i"));
  const value = match ? (match[1] ?? match[2] ?? match[3] ?? "") : "";
  return value ? decodeHtml(value) : "";
}

/**
 * Parses European and English number formats:
 * "1.299,00", "1,299.00", "419", "419,-", "419.-", "419,95", "1 299,00", "EUR419.00".
 */
export function parsePriceNumber(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= MIN_PRICE && raw <= MAX_PRICE ? Math.round(raw * 100) / 100 : null;
  if (raw == null) return null;
  let value = String(raw).replace(/[€\s\u00a0\u202f]|eur(?:o|os)?/gi, "").replace(/[,.]-+$/, "").replace(/-+$/, "");
  if (!/^\d[\d.,']*$/.test(value)) return null;
  value = value.replace(/'/g, "");
  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // The right-most separator is the decimal separator.
    value = lastComma > lastDot ? value.replace(/\./g, "").replace(",", ".") : value.replace(/,/g, "");
  } else if (lastComma >= 0) {
    value = /,\d{3}$/.test(value) && !/,\d{3},/.test(value) && value.split(",")[0].length <= 3 && value.split(",").length === 2 && !/^0/.test(value)
      ? value.replace(",", "") // "1,299" thousands
      : value.replace(/,(?=\d{3}(?:,|$))/g, "").replace(",", ".");
  } else if (lastDot >= 0) {
    if (/^\d{1,3}(?:\.\d{3})+$/.test(value)) value = value.replace(/\./g, ""); // "1.299"
  }
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= MIN_PRICE && amount <= MAX_PRICE ? Math.round(amount * 100) / 100 : null;
}

const TEXT_PRICE_RE = /(?:€|eur(?![a-z])|euro(?![a-z]))\s*([0-9][0-9.,'\s]{0,12}(?:[,.]-{1,2}|[,.]\d{2})?)|([0-9][0-9.,'\s]{0,12}(?:[,.]-{1,2}|[,.]\d{2})?)\s*(?:€|eur(?![a-z])|euro(?![a-z]))/gi;

/** Euro prices visible in text, with the character position of each match. */
export function textPrices(text: string): Array<{ price: number; index: number }> {
  const results: Array<{ price: number; index: number }> = [];
  for (const match of text.matchAll(TEXT_PRICE_RE)) {
    const raw = (match[1] || match[2] || "").trim().replace(/\s+(?=\d{3}\b)/g, "").replace(/\s.*$/, "");
    const price = parsePriceNumber(raw);
    if (price !== null) results.push({ price, index: match.index ?? 0 });
  }
  return results;
}

function schemaCondition(value: unknown): OfferCondition {
  const text = String(value || "").toLowerCase();
  if (text.includes("refurbished")) return "refurbished";
  if (text.includes("used") || text.includes("damaged")) return "used";
  if (text.includes("new")) return "new";
  return "unknown";
}

function schemaAvailability(value: unknown): ExtractedOffer["availability"] {
  const text = String(value || "").toLowerCase();
  if (/instock|limitedavailability|onlineonly|presale|preorder/.test(text)) return "in_stock";
  if (/outofstock|soldout|discontinued/.test(text)) return "out_of_stock";
  return "unknown";
}

function typeIncludes(node: Record<string, unknown>, type: string): boolean {
  const value = node["@type"];
  return Array.isArray(value) ? value.some((item) => String(item).toLowerCase() === type) : String(value || "").toLowerCase() === type;
}

function absoluteUrl(value: unknown, base: string): string {
  try {
    const url = new URL(String(value || ""), base);
    return url.protocol === "https:" ? url.href : base;
  } catch {
    return base;
  }
}

function offersFromJsonLd(html: string, pageUrl: string, pageName: string): ExtractedOffer[] {
  const found: ExtractedOffer[] = [];
  const scripts = html.match(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>[\s\S]*?<\/script>/gi) || [];
  const readOffer = (product: Record<string, unknown>, offer: Record<string, unknown>) => {
    const spec = (offer.priceSpecification && typeof offer.priceSpecification === "object"
      ? (Array.isArray(offer.priceSpecification) ? offer.priceSpecification[0] : offer.priceSpecification)
      : {}) as Record<string, unknown>;
    const currency = String(offer.priceCurrency || spec.priceCurrency || product.priceCurrency || "").toUpperCase();
    if (currency && currency !== "EUR") return;
    const price = parsePriceNumber((offer.price ?? offer.lowPrice ?? spec.price ?? null) as string | number | null);
    if (price === null) return;
    found.push({
      name: String(product.name || pageName || "").slice(0, 220),
      price,
      currency: "EUR",
      url: absoluteUrl(offer.url || product.url || product["@id"], pageUrl),
      condition: schemaCondition(offer.itemCondition || product.itemCondition),
      availability: schemaAvailability(offer.availability),
      method: "jsonld",
    });
  };
  const visit = (value: unknown, depth: number) => {
    if (depth > 9 || value == null) return;
    if (Array.isArray(value)) { value.forEach((item) => visit(item, depth + 1)); return; }
    if (typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    if (typeIncludes(node, "product") || typeIncludes(node, "productgroup") || (node.offers && node.name)) {
      const offers = node.offers;
      const list = Array.isArray(offers) ? offers : offers && typeof offers === "object" ? [offers] : [];
      for (const raw of list) {
        if (!raw || typeof raw !== "object") continue;
        const offer = raw as Record<string, unknown>;
        if (typeIncludes(offer, "aggregateoffer") && Array.isArray(offer.offers) && offer.offers.length) {
          for (const inner of offer.offers) if (inner && typeof inner === "object") readOffer(node, inner as Record<string, unknown>);
        } else {
          readOffer(node, offer);
        }
      }
    }
    for (const [key, child] of Object.entries(node)) {
      if (key !== "offers" && child && typeof child === "object") visit(child, depth + 1);
    }
  };
  for (const script of scripts) {
    const body = script.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>$/i, "").trim()
      .replace(/^<!\[CDATA\[|\]\]>$/g, "");
    try { visit(JSON.parse(body), 0); } catch { /* malformed JSON-LD is ignored */ }
  }
  return found;
}

function offersFromMicrodata(html: string, pageUrl: string, pageName: string): ExtractedOffer[] {
  const found: ExtractedOffer[] = [];
  const currencyTag = html.match(/<[^>]+itemprop\s*=\s*["']?pricecurrency["']?[^>]*>/i)?.[0] || "";
  const currency = (htmlAttribute(currencyTag, "content") || "").toUpperCase();
  if (currency && currency !== "EUR") return found;
  const conditionTag = html.match(/<[^>]+itemprop\s*=\s*["']?itemcondition["']?[^>]*>/i)?.[0] || "";
  const condition = schemaCondition(htmlAttribute(conditionTag, "content") || htmlAttribute(conditionTag, "href"));
  for (const match of html.matchAll(/<[^>]+itemprop\s*=\s*["']?price["']?[^>]*>([^<]{0,40})/gi)) {
    const price = parsePriceNumber(htmlAttribute(match[0], "content") || match[1]);
    if (price !== null) {
      found.push({ name: pageName, price, currency: "EUR", url: pageUrl, condition, availability: "unknown", method: "microdata" });
    }
    if (found.length >= 3) break;
  }
  return found;
}

function offersFromMeta(html: string, pageUrl: string, pageName: string): ExtractedOffer[] {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  const keyOf = (tag: string) => (htmlAttribute(tag, "property") || htmlAttribute(tag, "name") || htmlAttribute(tag, "itemprop")).toLowerCase();
  const currencyTag = tags.find((tag) => /(?:^|:)price:currency$|^pricecurrency$|^product:price:currency$/.test(keyOf(tag)));
  const currency = currencyTag ? htmlAttribute(currencyTag, "content").trim().toUpperCase() : "";
  if (currency && currency !== "EUR") return [];
  const conditionTag = tags.find((tag) => /product:condition|og:condition/.test(keyOf(tag)));
  const condition = schemaCondition(conditionTag ? htmlAttribute(conditionTag, "content") : "");
  const found: ExtractedOffer[] = [];
  for (const tag of tags) {
    if (!/^(?:product:price:amount|og:price:amount|product:sale_price:amount|twitter:data1|price)$/.test(keyOf(tag))) continue;
    const price = parsePriceNumber(htmlAttribute(tag, "content"));
    if (price !== null) found.push({ name: pageName, price, currency: "EUR", url: pageUrl, condition, availability: "unknown", method: "meta" });
  }
  return found.slice(0, 2);
}

/** Prices shown right after the main heading. Used only when no structured data exists. */
function offersFromText(html: string, pageUrl: string, pageName: string): ExtractedOffer[] {
  const body = html.replace(/<(header|nav|footer)\b[\s\S]*?<\/\1>/gi, " ");
  const headingIndex = body.search(/<h1\b/i);
  const fragment = headingIndex >= 0 ? body.slice(headingIndex, headingIndex + 60000) : body.slice(0, 60000);
  const text = stripHtml(fragment).slice(0, 2500);
  const prices = textPrices(text).filter((item) => item.index < 1800);
  if (!prices.length) return [];
  // The first price after the heading is the product price on product pages;
  // struck-through "van/was" prices appear before "nu/voor".
  const nowPrice = prices.find((item) => /\b(?:nu|voor|now|prijs|price)\s*:?\s*$/i.test(text.slice(Math.max(0, item.index - 14), item.index))) || prices[0];
  return [{ name: pageName, price: nowPrice.price, currency: "EUR", url: pageUrl, condition: "unknown", availability: "unknown", method: "text" }];
}

export type PageExtraction = {
  title: string;
  heading: string;
  excerpt: string;
  offers: ExtractedOffer[];
};

export function extractPage(html: string, pageUrl: string): PageExtraction {
  const title = stripHtml(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").slice(0, 220);
  const heading = stripHtml(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "").slice(0, 220);
  const ogTitle = htmlAttribute((html.match(/<meta\b[^>]*property\s*=\s*["']og:title["'][^>]*>/i) || [""])[0], "content");
  const pageName = heading || ogTitle || title;
  let offers = offersFromJsonLd(html, pageUrl, pageName);
  if (!offers.length) offers = offersFromMicrodata(html, pageUrl, pageName);
  if (!offers.length) offers = offersFromMeta(html, pageUrl, pageName);
  if (!offers.length) offers = offersFromText(html, pageUrl, pageName);
  const unique = new Map<string, ExtractedOffer>();
  for (const offer of offers) unique.set(offer.url + "|" + offer.name + "|" + offer.price + "|" + offer.condition, offer);
  const excerptSource = headingIndexText(html);
  return { title, heading: pageName, excerpt: excerptSource.slice(0, 1200), offers: [...unique.values()].slice(0, 40) };
}

function headingIndexText(html: string): string {
  const index = html.search(/<h1\b/i);
  return stripHtml(index >= 0 ? html.slice(index, index + 40000) : html.slice(0, 40000));
}
