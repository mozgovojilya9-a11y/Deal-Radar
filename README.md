# Deal Radar — Marktplaats deals inside a Telegram Mini App

Deal Radar scans configured Marktplaats categories near a Dutch postcode, estimates asking-price medians from observed listings, and publishes qualifying offers inside the app catalog. Telegram is used only to open the Mini App; no deal notifications are sent to Telegram chats.

## Architecture — no hosted database

- `bot.py` — Python scanner, model-aware filters, rolling price comparison, and JSON feed generation. It counts unique listing IDs and duplicate search hits separately. Listings without enough comparable prices are kept as review candidates without a fabricated discount.
- `retail_prices.json` — source-backed current-new-price references keyed by exact model group; references older than 45 days are ignored. This is a curated fallback cache, not a live web crawler. With neither Marktplaats comparables nor an exact fresh retail reference, a listing stays a candidate with no invented profit.
- `config.json` — postcode, 50 km radius, 40 product searches, price limits, discount thresholds, up to 5 result pages per query (up to 500 results), candidate review rules, and a 30-day maximum listing age.
- `.github/workflows/deals.yml` — scheduled scan every 10 minutes and manual dispatch.
- `deals-data` branch — stores `data/deals.json` as a single replaceable commit; the workflow creates the branch on its first run.
- `web/` — Next.js Mini App deployed from GitHub (Vercel and/or Netlify). `/api/deals` reads the GitHub JSON feed and caches it for one minute.
- Favorites and display filters are stored locally in each browser with `localStorage`.
- Rolling market comparison is stored in `state.db` and restored with GitHub Actions cache; cache eviction can reset price history.

Supabase is not used or required. Your laptop does not need to be running.

## GitHub Actions

Open **Actions → deals → Run workflow** to start a manual scan. The scanner needs no GitHub secrets: it reads Marktplaats and publishes the JSON feed. The workflow needs repository Contents read/write permission. It runs about every 10 minutes; GitHub may delay scheduled starts. Each category query scans up to 5 pages × 100 results, not every listing on the entire Marktplaats site. Listings older than 30 days are excluded.

## Free AI product matching

Deal Radar uses Google's Gemini API on its free tier for product identity checks and query planning. It does not call OpenAI or any paid AI API. If the Gemini free quota is unavailable, the scheduled scanner falls back to deterministic matching; it can also use local Ollama when configured. Price medians, resale estimates, fees and ROI are calculated by code, never invented by the model.

### Enable Gemini (recommended)

