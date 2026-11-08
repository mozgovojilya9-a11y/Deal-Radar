/**
 * Per-listing market value for the Python scanner (no network).
 * stdin:  { "groups": { "<key>": { "checkedAt": "...", "offers": [...] } }, "items": [{ "id", "key", "title", "hint" }] }
 * stdout: [{ "id", "valuation", "offers", "removed" }]
 */
import { revalueForListing, type MarketOffer } from "../lib/market-research";

type Payload = {
  groups: Record<string, { checkedAt: string; offers: MarketOffer[] }>;
  items: Array<{ id: string; key: string; title: string; hint?: string | null }>;
};

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Payload;
const results = payload.items.flatMap((item) => {
  const group = payload.groups[item.key];
  return group ? [{ id: item.id, ...revalueForListing(item.title, item.hint || null, group.offers, group.checkedAt) }] : [];
});
process.stdout.write(JSON.stringify(results));
