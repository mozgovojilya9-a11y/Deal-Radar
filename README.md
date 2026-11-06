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
