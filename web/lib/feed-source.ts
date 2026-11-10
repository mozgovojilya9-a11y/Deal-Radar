import type { DealFeed } from "./deals";
import { readFeedText } from "./feed-crypto";

export const FEED_URL = process.env.DEALS_FEED_URL
  || "https://raw.githubusercontent.com/mozgovojilya9-a11y/Deal-Radar/deals-data/data/deals.json";

/** Downloads the published feed and opens it when it is sealed (FEED_KEY). */
export async function fetchFeed(init?: RequestInit & { next?: { revalidate?: number } }): Promise<Partial<DealFeed>> {
  const bucket = Math.floor(Date.now() / 60_000);
  const response = await fetch(FEED_URL + (FEED_URL.includes("?") ? "&" : "?") + "t=" + bucket, { headers: { Accept: "application/json" }, ...init });
  if (!response.ok) throw new Error("feed HTTP " + response.status);
  return readFeedText(await response.text()) as Partial<DealFeed>;
}
