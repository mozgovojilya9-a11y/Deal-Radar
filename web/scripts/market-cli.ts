/**
 * External market valuation for the Python scanner.
 * stdin:  JSON array [{ "key": "ps5|slim-disc", "title": "PS5 Slim Disc Edition", "hint": "slim disc", "referencePrice": 450 }]
 * stdout: JSON array of results, one per key. Marktplaats/2dehands are never used for the value.
 *
 * Run: node --no-warnings --import ./tests/register.mjs scripts/market-cli.ts < requests.json
 */
import { researchMarket } from "../lib/market-research";

type Request = { key: string; title: string; hint?: string | null; referencePrice?: number | null };

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

const requests = (JSON.parse(await readStdin()) as Request[])
  .filter((item) => item && typeof item.key === "string" && typeof item.title === "string" && item.title.trim().length >= 3)
  .slice(0, 200);
const budgetMs = Number(process.env.MARKET_CLI_BUDGET_MS || 35000);
const concurrency = Math.max(1, Math.min(4, Number(process.env.MARKET_CLI_CONCURRENCY || 3)));
const results: unknown[] = [];
const queue = [...requests];

await Promise.all(Array.from({ length: concurrency }, async () => {
  while (queue.length) {
    const request = queue.shift()!;
    const started = Date.now();
    try {
      const research = await researchMarket(request.title, {
        hint: request.hint || null,
        referencePrice: request.referencePrice ?? null,
        includeMarketplace: false,
        skipBlockedRetail: true,
        // Gemini Google Search quota is small: the scanner leaves it to interactive questions unless enabled.
        grounding: process.env.MARKET_CLI_GROUNDING === "1",
        fresh: true,
        budgetMs,
      });
      results.push({
        key: request.key,
        ok: true,
        query: research.identity.searchName,
        checkedAt: research.checkedAt,
        valuation: research.valuation,
        segments: research.segments,
        offers: research.offers.map((offer) => ({
          title: offer.title, price: offer.price, url: offer.url, domain: offer.domain,
          segment: offer.segment, method: offer.method, official: offer.official,
        })),
        providers: research.providersUsed,
        pagesFetched: research.pagesFetched,
        pagesWithPrices: research.pagesWithPrices,
        rejected: research.rejected,
        errors: research.errors.slice(0, 6),
        providerFailures: [...new Set(research.attempts.filter((attempt) => !attempt.ok && attempt.error).map((attempt) => attempt.provider + ": " + attempt.error))].slice(0, 6),
        groundedOffers: research.offers.filter((offer) => offer.method === "grounding").length,
        sourceHealth: research.sourceHealth,
        offerDomains: research.offers.reduce((acc, offer) => { acc[offer.domain] = (acc[offer.domain] || 0) + 1; return acc; }, {} as Record<string, number>),
        durationMs: Date.now() - started,
      });
    } catch (error) {
      results.push({ key: request.key, ok: false, error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - started });
    }
    process.stderr.write(`[market-cli] ${request.key}: ${Date.now() - started} ms\n`);
  }
}));

process.stdout.write(JSON.stringify(results));
