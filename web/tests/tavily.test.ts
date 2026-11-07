import { test } from "node:test";
import assert from "node:assert/strict";
import { researchMarket } from "../lib/market-research";

test("Tavily results give shop prices from page text the server could not fetch itself", async () => {
  process.env.TAVILY_API_KEY = "tvly-test";
  delete process.env.GEMINI_API_KEY;
  const original = globalThis.fetch;
  let tavilyCalls = 0;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://api.tavily.com/search") {
      tavilyCalls += 1;
      assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer tvly-test");
      return new Response(JSON.stringify({ results: [{
        title: "Sony WH-1000XM5 Zwart", url: "https://www.amazon.nl/Sony-WH-1000XM5/dp/B09Y2MYL5C",
        content: "Sony WH-1000XM5 draadloze koptelefoon", raw_content: "Amazon.nl Sony WH-1000XM5 Zwart Prijs: €279,00 Gratis bezorging",
      }] }), { status: 200 });
    }
    return new Response("blocked", { status: 403 }); // every direct fetch is blocked, like on a data-centre IP
  }) as typeof fetch;
  try {
    const research = await researchMarket("Sony WH-1000XM5", { budgetMs: 20000, fresh: true, includeMarketplace: false, grounding: false, includeUsed: false, includeRefurbished: false });
    assert.ok(tavilyCalls > 0);
    const amazon = research.offers.find((offer) => offer.domain === "amazon.nl");
    assert.ok(amazon, "Amazon offer from Tavily raw content");
    assert.equal(amazon!.price, 279);
    assert.equal(amazon!.segment, "new");
    assert.ok(research.providersUsed.includes("Tavily"));
  } finally {
    globalThis.fetch = original;
    delete process.env.TAVILY_API_KEY;
  }
});
