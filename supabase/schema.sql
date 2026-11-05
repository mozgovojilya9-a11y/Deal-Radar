-- Deal Radar: server-only access. The web app and scraper use the service-role key.
create table if not exists public.deals (
  listing_id text primary key,
  title text not null,
  description text not null default '',
  price numeric(12,2) not null check (price > 0),
  market_price numeric(12,2) not null check (market_price > 0),
  discount numeric(6,4) not null,
  category_key text not null,
  category_label text not null,
  model_group text,
  city text,
  distance_km numeric(8,2),
  listing_url text not null,
  image_url text,
  warning_flags jsonb not null default '[]'::jsonb,
  posted_at timestamptz,
  detected_at timestamptz not null default now(),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create index if not exists deals_active_detected_idx
  on public.deals (active, detected_at desc);
create index if not exists deals_active_discount_idx
  on public.deals (active, discount desc);
create index if not exists deals_category_idx
  on public.deals (category_key, detected_at desc);

alter table public.deals enable row level security;

-- No browser/anonymous access. Only server-side service role may read/write this table.
revoke all on table public.deals from anon, authenticated;
grant all on table public.deals to service_role;
