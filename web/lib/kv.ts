/**
 * Minimal Upstash Redis REST client (free tier) for the trial start dates. Works with the variables
 * the Vercel Upstash integration creates: UPSTASH_REDIS_REST_URL/TOKEN or KV_REST_API_URL/TOKEN.
 */
const url = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const token = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";

export const kvConfigured = () => Boolean(url() && token());

async function command(args: Array<string | number>): Promise<unknown> {
  const response = await fetch(url(), {
    method: "POST", headers: { Authorization: "Bearer " + token(), "Content-Type": "application/json" },
    body: JSON.stringify(args), cache: "no-store", signal: AbortSignal.timeout(5000),
  });
  const data = await response.json().catch(() => null) as { result?: unknown; error?: string } | null;
  if (!response.ok || !data || data.error) throw new Error("Upstash: " + (data?.error || "HTTP " + response.status));
  return data.result;
}

export async function kvGet(key: string): Promise<string | null> {
  const result = await command(["GET", key]);
  return typeof result === "string" ? result : null;
}

/** Sets the key only when it does not exist yet; returns the value that is stored afterwards. */
export async function kvSetOnce(key: string, value: string): Promise<string> {
  await command(["SET", key, value, "NX"]);
  return (await kvGet(key)) ?? value;
}
