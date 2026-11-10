/**
 * Search inside the deal catalogue. The same matcher runs in /api/deals and in the app, so a query
 * finds the same listings everywhere. Russian product words and typos go through `understandQuery`;
 * matching is word-based so "15" does not find "150" and "ps5" does not find "PS4".
 */
import { normalizeText } from "./product-identity";
import { understandQuery } from "./query-understanding";

type Searchable = { title: string; category_label?: string | null; category_key?: string | null };

/** Product-type words people use in Russian, Dutch or English, mapped to one form. */
const SYNONYMS: Record<string, string> = {
  koptelefoon: "headphones", hoofdtelefoon: "headphones", headphone: "headphones", headset: "headphones",
  horloge: "watch", horloges: "watch", uhr: "watch", watches: "watch",
  drones: "drone", quadcopter: "drone",
  televisie: "tv", television: "tv", televisions: "tv",
  objectief: "lens", lenses: "lens", objektiv: "lens",
  speaker: "speaker", speakers: "speaker", luidspreker: "speaker", boombox: "speaker",
  tas: "bag", tassen: "bag", handtas: "bag", bags: "bag", rugzak: "backpack", backpacks: "backpack",
  fototoestel: "camera", cameras: "camera",
};
const canonical = (word: string) => SYNONYMS[word] || word;
const WHOLE_WORDS = new Set(["pro", "max", "mini", "plus", "ultra", "air", "slim", "lite", "disc", "digital", "oled", "fold", "flip"]);

function distanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i += 1; j += 1; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else { i += 1; j += 1; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function wordsOf(text: string): string[] {
  return normalizeText(text).split(/[\s.,/-]+/).filter(Boolean).map(canonical);
}

/** Tokens of a query; a token "matches" a listing word by the rules in `tokenMatches`. */
function queryTokens(query: string): string[] {
  const understood = understandQuery(query.slice(0, 80)).query;
  return wordsOf(understood).filter((token) => token.length >= 2 || /^\d$/.test(token));
}

function tokenMatches(token: string, words: string[], compact: string): boolean {
  if (/^\d+$/.test(token)) {
    // Numbers are whole: "15" finds "15" and "15pro" but not "150" or "1500".
    return words.some((word) => word === token || new RegExp("^" + token + "(?!\\d)").test(word));
  }
  // Short words and edition words are whole words: "pro" is not "Product", "air" is not "Airwrap".
  // Model codes with digits ("xm5", "s25", "m1") may be the tail of a longer code ("wh1000xm5").
  if (/\d/.test(token)) return words.some((word) => word === token || word.endsWith(token) || new RegExp("^" + token + "(?!\\d)").test(word))
    || (token.length >= 4 && compact.includes(token));
  if (token.length <= 3 || WHOLE_WORDS.has(token)) return words.includes(token);
  if (words.some((word) => word.startsWith(token))) return true;
  // Written together or apart: "iphone15", "wh1000xm5", "ps 5".
  if (token.length >= 4 && compact.includes(token)) return true;
  if (/\d/.test(token) && token.length >= 3) return words.some((word) => word.endsWith(token));
  return token.length >= 5 && words.some((word) => word.length >= 4 && distanceAtMostOne(token, word));
}

export function catalogMatcher(query: string): (item: Searchable) => boolean {
  const tokens = queryTokens(query);
  if (!tokens.length) return () => true;
  return (item) => {
    const words = wordsOf([item.title, item.category_label || "", (item.category_key || "").replace(/-/g, " ")].join(" "));
    const compact = words.join("");
    return tokens.every((token) => tokenMatches(token, words, compact));
  };
}
