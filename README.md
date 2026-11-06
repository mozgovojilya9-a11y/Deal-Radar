# Deal Radar — Marktplaats → Telegram Mini App

Deal Radar searches configured Marktplaats categories near the configured Dutch postcode, estimates asking-price medians from its rolling history, and sends qualifying deals to Telegram. It also publishes qualifying deals to Supabase for the Telegram Mini App.

## Project layout

- `bot.py` — Python standard-library-only Marktplaats scanner, filters, market median and Telegram notification.
- `config.json` — postcode, radius, categories, price limits and discount thresholds.
- `.github/workflows/deals.yml` — scheduled Python scanner (every 15 minutes).
- `web/` — Next.js Telegram Mini App.
- `supabase/schema.sql` — database schema for the Mini App.
- `.github/workflows/mini-app-build.yml` — type-checks and production-builds the web app.

## 1. Connect Supabase (required for the Mini App feed)

1. Create a Supabase project.
2. Open **SQL Editor** and run the complete contents of `supabase/schema.sql`.
3. In Supabase project settings, copy:
   - Project URL.
   - Server-side service-role secret key (keep it private).
4. Add these GitHub repository secrets under **Settings → Secrets and variables → Actions**:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - Existing `TELEGRAM_TOKEN`
   - Existing `TELEGRAM_CHAT_ID`
5. Run **Actions → deals → Run workflow** once to verify that the scanner can publish new qualifying deals.

The bot upserts qualified deals by `listing_id`, so repeated detections update the existing row instead of creating duplicates. Only deals which pass the existing filters/market-discount threshold are published. The Mini App does not invent sample listings.

The Mini App reads Supabase only from Next.js server routes. The service-role key must never be exposed to browser JavaScript or named with the `NEXT_PUBLIC_` prefix. Row Level Security is enabled and anonymous browser access is not granted.

## 2. Vercel configuration

The Vercel project is linked to this repository. Configure it as follows:

- **Root Directory:** `web`
- **Framework Preset:** Next.js
- **Node.js:** 24.x (or a Vercel-supported current LTS)
- **Deployment Protection / SSO:** production URL must be publicly accessible to Telegram. Do not leave Vercel login protection on the Telegram-facing production domain.

Add these server-only Production Environment Variables in Vercel:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TELEGRAM_TOKEN`

Use the same Supabase values as GitHub Actions. `TELEGRAM_TOKEN` is used only by the server to validate Telegram Mini App `initData`. Never use `NEXT_PUBLIC_TELEGRAM_TOKEN` or `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`.

After setting the root directory and variables, redeploy the `main` branch. The production URL should return the Deal Radar interface rather than a 404.

## 3. Connect Telegram Mini App

After the public Vercel deployment is ready:

1. Open [@BotFather](https://t.me/BotFather).
2. Send `/setmenubutton` and select the Deal Radar bot.
3. Set the button title to `Open Deal Radar` (or `Открыть Deal Radar`).
4. Paste the public HTTPS Production URL from Vercel.
5. Open the bot chat and tap its menu button.

The app loads Telegram's official WebApp script. The server validates the raw `initData` signature with `TELEGRAM_TOKEN`, checks that `auth_date` is recent, and does not trust `initDataUnsafe` as authentication.

## 4. GitHub Actions secrets

For the scheduled scanner, configure the following repository secrets:

| Secret | Purpose |
|---|---|
| `TELEGRAM_TOKEN` | Send Telegram notifications |
| `TELEGRAM_CHAT_ID` | Destination chat |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side database upsert |

The bot can still scan and notify Telegram when Supabase credentials are absent, but the Mini App feed will not receive new rows. Once Supabase is set up, rerun the workflow.

## 5. Local development

Python 3.9+ and Node.js 24+.

Python scanner:

```bash
export TELEGRAM_TOKEN="..."
export TELEGRAM_CHAT_ID="..."
export SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="..."
python bot.py --dry
```

Mini App:

```bash
cd web
cp .env.example .env.local
# Fill the server-only values in .env.local
npm install
npm run dev
```

For a production compile:

```bash
npm run typecheck
npm run build
```

## 6. What is currently implemented

- Responsive dark Deal Radar interface designed for Telegram mobile WebView.
- Deal cards with image (when Marktplaats provides one), price, market estimate, discount, location and risk flags.
- Category filter, title search, sorting and local favorites.
- Listing detail panel and direct link to the original Marktplaats listing.
- Telegram Mini App SDK startup and server-side HMAC validation of `initData`.
- Supabase REST integration using Python's standard-library `urllib` and server-side Next.js `fetch`.
- Upsert/deduplication by Marktplaats listing ID.
- CI workflow for Next.js type-check and production build.

The repository branch and deployment still need the external Supabase project/keys configured. The Mini App feed remains empty until the bot detects and publishes qualifying deals.

## 7. Important limitations and safety

- Marktplaats has no public API for this search use case. The scanner uses an internal website endpoint which may change or block data-center IP addresses. GitHub Actions may receive HTTP 403; inspect workflow logs.
- The market reference is the median of observed asking prices, not completed transaction prices. It is an estimate, not a guarantee.
- Initial price history is sparse. The scanner may need multiple cycles before enough model/category observations exist to calculate a reliable comparison.
- The Actions cache for `state.db` is best-effort, not durable storage. Cache eviction can reset price history. Supabase separately stores the Mini App's qualifying deal feed.
- The current configuration includes postcode `7671` and a 50 km radius. Consider making this GitHub repository **Private** if you do not want to reveal the search area.
- Never commit Telegram tokens, Supabase service-role keys, `.env.local`, or `state.db`.

Deal Radar finds candidates. Check condition, authenticity, seller reputation and safe payment before buying.