1. Create or open a Gemini API key in [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Make sure the Google Cloud project is on the **Free** usage tier and has no active Cloud Billing account linked. The free tier has per-model request and token limits; it is not unlimited.
3. In **GitHub → Deal-Radar → Settings → Secrets and variables → Actions**, add a repository secret named `GEMINI_API_KEY`.
4. In **Vercel → Project → Settings → Environment Variables**, add `GEMINI_API_KEY` and set its value to the same key. Keep it server-side; never add a `NEXT_PUBLIC_` prefix.
5. Redeploy the Vercel project after adding the variable. The GitHub scanner will pick up the secret on its next scheduled run.

The default model is `gemini-3.5-flash-lite`. The scheduled scanner reviews at most four new/changed listings per category per run and caches results by listing text to conserve the free quota. The manual research report uses Gemini only when the Vercel environment variable is configured.

### Optional local fallback on macOS

If the Gemini free quota is temporarily exhausted, you can run a local model with Ollama instead. Install [Ollama](https://ollama.com/download), then run:

```bash
ollama pull qwen2.5:3b
bash scripts/run_local_radar.sh
```

For automatic local scans every 15 minutes while your Mac is logged in and Ollama is running:

```bash
bash scripts/install_macos_schedule.sh
```

The local scanner stores its review cache and SQLite database under `~/Library/Application Support/DealRadar`. It publishes only the resulting JSON feed to the existing `deals-data` branch.

### Cost and privacy

Gemini free tier provides limited free model requests. Google states that content submitted on the unpaid tier may be used to improve its products, so only public listing titles/descriptions and product search terms should be sent; do not send personal or confidential information. If a billing account is linked, paid usage may be charged. Check the project's tier and usage in Google AI Studio.

## Vercel

Set Root Directory to `web`, Framework to Next.js, Production Branch to `main`. Add this server-only Production Environment Variable:

- `TELEGRAM_TOKEN` — validates signed Telegram Mini App `initData`; it is not used by the scanner.

Optional: `DEALS_FEED_URL` can override the public raw GitHub URL to `data/deals.json`.

No Supabase variables are needed.

## Public website

The marketing site lives in the same Next.js app, next to the Mini App:

- `/` — the existing Mini App (unchanged; this is the URL BotFather opens).
- `/nl/...` (default) and `/en/...` — the public website: home, how it works, features, categories, about, FAQ, contact, privacy and terms. Dutch and English texts live in `web/lib/site/dictionaries/`.
- Live data (hero deals, scanner numbers, demo catalogue, category counts) comes from the same public `deals.json` feed as `/api/deals`; pages are regenerated at most every 5 minutes. Reserved, inactive and older-than-30-days listings are never shown.
- Contact details and branding: `web/site-config.ts`. Empty fields are hidden on the site.
- Contact form: `POST /api/contact` with server-side validation, honeypot, fill-time and link-spam checks, a per-instance rate limit (5/hour per IP) and delivery to Telegram (`CONTACT_TELEGRAM_CHAT_ID`) and/or email via Resend (`RESEND_API_KEY`, `CONTACT_FROM_EMAIL`). Without a configured channel it answers "unavailable" — it never pretends to send.
- SEO: per-page titles and descriptions, canonical URLs, `hreflang` alternates, Open Graph/X cards with a generated image, `sitemap.xml`, `robots.txt` and schema.org data (WebSite, WebApplication, BreadcrumbList, FAQPage). Set `NEXT_PUBLIC_SITE_URL` once a custom domain is connected.

Checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## Telegram Mini App

Use BotFather `/setmenubutton` to point the bot menu button at the Vercel Production URL. Telegram opens the Mini App; deal cards are shown inside the app, not sent as chat messages.

## Local development

Requirements: Python 3.9+ and Node.js 24+.

```bash
python -m unittest discover -s tests
python bot.py --dry
cd web
npm install
npm run typecheck
npm run build
npm run dev
```

## v6: independent market value and reserved listings

**Marktplaats is the source of candidates, never of market value.** The scanner uses Marktplaats for the
seller's price, description, photos and link. The market value comes from independent sources found by
`web/scripts/market-cli.ts` (run by `bot.py` through Node 24):

| Segment | Sources that work with plain requests |
|---|---|
| New | Coolblue, MediaMarkt, bol.com, beslist.nl (aggregates many shops), official shops and other pages found through Brave/Bing/DuckDuckGo/Yahoo |
| Used | Kleinanzeigen.de and other used platforms found through web search |
| Refurbished | Refurbed.nl, MediaMarkt refurbished offers, other refurbishers found through web search |

eBay (incl. sold listings), Back Market, Amazon.nl and Tweakers Pricewatch block automated requests or require a
consent wall; they are **not** scraped by circumventing protection. They are used only when a search engine returns a
page that opens normally.

**Market value** = median of ≥3 exact-model used offers outside Marktplaats/2dehands (outliers, accessories, bundles
and other generations removed). Confidence: *high* (≥6 offers from ≥2 sites, spread ≤60%), *medium* (≥3), *low*
(1–2, no value), *none*. New and refurbished medians are stored separately. Without enough independent prices the
listing stays a candidate: Marktplaats is never used as a fallback. Valuations are re-checked after 24 h; an older
valuation is marked stale and not used for a status. Every valuation and every offer URL is appended to
`external_valuations` / `external_offers` (history, nothing overwritten).

**Reserved listings** ("Gereserveerd") are detected from the Marktplaats API flag `reserved` and, for listings not
returned by the current search, from the listing page (`"isReserved":true`, the price label `Gereserveerd`, the
analytics field `"ap":"Gereserveerd"`). Words in the title or description are ignored. Reserved listings are
removed from the catalogue and every count, their state is kept in `evaluations` and `status_history`, and they come
back automatically if the reservation is cancelled.

## What changed in v5 (scanner, AI advisor, settings)

### AI advisor (`web/lib/advisor.ts`, `web/lib/market-research.ts`)
- Real web research on every question: Brave, Bing, DuckDuckGo (HTML and Lite), Yahoo and Bing RSS with automatic failover and cool-down after rate limits; optional Brave Search API (`BRAVE_SEARCH_API_KEY`) and Google Custom Search (`GOOGLE_CSE_KEY`, `GOOGLE_CSE_CX`).
- Independent of search engines: the official Marktplaats/2dehands search API and the Coolblue/MediaMarkt search pages.
- Result pages are opened (manual, validated redirects) and prices are extracted from JSON-LD `Product`/`Offer`/`AggregateOffer`, microdata, `product:price` meta tags and, only on product pages, the visible price after the heading. Formats like `€419`, `EUR419.00`, `419 EUR`, `1.299,00`, `419,-` are parsed; non-EUR currencies are rejected.
- Every offer is matched to the exact model (`web/lib/product-identity.ts`): exact / variant / similar / accessory / mismatch. Generations, storage, screen size, editions (Slim/Pro/Digital), bundles and article codes are never merged.
- New retail, used (marketplaces) and refurbished prices are kept in separate segments; outliers and implausible prices are removed.
- The scanner estimate (`market_price`, `market_median_price`, `market_samples`, `market_confidence`, `price_reference_type`, `market_sources`) is always passed to the advisor and shown as "Оценка Deal Radar", never as a shop price.
- All amounts are computed by code; Gemini only phrases a short answer and risks, and any sentence with an amount not present in the data is removed.
- Each product has its own temporary chat: switching or closing the card destroys it, in-flight requests are aborted, late answers are ignored. Nothing is stored.

### Scanner (`bot.py`)
- Comparable listings are stored with URL, condition, city, coordinates and price type (additive migration, no data is deleted), so `market_sources` contains real Marktplaats links behind every estimate.
- Lifecycle: `evaluations` table with priority re-check queue, exponential back-off when data is missing, lease against parallel processing, liveness check (HTTP 404/410 = sold/removed) for listings missing from search, PDOK geocoding for older records without coordinates.
- "Bieden vanaf" (MIN_BID) listings are evaluated but never used as comparables and only kept when profit is confirmed; auction ("Veiling") and lots ("2x …") are not single-item deals; generic accessory detection for device categories; wide price spread blocks a verified deal.
- 11 new categories (Galaxy S, MacBook, iPad, Switch, Xbox Series, Steam Deck, Apple Watch, AirPods Pro 2, Sony FE lenses, Dyson, Sonos).
- New metrics: found, evaluated, new, rejected, candidates, awaiting re-check, promoted, demoted, removed, technical errors.

### Settings (all applied server-side by `/api/deals`)
Location (GPS with permission or city/postcode via PDOK, `/api/location`), radius 5–150 km or the whole country (haversine on listing coordinates), min/max price with no hidden cap, minimum discount, profit and ROI, categories, new/used, exact model only, profit or distance priority. Settings are stored per device and never touch favourites or scanner history.

### Tests
```bash
python -m unittest discover -s tests          # scanner, lifecycle, migration
cd web && npm test                             # identity, prices, economics, advisor, settings, /api/deals
```

## Features

- Actual Marktplaats listings with photos, asking price, estimated market price, discount, location, and risk flags.
- Three offer tiers: strong verified deals, good-value deals, and candidates awaiting comparable market data.
- Scan analytics distinguish raw result rows, unique listings, duplicate matches, and reasons for rejection.
- Product-aware price groups for televisions (brand, diagonal, panel, resolution) and model-specific matching for drones, microphones, headphones, and Michael Kors bags/backpacks.
- Direct Marktplaats link on every card.
- Filters for category, price range, minimum discount, and distance.
- Catalog refresh every 2 minutes and when the app returns to the foreground.
- Local favorites and display preferences.
- Server-validated Telegram Mini App authentication.
- No Supabase and no dependency on your laptop remaining online.

The catalog contains only real Marktplaats listings; no demo listings are generated. The homepage ranks verified strong deals first and good-value deals next. Listings without enough comparable evidence remain visible in a separate review-candidate section and are never presented as verified savings. Product-specific model groups are not allowed to fall back to broad category medians. The scanner reviews up to 500 results per configured query within 50 km and accepts listings published within the previous 30 days; this is a broad search, not an exhaustive crawl of all Marktplaats listings. Market-price estimates use asking prices, not completed sales. Inspect the item, seller history, and safe payment options before buying.


Profit estimates reserve 5% against the observed Marktplaats median, 4% for buyer negotiation, 8% for selling costs and €10 in fixed costs by default. Each category has a minimum net-profit and ROI requirement. Market estimates use asking prices rather than completed sales; profit is not guaranteed. Inspect each item and seller before purchase.

## Редактирование дизайна

Визуальная тема находится в `web/design/index.html`. Редактируй CSS внутри тега `<style>`: цвета, шрифты, размеры, отступы, карточки, кнопки, адаптивность и анимации. Next.js автоматически подключает эти стили из файла. Логика API, Telegram, сканера и расчётов остаётся отдельно. Структура интерактивных React-компонентов и обработчики событий находятся в `web/app/page.tsx`; при изменении структуры функциональных блоков обновляй соответствующую React-разметку, сохраняя существующие CSS-классы.
