import type { Deal } from "./deals";
import { CATEGORY_GROUPS, groupOf } from "./categories";

/** Stable 0..1 number from a listing id, so a dot keeps its place between refreshes. */
function unit(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  return ((hash >>> 0) % 1000) / 1000;
}

export type RadarPoint = { deal: Deal; x: number; y: number; size: number; group: string };

/**
 * Places profitable deals on a radar: the angle is the category group's sector, the distance from
 * the centre falls as the deal score rises (the best deals sit closest to the centre), the dot size
 * grows with the profit. Coordinates are percentages of the square.
 */
export function radarPoints(deals: Deal[]): RadarPoint[] {
  const groups = [...CATEGORY_GROUPS] as string[];
  const sector = 360 / (groups.length + 1);
  const maxProfit = Math.max(1, ...deals.map((deal) => deal.estimated_profit ?? 0));
  return deals.map((deal) => {
    const group = groupOf(deal.category_key);
    const index = groups.includes(group) ? groups.indexOf(group) : groups.length;
    const angle = (index * sector + sector * (0.15 + 0.7 * unit(deal.listing_id)) - 90) * (Math.PI / 180);
    const score = Math.max(0, Math.min(100, deal.deal_score ?? 40));
    const radius = 8 + ((100 - score) / 100) * 38;
    return {
      deal, group,
      x: 50 + radius * Math.cos(angle),
      y: 50 + radius * Math.sin(angle),
      size: 10 + 10 * Math.sqrt(Math.max(0, deal.estimated_profit ?? 0) / maxProfit),
    };
  });
}
