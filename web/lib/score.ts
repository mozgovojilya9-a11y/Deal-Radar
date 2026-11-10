import type { Deal } from "./deals";

export type ScoreParts = { profit: number; roi: number; evidence: number; liquidity: number; freshness: number; risk: number };

/** Highest value of every part, for the breakdown bars. Risk is a penalty: 0 is best, -30 is worst. */
export const SCORE_MAX: ScoreParts = { profit: 30, roi: 20, evidence: 25, liquidity: 10, freshness: 15, risk: -30 };

type Scored = Pick<Deal, "estimated_profit" | "profit_roi" | "market_confidence" | "market_samples" | "external_domains"
  | "market_spread" | "market_stale" | "marktplaats_samples" | "warning_flags" | "price_type" | "needs_confirmation">;

const halfUp = (value: number, digits = 0) => Math.floor(value * 10 ** digits + 0.5) / 10 ** digits;

/**
 * Deal quality 0–100 and its parts. Mirrors `deal_score` in /bot.py; both are checked against
 * /score_fixtures.json, so the app and the scanner can never disagree about a score.
 */
export function dealScore(deal: Partial<Scored>, listingAgeHours: number | null): { total: number; parts: ScoreParts } {
  const profit = Number(deal.estimated_profit) || 0;
  const roi = Number(deal.profit_roi) || 0;
  const samples = Math.trunc(Number(deal.market_samples) || 0);
  const domains = Math.trunc(Number(deal.external_domains) || 0);
  const spread = deal.market_spread ?? null;
  const profitPart = 30 * Math.min(1, Math.sqrt(Math.max(0, profit) / 250));
  const roiPart = 20 * Math.min(1, Math.max(0, roi) / 0.6);
  const base = deal.market_confidence === "high" ? 15 : deal.market_confidence === "preliminary" ? 9 : deal.market_confidence === "retail_proxy" ? 6 : 0;
  let evidence = 0;
  if (base) {
    evidence = base + Math.min(5, samples / 4) + (domains >= 3 ? 3 : domains === 2 ? 2 : 0)
      + (spread === null ? 0 : spread <= 0.25 ? 2 : spread <= 0.5 ? 1 : 0);
    evidence = Math.min(25, evidence) * (deal.market_stale ? 0.5 : 1);
  }
  const liquidity = 10 * Math.min(1, (samples + 0.5 * Math.trunc(Number(deal.marktplaats_samples) || 0)) / 30);
  const age = listingAgeHours;
  const freshness = age === null || !Number.isFinite(age) ? 0 : age <= 6 ? 15 : age <= 24 ? 12 : age <= 72 ? 9 : age <= 168 ? 6 : age <= 336 ? 3 : 0;
  const risk = -(Math.min(12, 4 * (deal.warning_flags?.length || 0)) + (deal.price_type === "MIN_BID" ? 10 : 0) + (deal.needs_confirmation ? 8 : 0));
  const total = profitPart + roiPart + evidence + liquidity + freshness + risk;
  return {
    total: Math.max(0, Math.min(100, halfUp(total))),
    // "+ 0" turns a negative zero into zero.
    parts: { profit: halfUp(profitPart, 1), roi: halfUp(roiPart, 1), evidence: halfUp(evidence, 1), liquidity: halfUp(liquidity, 1), freshness, risk: risk + 0 },
  };
}

export function scoreTone(score: number): "top" | "solid" | "fair" | "weak" {
  return score >= 75 ? "top" : score >= 55 ? "solid" : score >= 35 ? "fair" : "weak";
}
