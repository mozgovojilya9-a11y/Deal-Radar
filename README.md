# Deal Radar — Marktplaats deals inside a Telegram Mini App

Deal Radar scans configured Marktplaats categories near a Dutch postcode, estimates asking-price medians from observed listings, and publishes qualifying offers inside the app catalog. Telegram is used only to open the Mini App; no deal notifications are sent to Telegram chats.

## Architecture — no hosted database

- `bot.py` — Python scanner, model filters, rolling price comparison, and JSON feed generation. It makes no Telegram API calls and needs no secrets.
- `config.json` — postcode, 50 km radius, search queries, price limits, discount thresholds, up to 5 result pages per query (up to 500 results), and a 7-day maximum listing age.
- `.github/workflows/deals.yml` — scheduled scan every 5 minutes and manual dispatch.
- `deals-data` branch — stores `data/deals.json` as a single replaceable commit; the workflow creates the branch on its first run.
- `web/` — Next.js Mini App deployed on Vercel. `/api/deals` reads the GitHub JSON feed and caches it for one minute.
- Favorites and display filters are stored locally in each browser with `localStorage`.
- Rolling market comparison is stored in `state.db` and restored with GitHub Actions cache; cache eviction can reset price history.

Supabase is not used or required. Your laptop does not need to be running.

## GitHub Actions

Open **Actions → deals → Run workflow** to start a manual scan. The scanner needs no GitHub secrets: it reads Marktplaats and publishes the JSON feed. The workflow needs repository Contents read/write permission. It runs about every 5 minutes; GitHub may delay scheduled starts. Each category query scans up to 5 pages × 100 results, not every listing on the entire Marktplaats site. Listings older than 7 days are excluded.

## Vercel

Set Root Directory to `web`, Framework to Next.js, Production Branch to `main`. Add this server-only Production Environment Variable:

- `TELEGRAM_TOKEN` — validates signed Telegram Mini App `initData`; it is not used by the scanner.

Optional: `DEALS_FEED_URL` can override the public raw GitHub URL to `data/deals.json`.

No Supabase variables are needed.

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

## Features

- Actual Marktplaats listings with photos, asking price, estimated market price, discount, location, and risk flags.
- Direct Marktplaats link on every card.
- Filters for category, price range, minimum discount, and distance.
- Catalog refresh every 2 minutes and when the app returns to the foreground.
- Local favorites and display preferences.
- Server-validated Telegram Mini App authentication.
- No Supabase and no dependency on your laptop remaining online.

The catalog contains only genuine qualifying offers; no demo listings are generated. The scanner reviews up to 500 results per configured query within 50 km and accepts listings published within the previous 7 days; this is a broad search, not an exhaustive crawl of all Marktplaats listings. Market-price estimates use asking prices, not completed sales. Inspect the item, seller history, and safe payment options before buying.
