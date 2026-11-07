import { test } from "node:test";
import assert from "node:assert/strict";
import { groundedMarketOffers } from "../lib/grounded-search";

test("only prices inside segments grounded to a non-Marktplaats source are accepted", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  const body = {
    candidates: [{
      content: { parts: [{ text: "..." }] },
      groundingMetadata: {
        webSearchQueries: ["playstation 5 slim disc prijs"],
        groundingChunks: [
          { web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/a", title: "coolblue.nl" } },
          { web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/b", title: "marktplaats.nl" } },
          { web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/c", title: "backmarket.nl" } },
        ],
        groundingSupports: [
          { segment: { text: "PlayStation 5 Slim Disc Edition | Coolblue | nieuw | €529" }, groundingChunkIndices: [0] },
          { segment: { text: "PlayStation 5 Slim Disc Edition | Marktplaats | gebruikt | €350" }, groundingChunkIndices: [1] },
          { segment: { text: "PlayStation 5 Slim Disc Edition | Back Market | refurbished | €439" }, groundingChunkIndices: [2] },
          { segment: { text: "Tussen €400 en €450 bij diverse winkels" }, groundingChunkIndices: [0] },
          { segment: { text: "PlayStation 5 Slim Disc Edition | Bol | nieuw | €499" }, groundingChunkIndices: [] },
        ],
      },
    }],
  };
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    if (url.includes("generativelanguage")) return new Response(JSON.stringify(body), { status: 200 });
    const target = url.endsWith("/a") ? "https://www.coolblue.nl/product/941835/playstation-5-slim-disc-edition.html" : "https://www.backmarket.nl/nl-nl/p/ps5-slim/1";
    return new Response(null, { status: 302, headers: { location: target } });
  }) as typeof fetch;
  try {
    const result = await groundedMarketOffers("PlayStation 5 Slim Disc Edition", Date.now() + 10000, { new: true, used: true, refurbished: true });
    assert.deepEqual(result.offers.map((offer) => [offer.domain, offer.price, offer.condition]), [["coolblue.nl", 529, "new"], ["backmarket.nl", 439, "refurbished"]]);
    assert.equal(result.offers[0].url, "https://www.coolblue.nl/product/941835/playstation-5-slim-disc-edition.html");
  } finally {
    globalThis.fetch = original;
  }
});
