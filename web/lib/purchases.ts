/** Deals the user actually bought, kept on this device next to favourites. */
export type Purchase = {
  id: string;
  title: string;
  url: string;
  paid: number;
  expectedProfit: number | null;
  boughtAt: string;
  soldFor: number | null;
  /** When it was marked sold (older records have none). */
  soldAt?: string | null;
};

export const PURCHASES_KEY = "deal-radar-purchases";

function isPurchase(value: unknown): value is Purchase {
  const row = value as Purchase | null;
  return Boolean(row) && typeof row!.id === "string" && typeof row!.title === "string" && typeof row!.paid === "number" && Number.isFinite(row!.paid) && row!.paid > 0;
}

export function readPurchases(raw: unknown): Purchase[] {
  return Array.isArray(raw) ? raw.filter(isPurchase).map((row) => ({ ...row, url: typeof row.url === "string" ? row.url : "", expectedProfit: typeof row.expectedProfit === "number" ? row.expectedProfit : null, soldFor: typeof row.soldFor === "number" && row.soldFor >= 0 ? row.soldFor : null,
    soldAt: typeof row.soldAt === "string" && Number.isFinite(Date.parse(row.soldAt)) ? row.soldAt : null })) : [];
}

export function loadPurchases(): Purchase[] {
  try { return readPurchases(JSON.parse(localStorage.getItem(PURCHASES_KEY) || "[]")); } catch { return []; }
}

export function savePurchases(rows: Purchase[]): void {
  try { localStorage.setItem(PURCHASES_KEY, JSON.stringify(rows)); } catch { /* storage unavailable: kept for this session */ }
}

/** A repeated purchase of one listing replaces the earlier record instead of doubling the totals. */
export function addPurchase(rows: Purchase[], purchase: Purchase): Purchase[] {
  return [purchase, ...rows.filter((row) => row.id !== purchase.id)];
}

export function markSold(rows: Purchase[], id: string, soldFor: number | null, now = new Date()): Purchase[] {
  return rows.map((row) => row.id === id ? { ...row, soldFor, soldAt: soldFor === null ? null : now.toISOString() } : row);
}

export function removePurchase(rows: Purchase[], id: string): Purchase[] {
  return rows.filter((row) => row.id !== id);
}

/** Realised profit counts only sold items; money still in stock is shown separately. */
export function purchaseSummary(rows: Purchase[]) {
  const sold = rows.filter((row) => row.soldFor !== null);
  const open = rows.filter((row) => row.soldFor === null);
  return {
    count: rows.length,
    soldCount: sold.length,
    realizedProfit: Math.round(sold.reduce((sum, row) => sum + (row.soldFor as number) - row.paid, 0) * 100) / 100,
    inStock: Math.round(open.reduce((sum, row) => sum + row.paid, 0) * 100) / 100,
    expectedProfit: Math.round(open.reduce((sum, row) => sum + (row.expectedProfit ?? 0), 0) * 100) / 100,
  };
}

/** Polite first message to a Dutch seller. */
export function sellerMessage(title: string, offer: number): string {
  return `Hallo, ik heb interesse in je advertentie "${title.slice(0, 80)}". Zou je €${offer} willen accepteren? Ik kan snel ophalen of betalen.`;
}
