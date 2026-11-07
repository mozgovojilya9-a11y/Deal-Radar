import { decodeHtml, htmlAttribute, stripHtml } from "./price-extract";

export type SearchResult = { title: string; url: string; snippet: string; provider: string; /** Full page text when the provider already fetched the page (Tavily). */ rawContent?: string };
export type SearchAttempt = { provider: string; query: string; ok: boolean; count: number; error?: string; ms: number };

type Provider = {
  name: string;
  enabled: () => boolean;
  search: (query: string, signal: AbortSignal) => Promise<SearchResult[]>;
};

const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const HTML_HEADERS = {
  "User-Agent": BROWSER_UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8",
};

export function safeWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && host.includes(".") && !host.includes("localhost")
      && !host.endsWith(".local") && !host.endsWith(".internal") && !host.endsWith(".lan")
      && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) && !host.startsWith("[")
      && (!url.port || url.port === "443");
  } catch {
    return false;
  }
}

const SEARCH_ENGINE_HOSTS = /(?:^|\.)(?:bing\.com|duckduckgo\.com|brave\.com|yahoo\.com|google\.[a-z.]+|startpage\.com|microsoft\.com\/en-us\/bing)$/;

/** Decode redirect wrappers used by search engines, including Bing's base64 "u=a1..." links. */
export function unwrapSearchUrl(raw: string, base: string): string {
  try {
    const url = new URL(decodeHtml(raw.trim()), base);
    const host = url.hostname.toLowerCase();
    if (/bing\.com$/.test(host) && url.searchParams.get("u")) {
      const encoded = String(url.searchParams.get("u")).replace(/^a1/, "");
      const decoded = Buffer.from(encoded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
      if (safeWebUrl(decoded)) return decoded;
    }
    for (const key of ["uddg", "url", "q", "RU"]) {
      const target = url.searchParams.get(key);
      if (target && /^https?:/i.test(target) && SEARCH_ENGINE_HOSTS.test(host)) return new URL(target).href;
    }
    const yahoo = url.pathname.match(/\/RU=([^/]+)\//);
    if (yahoo) return decodeURIComponent(yahoo[1]);
    return url.href;
  } catch {
    return "";
  }
}

function cleanResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  return results.filter((item) => {
    if (!item.title || !safeWebUrl(item.url)) return false;
    const host = new URL(item.url).hostname.toLowerCase();
    if (SEARCH_ENGINE_HOSTS.test(host) || /(?:^|\.)(?:youtube\.com|imdb\.com|wikipedia\.org|facebook\.com|instagram\.com|tiktok\.com|reddit\.com|pinterest\.[a-z]+)$/.test(host)) return false;
    const key = item.url.replace(/#.*$/, "").replace(/\/$/, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}

async function getText(url: string, signal: AbortSignal, headers: Record<string, string> = HTML_HEADERS): Promise<string> {
  const response = await fetch(url, { headers, signal, cache: "no-store", redirect: "follow" });
  if (response.status === 429 || response.status === 403 || response.status === 202) {
    throw new Error("HTTP " + response.status + " (лимит или защита от ботов)");
  }
  if (!response.ok) throw new Error("HTTP " + response.status);
  const text = (await response.text()).slice(0, 1_500_000);
  if (/captcha|unusual traffic|anomaly-modal|are you a robot|bot verification/i.test(text.slice(0, 60000)) && text.length < 120000) {
    throw new Error("капча / защита от ботов");
  }
  return text;
}

function parseBraveHtml(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  const blocks = html.split(/<div[^>]+class="[^"]*\bsnippet\b[^"]*"[^>]*data-type="web"/i).slice(1);
  for (const block of blocks) {
    const anchor = block.match(/<a\b[^>]*href="(https:\/\/[^"]+)"[^>]*>/i);
    if (!anchor) continue;
    const titleMatch = block.match(/<div[^>]*class="[^"]*\btitle\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
      || block.match(/class="[^"]*snippet-title[^"]*"[^>]*>([\s\S]*?)<\/(?:div|span)>/i);
    const descMatch = block.match(/<div[^>]*class="[^"]*\b(?:snippet-description|content|description)\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    results.push({
      url: decodeHtml(anchor[1]),
      title: stripHtml(titleMatch?.[1] || "").slice(0, 220),
      snippet: stripHtml(descMatch?.[1] || "").slice(0, 600),
      provider: "Brave",
    });
  }
  if (!results.length) {
    for (const match of html.matchAll(/<a\b[^>]*href="(https:\/\/[^"]+)"[^>]*class="[^"]*\bl1\b[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)) {
      results.push({ url: decodeHtml(match[1]), title: stripHtml(match[2]).slice(0, 220), snippet: "", provider: "Brave" });
    }
  }
  return results;
}

function parseBingHtml(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  for (const match of html.matchAll(/<li\b[^>]*class="[^"]*\bb_algo\b[^"]*"[^>]*>([\s\S]*?)<\/li>/gi)) {
    const block = match[1];
    const heading = block.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1] || "";
    const tag = heading.match(/<a\b[^>]*>/i)?.[0] || "";
    const caption = block.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] || "";
    results.push({
      url: unwrapSearchUrl(htmlAttribute(tag, "href"), "https://www.bing.com"),
      title: stripHtml(heading).slice(0, 220),
      snippet: stripHtml(caption).slice(0, 600),
      provider: "Bing",
    });
  }
  return results;
}

function parseBingRss(xml: string): SearchResult[] {
  const field = (fragment: string, tag: string) => stripHtml((fragment.match(new RegExp("<" + tag + "\\b[^>]*>([\\s\\S]*?)</" + tag + ">", "i"))?.[1] || "")
    .replace(/<!\[CDATA\[|\]\]>/g, ""));
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((match) => ({
    title: field(match[1], "title").slice(0, 220),
    url: unwrapSearchUrl(field(match[1], "link"), "https://www.bing.com"),
    snippet: field(match[1], "description").slice(0, 600),
    provider: "Bing RSS",
  }));
}

function parseDuckDuckGo(html: string, provider: string): SearchResult[] {
  const results: SearchResult[] = [];
  const anchors = [...html.matchAll(/<a\b(?=[^>]*\bclass=["'][^"']*(?:result__a|result-link)[^"']*["'])[^>]*>[\s\S]*?<\/a>/gi)];
  const snippets = [...html.matchAll(/<(?:a|td|div)\b(?=[^>]*\bclass=["'][^"']*(?:result__snippet|result-snippet)[^"']*["'])[^>]*>([\s\S]*?)<\/(?:a|td|div)>/gi)];
  anchors.forEach((match, index) => {
    const tag = match[0].match(/^<a\b[^>]*>/i)?.[0] || "";
    results.push({
      url: unwrapSearchUrl(htmlAttribute(tag, "href"), "https://duckduckgo.com"),
      title: stripHtml(match[0]).slice(0, 220),
      snippet: stripHtml(snippets[index]?.[1] || "").slice(0, 600),
      provider,
    });
  });
  return results;
}

function parseYahoo(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  for (const match of html.matchAll(/<div\b[^>]*class="[^"]*\bcompTitle\b[^"]*"[^>]*>([\s\S]*?)<\/div>[\s\S]*?(?:<div\b[^>]*class="[^"]*\bcompText\b[^"]*"[^>]*>([\s\S]*?)<\/div>)?/gi)) {
    const tag = match[1].match(/<a\b[^>]*>/i)?.[0] || "";
    const url = unwrapSearchUrl(htmlAttribute(tag, "href"), "https://search.yahoo.com");
    if (/bing\.com\/aclick|doubleclick/.test(url)) continue;
    results.push({ url, title: stripHtml(match[1].replace(/<span[^>]*>[\s\S]*?<\/span>/i, "")).slice(0, 220), snippet: stripHtml(match[2] || "").slice(0, 600), provider: "Yahoo" });
  }
  return results;
}

const PROVIDERS: Provider[] = [
  {
    // Tavily: free 1,000 searches/month, no card. Fetches the pages itself, so shops that block
    // data-centre IPs still reach us as page text.
    name: "Tavily",
    enabled: () => Boolean(process.env.TAVILY_API_KEY),
    search: async (query, signal) => {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { Authorization: "Bearer " + String(process.env.TAVILY_API_KEY), "Content-Type": "application/json" },
        body: JSON.stringify({ query, search_depth: "basic", max_results: 10, include_raw_content: "text", country: "netherlands" }),
        signal, cache: "no-store",
      });
      if (!response.ok) throw new Error("HTTP " + response.status + (response.status === 432 || response.status === 429 ? " (лимит Tavily)" : ""));
      const data = await response.json() as { results?: Array<{ title?: string; url?: string; content?: string; raw_content?: string | null }> };
      return (data.results || []).map((row) => ({
        title: String(row.title || ""), url: String(row.url || ""), snippet: String(row.content || "").slice(0, 600),
        provider: "Tavily", rawContent: row.raw_content ? String(row.raw_content).slice(0, 60000) : undefined,
      }));
    },
  },
  {
    name: "Brave API",
    enabled: () => Boolean(process.env.BRAVE_SEARCH_API_KEY),
    search: async (query, signal) => {
      const url = "https://api.search.brave.com/res/v1/web/search?" + new URLSearchParams({ q: query, country: "NL", search_lang: "nl", count: "10" });
      const response = await fetch(url, { headers: { Accept: "application/json", "X-Subscription-Token": String(process.env.BRAVE_SEARCH_API_KEY) }, signal, cache: "no-store" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json() as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
      return (data.web?.results || []).map((row) => ({ title: stripHtml(row.title || ""), url: String(row.url || ""), snippet: stripHtml(row.description || ""), provider: "Brave API" }));
    },
  },
  {
    name: "Google CSE",
    enabled: () => Boolean(process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_CX),
    search: async (query, signal) => {
      const url = "https://www.googleapis.com/customsearch/v1?" + new URLSearchParams({ key: String(process.env.GOOGLE_CSE_KEY), cx: String(process.env.GOOGLE_CSE_CX), q: query, gl: "nl", hl: "nl", num: "10" });
      const response = await fetch(url, { signal, cache: "no-store" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json() as { items?: Array<{ title?: string; link?: string; snippet?: string }> };
      return (data.items || []).map((row) => ({ title: row.title || "", url: String(row.link || ""), snippet: row.snippet || "", provider: "Google CSE" }));
    },
  },
  {
    name: "Brave",
    enabled: () => true,
    search: async (query, signal) => parseBraveHtml(await getText("https://search.brave.com/search?" + new URLSearchParams({ q: query, source: "web" }), signal)),
  },
  {
    name: "Bing",
    enabled: () => true,
    search: async (query, signal) => parseBingHtml(await getText("https://www.bing.com/search?" + new URLSearchParams({ q: query, cc: "NL", setlang: "nl-NL", count: "15" }), signal)),
  },
  {
    name: "DuckDuckGo",
    enabled: () => true,
    search: async (query, signal) => parseDuckDuckGo(await getText("https://html.duckduckgo.com/html/?" + new URLSearchParams({ q: query, kl: "nl-nl" }), signal), "DuckDuckGo"),
  },
  {
    name: "DuckDuckGo Lite",
    enabled: () => true,
    search: async (query, signal) => parseDuckDuckGo(await getText("https://lite.duckduckgo.com/lite/?" + new URLSearchParams({ q: query, kl: "nl-nl" }), signal), "DuckDuckGo Lite"),
  },
  {
    name: "Yahoo",
    enabled: () => true,
    search: async (query, signal) => parseYahoo(await getText("https://search.yahoo.com/search?" + new URLSearchParams({ p: query, vl: "lang_nl" }), signal)),
  },
  {
    name: "Bing RSS",
    enabled: () => true,
    search: async (query, signal) => parseBingRss(await getText("https://www.bing.com/search?" + new URLSearchParams({ q: query, format: "rss", cc: "NL" }), signal,
      { ...HTML_HEADERS, Accept: "application/rss+xml, application/xml;q=0.9" })),
  },
];

/** Provider health shared by all requests served by this instance. */
const health = new Map<string, { cooldownUntil: number; failures: number; inFlight: number }>();

function state(name: string) {
  let value = health.get(name);
  if (!value) { value = { cooldownUntil: 0, failures: 0, inFlight: 0 }; health.set(name, value); }
  return value;
}

/** Relevance of a result to the product words; filters engines that ignore the query. */
function relevantCount(results: SearchResult[], mustContain: string[]): number {
  if (!mustContain.length) return results.length;
  return results.filter((item) => {
    const text = (item.title + " " + item.snippet + " " + item.url).toLowerCase().replace(/[\s-]/g, "");
    return mustContain.filter((word) => text.includes(word)).length >= Math.max(1, Math.ceil(mustContain.length * 0.6));
  }).length;
}

export type SearchOutcome = { results: SearchResult[]; attempts: SearchAttempt[] };

/**
 * Searches with automatic failover: tries providers in priority order and moves on
 * when a provider errors, rate-limits, or returns results unrelated to the product.
 */
export async function searchWithFailover(
  query: string,
  options: { mustContain?: string[]; minRelevant?: number; maxProviders?: number; timeoutMs?: number; skip?: string[] } = {},
): Promise<SearchOutcome> {
  const mustContain = (options.mustContain || []).map((word) => word.toLowerCase().replace(/[\s-]/g, "")).filter((word) => word.length >= 2);
  const minRelevant = options.minRelevant ?? 3;
  const maxProviders = options.maxProviders ?? 4;
  const attempts: SearchAttempt[] = [];
  const merged: SearchResult[] = [];
  let tried = 0;
  for (const provider of PROVIDERS) {
    if (!provider.enabled() || options.skip?.includes(provider.name)) continue;
    const providerState = state(provider.name);
    if (providerState.cooldownUntil > Date.now()) {
      attempts.push({ provider: provider.name, query, ok: false, count: 0, error: "пауза после ошибки", ms: 0 });
      continue;
    }
    // Brave HTML allows only a few parallel requests per IP; spread the rest to other providers.
    if (provider.name === "Brave" && providerState.inFlight >= 2) continue;
    if (tried >= maxProviders) break;
    tried += 1;
    const started = Date.now();
    providerState.inFlight += 1;
    try {
      const rows = cleanResults(await provider.search(query, AbortSignal.timeout(options.timeoutMs ?? 8000)));
      const relevant = relevantCount(rows, mustContain);
      attempts.push({ provider: provider.name, query, ok: relevant > 0, count: relevant, ms: Date.now() - started,
        error: rows.length && !relevant ? "результаты не относятся к товару" : rows.length ? undefined : "пустой ответ" });
      providerState.failures = relevant ? 0 : providerState.failures + 1;
      for (const row of rows) if (!merged.some((item) => item.url === row.url)) merged.push(row);
      if (relevantCount(merged, mustContain) >= minRelevant) break;
    } catch (error) {
      const message = error instanceof Error ? (error.name === "TimeoutError" ? "таймаут" : error.message) : String(error);
      providerState.failures += 1;
      // Rate limits and bot walls cool the provider down instead of hammering it.
      const cooldown = /429|403|202|капча|лимит/i.test(message) ? 90_000 : Math.min(60_000, 10_000 * providerState.failures);
      providerState.cooldownUntil = Date.now() + cooldown;
      attempts.push({ provider: provider.name, query, ok: false, count: 0, error: message.slice(0, 120), ms: Date.now() - started });
    } finally {
      providerState.inFlight -= 1;
    }
  }
  const scored = merged.map((item) => {
    const text = (item.title + " " + item.snippet + " " + item.url).toLowerCase().replace(/[\s-]/g, "");
    return { item, hits: mustContain.filter((word) => text.includes(word)).length };
  });
  scored.sort((a, b) => b.hits - a.hits);
  return { results: scored.filter((row) => !mustContain.length || row.hits > 0).map((row) => row.item).slice(0, 12), attempts };
}

export function providerNames(): string[] {
  return PROVIDERS.filter((provider) => provider.enabled()).map((provider) => provider.name);
}
