const BASE = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function supabaseRest<T>(
  table: string,
  options: { method?: "GET" | "POST" | "DELETE"; query?: URLSearchParams; body?: unknown; prefer?: string } = {}
): Promise<T> {
  if (!BASE || !KEY) throw new Error("Supabase is not configured");
  const query = options.query?.toString();
  const response = await fetch(`${BASE}/rest/v1/${table}${query ? "?" + query : ""}`, {
    method: options.method ?? "GET",
    headers: {
      apikey: KEY,
      Accept: "application/json",
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(options.prefer ? { Prefer: options.prefer } : {})
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: "no-store"
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text.slice(0, 240)}`);
  return (text ? JSON.parse(text) : null) as T;
}
