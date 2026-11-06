# Deal Radar — Marktplaats → Telegram Mini App

Deal Radar scans configured Marktplaats categories near a Dutch postcode, estimates asking-price medians from observed listings, and publishes qualifying offers to the Telegram Mini App.

## Architecture — no hosted database

- `bot.py` — Python scanner, filters, rolling price comparison, Telegram notifications, and JSON feed generation.
- `config.json` — postcode, radius, search queries, price limits, and discount thresholds.
- `.github/workflows/deals.yml` — scheduled scan every 15 minutes and manual workflow dispatch.
- `deals-data` branch — stores the public feed at `data/deals.json`; this branch is separate from the app code.
- `web/` — Next.js Mini App deployed on Vercel. Its `/api/deals` route reads and caches the JSON feed from GitHub.
- Favorites and display preferences are stored in each user's browser (`localStorage`); they are not synchronized between devices.
- The scanner's rolling comparison state is kept in a local SQLite file (`state.db`) and restored with GitHub Actions cache. This is not a hosted database and is best-effort: cache eviction can reset the price history.

Supabase is not required by this project. The web app does not need a Supabase URL or service-role key.

## 1. GitHub Actions setup

Under **Settings → Secrets and variables → Actions**, configure:

| Secret | Purpose |
|---|---|
| `TELEGRAM_TOKEN` | Send bot notifications and validate Telegram Mini App `initData` |
| `TELEGRAM_CHAT_ID` | Destination chat for deal alerts |

The scanner workflow requires **read and write access to repository contents** because it publishes `data/deals.json` to the `deals-data` branch. The workflow already declares `contents: write`.

The `deals-data` branch must contain `data/deals.json`. Its initial content can be:

    {
      "updatedAt": null,
      "deals": []
    }

Open **Actions → deals → Run workflow** to start a scan manually. After that, GitHub Actions runs the scanner every 15 minutes. Each run restores the existing feed, scans Marktplaats, and publishes only changed JSON. The Mini App refreshes its catalog every five minutes and the API cache is short-lived.

## 2. Vercel setup

The Vercel project should be connected to this repository with:

- **Root Directory:** `web`
- **Framework:** Next.js
- **Production branch:** `main`
- **Production URL:** public HTTPS URL reachable by Telegram

Add this server-only Production Environment Variable:

- `TELEGRAM_TOKEN`

No `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` variables are needed. The GitHub feed is public JSON; no database credentials are sent to the browser.

## 3. Telegram Mini App

1. Open [@BotFather](https://t.me/BotFather).
2. Use `/setmenubutton` and select the Deal Radar bot.
3. Set the button title, for example `Open Deal Radar`.
4. Paste the Vercel Production URL.
5. Open the bot and tap the menu button.

The app uses Telegram's official WebApp script. The server validates the signed `initData`; it does not trust `initDataUnsafe` as authentication.

## 4. Local development

Requirements: Python 3.9+ and Node.js 24+.

Scanner (from the repository root):

    export TELEGRAM_TOKEN="..."
    export TELEGRAM_CHAT_ID="..."
    python bot.py --dry

Mini App:

    cd web
    cp .env.example .env.local
    # Set TELEGRAM_TOKEN in .env.local
    npm install
    npm run dev

Before deploying, run:

    npm run typecheck
    npm run build

## 5. What the app includes

- Responsive dark interface designed for Telegram mobile WebView.
- Real Marktplaats listing cards with image (when available), asking price, estimated market price, discount, location, and risk flags.
- Category filter, title search, sorting, listing details, and a direct link to the original listing.
- Local favorites and local display preferences.
- Telegram Mini App startup and server-side HMAC validation.
- JSON catalog cached by the Vercel API route; no Supabase dependency.

The feed starts empty. It is populated only when the scanner discovers qualifying deals; the app does not generate demo listings.

## 6. Limitations and safety

- Marktplaats does not offer a public API for this search use case. The scanner uses an internal website endpoint that can change or block data-center IP addresses. Inspect the `deals` workflow logs if a scan fails.
- The market reference is a median of observed asking prices, not completed sale prices. It is an estimate, not a guarantee.
- Initial market history is sparse. The scanner may need multiple successful runs before it has enough observations to identify a meaningful discount.
- `state.db` is restored using GitHub Actions cache. Cache eviction can reset price history; the public feed is stored separately on `deals-data`.
- The current config includes postcode `7671` and a 50 km radius. Make the repository private if you do not want to expose the search area.
- Never commit Telegram tokens, `.env.local`, or `state.db`.

Deal Radar finds candidates, not guaranteed bargains. Check condition, authenticity, seller reputation, and safe payment before buying.
