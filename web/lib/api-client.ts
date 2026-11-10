/** fetch for the app's own API: adds the signed Telegram identity, which paid routes require. */
export function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const initData = typeof window !== "undefined" ? window.Telegram?.WebApp?.initData || "" : "";
  const headers = new Headers(init.headers);
  if (initData) headers.set("x-telegram-init-data", initData);
  return fetch(url, { ...init, headers });
}
