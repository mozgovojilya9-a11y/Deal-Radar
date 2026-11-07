import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPage, parsePriceNumber, textPrices } from "../lib/price-extract";

test("parses Dutch, English and EUR-prefixed formats", () => {
  const cases: Array<[string, number | null]> = [["€419", 419], ["EUR419.00", 419], ["419 EUR", 419], ["1.299,00", 1299], ["1,299.00", 1299],
    ["419,-", 419], ["419.-", 419], ["419,95", 419.95], ["1.299", 1299], ["€ 1 299,00", 1299], ["0,50", null], ["abc", null]];
  for (const [raw, expected] of cases) assert.equal(parsePriceNumber(raw), expected, raw);
});

test("finds every euro amount in running text", () => {
  assert.deepEqual(textPrices("Was €499,99 nu € 449,- of EUR419.00 en 379 EUR").map((item) => item.price), [499.99, 449, 419, 379]);
});

test("reads JSON-LD Product/AggregateOffer, keeps condition and rejects other currencies", () => {
  const html = `<html><head><title>X</title></head><body><h1>Ray-Ban Meta Wayfarer</h1>
  <script type="application/ld+json">{"@graph":[{"@type":"Product","name":"Ray-Ban Meta Wayfarer Gen 2","offers":{"@type":"AggregateOffer","offers":[{"@type":"Offer","price":"379.00","priceCurrency":"EUR","itemCondition":"https://schema.org/RefurbishedCondition","availability":"https://schema.org/InStock"}]}}]}</script>
  <script type="application/ld+json">{"@type":"Product","name":"US","offers":{"price":"299","priceCurrency":"USD"}}</script></body></html>`;
  const offers = extractPage(html, "https://shop.example/p").offers;
  assert.equal(offers.length, 1);
  assert.equal(offers[0].price, 379);
  assert.equal(offers[0].condition, "refurbished");
  assert.equal(offers[0].method, "jsonld");
});

test("falls back to meta tags, then to the price after the heading", () => {
  const meta = extractPage(`<meta property="product:price:amount" content="329.00"><meta property="product:price:currency" content="EUR"><h1>A</h1>`, "https://a.nl/p");
  assert.equal(meta.offers[0].price, 329);
  assert.equal(meta.offers[0].method, "meta");
  const text = extractPage(`<header>€ 5</header><h1>PS5 Slim</h1><p>Van €549,99 nu €474,-</p>`, "https://a.nl/p");
  assert.equal(text.offers[0].price, 474);
});
