import assert from "node:assert/strict";
import test from "node:test";
import { revalueForListing, type MarketOffer } from "../lib/market-research";

const offer = (title: string, price: number, domain = "kleinanzeigen.de"): MarketOffer =>
  ({ title, price, domain, url: "https://" + domain + "/" + price, segment: "used", method: "jsonld", official: false, availability: "in_stock" }) as MarketOffer;
const AT = "2026-11-08T00:00:00.000Z";

test("offers of another generation give a listing no market value", () => {
  const result = revalueForListing("Nintendo Switch (2019)", null, [offer("Nintendo Switch 2", 380), offer("Nintendo Switch 2 Konsole", 399), offer("Nintendo Switch 2 NEU", 400)], AT);
  assert.equal(result.valuation.marketValue, null);
  assert.equal(result.removed, 3);
});

test("only the exact product's offers form the median", () => {
  const offers = [offer("Canon EOS R6 Body", 1000), offer("Canon EOS R6 Gehäuse", 1100), offer("Canon EOS R6", 1200), offer("Canon EOS R6 Mark II Body", 1600), offer("Canon EOS R6 Mark II", 1700)];
  const result = revalueForListing("Canon EOS R6", null, offers, AT);
  assert.equal(result.valuation.marketValue, 1100);
  assert.equal(result.offers.length, 3);
});

test("a group holding two watch models values each by its own offers", () => {
  const offers = [offer("Casio GPR-H1000", 500), offer("Casio GPR-H1000-1", 520), offer("Casio G-Shock GPR-H1000", 540), offer("Casio GBD-H1000", 180), offer("Casio G-Shock GBD-H1000", 190), offer("GBD-H1000 Casio", 200)];
  assert.equal(revalueForListing("Casio GPR-H1000", "h1000", offers, AT).valuation.marketValue, 520);
  assert.equal(revalueForListing("Casio GBD-H1000", "h1000", offers, AT).valuation.marketValue, 190);
});
