/**
 * Google Search through the Gemini API (grounding). Works from server IPs (Vercel, GitHub Actions)
 * where HTML search engines answer with captchas or 403.
 *
 * Only prices inside text segments that Google links to a specific web source
 * (`groundingSupports` -> `groundingChunks`) are accepted. Ungrounded model text is ignored, so
 * a price can never come from the model's memory.
 */
import { textPrices } from "./price-extract";
import type { OfferCondition } from "./price-extract";

export type GroundedOffer = {
  title: string;
  price: number;
  url: string;
  domain: string;
  condition: OfferCondition;
  evidence: string;
};

export type GroundedResult = { offers: GroundedOffer[]; queries: string[]; sourceCount: number; error?: string };

type GroundingMetadata = {
  webSearchQueries?: string[];
  groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
  groundingSupports?: Array<{ segment?: { text?: string }; groundingChunkIndices?: number[] }>;
};

const MARKETPLACE = /(?:^|\.)(?:marktplaats\.nl|2dehands\.be|2ememain\.be)$/i;

function conditionOf(text: string): OfferCondition {
  if (/\b(refurbished|refurb|gereviseerd|renewed|tweedekans)\b/i.test(text)) return "refurbished";
  if (/\b(gebruikt|tweedehands|used|gebraucht|occasion|2e hands)\b/i.test(text)) return "used";
  if (/\b(nieuw|new|neu)\b/i.test(text)) return "new";
  return "unknown";
}

/** Grounding chunk links are Google redirects; resolve them to the real page when possible. */
async function resolveRedirect(uri: string, deadline: number): Promise<string> {
  if (!/^https:\/\/vertexaisearch\.cloud\.google\.com\//.test(uri)) return uri;
  try {
    const response = await fetch(uri, { redirect: "manual", signal: AbortSignal.timeout(Math.max(800, Math.min(4000, deadline - Date.now()))), cache: "no-store" });
    const location = response.headers.get("location");
    if (location && /^https:\/\//.test(location)) return location;
  } catch { /* keep the Google redirect: it still leads to the source */ }
  return uri;
}

export async function groundedMarketOffers(name: string, deadline: number, segments: { new: boolean; used: boolean; refurbished: boolean }): Promise<GroundedResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { offers: [], queries: [], sourceCount: 0, error: "GEMINI_API_KEY не настроен" };
  const wanted = [segments.new ? "nieuw in Nederlandse webwinkels (Coolblue, bol.com, MediaMarkt, Amazon.nl, merkwinkel)" : "",
    segments.used ? "tweedehands buiten Marktplaats (eBay, Kleinanzeigen, Tweakers V&A, andere)" : "",
    segments.refurbished ? "refurbished (Back Market, Refurbed, andere)" : ""].filter(Boolean).join("; ");
  const prompt = [
    `Zoek actuele prijzen in euro voor exact dit product: "${name}".`,
    `Segmenten: ${wanted}. Gebruik geen Marktplaats of 2dehands.`,
    "Geef alleen prijzen die je in de zoekresultaten ziet. Eén regel per aanbieding, exact in dit formaat:",
    `${name} | <winkel> | <nieuw|gebruikt|refurbished> | €<prijs>`,
    "Herhaal in elke regel de volledige productnaam inclusief generatie, geheugen en variant. Geen andere tekst.",
  ].join("\n");
  const model = process.env.GEMINI_SEARCH_MODEL || process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  let metadata: GroundingMetadata | undefined;
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0, maxOutputTokens: 900 },
      }),
      signal: AbortSignal.timeout(Math.max(3000, Math.min(20000, deadline - Date.now() - 2000))),
      cache: "no-store",
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { offers: [], queries: [], sourceCount: 0, error: "Gemini Google Search HTTP " + response.status + (body ? ": " + body.slice(0, 120) : "") };
    }
    const payload = await response.json() as { candidates?: Array<{ groundingMetadata?: GroundingMetadata }> };
    metadata = payload.candidates?.[0]?.groundingMetadata;
  } catch (error) {
    return { offers: [], queries: [], sourceCount: 0, error: "Gemini Google Search: " + (error instanceof Error ? error.message : String(error)) };
  }
  const chunks = metadata?.groundingChunks || [];
  const supports = metadata?.groundingSupports || [];
  if (!chunks.length) return { offers: [], queries: metadata?.webSearchQueries || [], sourceCount: 0, error: "Google-поиск не вернул источников" };

  const resolved = new Map<number, Promise<string>>();
  const urlFor = (index: number) => {
    if (!resolved.has(index)) resolved.set(index, resolveRedirect(String(chunks[index]?.web?.uri || ""), deadline));
    return resolved.get(index)!;
  };
  const offers: GroundedOffer[] = [];
  for (const support of supports) {
    const text = String(support.segment?.text || "").trim();
    const prices = textPrices(text).map((item) => item.price);
    const indices = (support.groundingChunkIndices || []).filter((index) => chunks[index]?.web?.uri);
    if (prices.length !== 1 || !indices.length) continue; // one segment = one offer; ambiguous segments are skipped
    // Prefer the source whose domain is named in the segment ("Coolblue | nieuw | €529").
    const named = indices.find((index) => {
      const domain = String(chunks[index]?.web?.title || "").toLowerCase().replace(/^www\./, "");
      const brand = domain.split(".")[0];
      return brand.length >= 3 && text.toLowerCase().includes(brand);
    });
    const index = named ?? indices[0];
    const domain = String(chunks[index]?.web?.title || "").toLowerCase().replace(/^www\./, "");
    if (!domain || MARKETPLACE.test(domain)) continue;
    const url = await urlFor(index);
    if (MARKETPLACE.test((() => { try { return new URL(url).hostname; } catch { return ""; } })())) continue;
    offers.push({
      title: text.split("|")[0].trim().slice(0, 200) || name,
      price: prices[0],
      url,
      domain: (() => { try { const host = new URL(url).hostname.replace(/^www\./, ""); return /vertexaisearch/.test(host) ? domain : host; } catch { return domain; } })(),
      condition: conditionOf(text),
      evidence: text.slice(0, 240),
    });
  }
  return { offers, queries: metadata?.webSearchQueries || [], sourceCount: chunks.length };
}
