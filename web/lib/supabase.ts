const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export type Deal = {
  listing_id: string;
  title: string;
  description: string | null;
  price: number;
  market_price: number;
  discount: number;
  category_key: string;
  category_label: string;
  model_group: string | null;
  city: string | null;
  distance_km: number | null;
  listing_url: string;
  image_url: string | null;
  warning_flags: string[] | null;
  posted_at: string | null;
  detected_at: string;
  active: boolean;
};

export function isDatabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

export async function readDeals(options: {
  category?: string;
  sort?: "discount" | "newest" | "price";
  limit?: number;
}): Promise<Deal[]> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase is not configured");
  }

  const url = new URL(SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/deals");
  url.searchParams.set(
    "select",
    "listing_id,title,description,price,market_price,discount,category_key,category_label,model_group,city,distance_km,listing_url,image_url,warning_flags,posted_at,detected_at,active"
  );
  url.searchParams.set("active", "eq.true");
  // Do not show stale listings after three days; Marktplaats listings may disappear or sell.
  const freshSince = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  url.searchParams.set("detected_at", "gte." + freshSince);
  url.searchParams.set("limit", String(Math.min(Math.max(options.limit ?? 60, 1), 100)));

  if (options.category && /^[a-z0-9-]{1,64}$/i.test(options.category)) {
    url.searchParams.set("category_key", "eq." + options.category);
  }

  const order =
    options.sort === "newest"
      ? "detected_at.desc"
      : options.sort === "price"
        ? "price.asc"
        : "discount.desc";
  url.searchParams.set("order", order);

  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error("Supabase returned " + response.status + ": " + detail);
  }

  return (await response.json()) as Deal[];
}
