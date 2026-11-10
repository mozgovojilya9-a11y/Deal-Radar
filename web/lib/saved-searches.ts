/**
 * Saved catalogue searches and recent queries, kept on this device only (localStorage).
 * The pure functions are tested; the storage helpers never throw (private mode, blocked storage).
 */

export type SavedSearch = { id: string; text: string; category: string; dropsOnly: boolean; createdAt: string };

export const SAVED_KEY = "deal-radar-saved-searches";
export const HISTORY_KEY = "deal-radar-search-history";
export const RESEARCH_HISTORY_KEY = "deal-radar-research-history";
const MAX_SAVED = 12;
const MAX_HISTORY = 8;

const sameText = (a: string, b: string) => a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");

/** Most recent first, without duplicates (case and spacing ignored), at most 8 entries. */
export function rememberQuery(history: string[], query: string): string[] {
  const text = query.trim().replace(/\s+/g, " ").slice(0, 80);
  if (text.length < 2) return history;
  return [text, ...history.filter((item) => !sameText(item, text))].slice(0, MAX_HISTORY);
}

export function isSaved(saved: SavedSearch[], search: Pick<SavedSearch, "text" | "category" | "dropsOnly">): boolean {
  return saved.some((item) => sameText(item.text, search.text) && item.category === search.category && item.dropsOnly === search.dropsOnly);
}

export function addSavedSearch(saved: SavedSearch[], search: Pick<SavedSearch, "text" | "category" | "dropsOnly">, now = new Date()): SavedSearch[] {
  const text = search.text.trim().replace(/\s+/g, " ").slice(0, 80);
  if ((!text && !search.category && !search.dropsOnly) || isSaved(saved, { ...search, text })) return saved;
  const entry: SavedSearch = { id: now.getTime().toString(36) + Math.random().toString(36).slice(2, 6), text, category: search.category, dropsOnly: search.dropsOnly, createdAt: now.toISOString() };
  return [entry, ...saved].slice(0, MAX_SAVED);
}

export function removeSavedSearch(saved: SavedSearch[], id: string): SavedSearch[] {
  return saved.filter((item) => item.id !== id);
}

/** Only well-formed entries survive a read: storage can hold anything. */
export function readSavedSearches(raw: unknown): SavedSearch[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is SavedSearch => Boolean(item) && typeof item === "object"
    && typeof item.id === "string" && typeof item.text === "string" && typeof item.category === "string"
    && typeof item.dropsOnly === "boolean" && typeof item.createdAt === "string").slice(0, MAX_SAVED);
}

export function readHistory(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string" && item.trim().length >= 2).slice(0, MAX_HISTORY) : [];
}

export function loadJson<T>(key: string, read: (raw: unknown) => T): T {
  try { return read(JSON.parse(localStorage.getItem(key) || "null")); } catch { return read(null); }
}

export function storeJson(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable: kept for this session */ }
}
