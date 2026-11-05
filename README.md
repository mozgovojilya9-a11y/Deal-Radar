# Deal Radar

> Marktplaats bargain finder that compares listing prices to an observed market median and sends qualified deals to Telegram.

## Features
- Searches configured product categories near a configured Dutch postcode.
- Builds a rolling price history in SQLite and compares new listings against model/category medians.
- Filters suspicious listings and shows softer risk warnings.
- Sends only qualifying deals to Telegram; it never contacts sellers.
- Runs on a local machine or on a 15-minute GitHub Actions schedule.

## Repository layout
- `bot.py` — Python standard-library-only bot.
- `config.json` — search region, categories, price bounds, filters and discount thresholds.
- `.github/workflows/deals.yml` — scheduled GitHub Actions workflow.
- `.env.example` — names of local environment variables (no real secrets).

## GitHub Actions setup
1. In **Settings → Secrets and variables → Actions**, add `TELEGRAM_TOKEN` and `TELEGRAM_CHAT_ID`.
2. Open **Actions → deals** and select **Run workflow** for the first manual run.
3. Review the workflow logs. Scheduled runs are configured every 15 minutes.

The workflow uses GitHub Actions cache for `state.db`. Cache is best-effort storage, not a durable database; cache eviction or concurrent runs can reset price history. For durable history, run the bot on a persistent machine/VM with a persistent disk.

## Local setup
Python 3.9+; no third-party packages are required.

```bash
export TELEGRAM_TOKEN="..."
export TELEGRAM_CHAT_ID="..."
python bot.py --test-telegram
python bot.py --dry
python bot.py --loop 600
```

For Windows PowerShell:

```powershell
$env:TELEGRAM_TOKEN="..."
$env:TELEGRAM_CHAT_ID="..."
python bot.py --dry
```

Never commit `.env`, Telegram tokens, chat IDs intended to remain private, or `state.db`.

## Configuration
Edit `config.json` to change postcode, search radius, categories, allowed price ranges, include/exclude words, model grouping and discount thresholds.

The current configuration targets postcode `7671` within 50 km of Vriezenveen. Consider keeping this repository private if you do not want to disclose the search area.

## How the deal score works
- Market estimate is the median of matching listings observed over the configured market window.
- When there are too few model-specific samples, the bot falls back to category-level statistics and applies a stricter threshold where configured.
- These are asking prices, not verified completed-sale prices.
- Hard red flags are rejected; softer warnings are included in Telegram messages.
- A very low price is explicitly marked as potentially suspicious.

## Important limitations
Marktplaats does not provide a public search API for this use case. The bot uses an internal website endpoint that may change or block automated access. Respect the website's terms and use a conservative request frequency. GitHub-hosted runners may receive HTTP 403 responses; a persistent local machine may be more reliable.

The bot identifies candidates, not verified bargains. Check item condition, authenticity, seller reputation and safe in-person payment before buying.
