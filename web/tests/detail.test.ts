import { test } from "node:test";
import assert from "node:assert/strict";
import { pricePosition, profitAt, profitSteps } from "../lib/detail";

test("profit steps reproduce the scanner's profit for a real feed deal", () => {
  // Canon EOS R50 from the live feed: asking €300, expected resale €522.50, scanner profit €151.47.
  const steps = profitSteps(300, 522.5);
  assert.deepEqual(steps.rows.map((row) => [row.key, row.amount]), [
    ["resale", 522.5], ["negotiation", -20.9], ["fees", -40.13], ["fixed", -10], ["asking", -300],
  ]);
  assert.equal(steps.netSale, 451.47);
  assert.equal(steps.profit, 151.47);
  assert.equal(steps.roi, 0.5049);
});

test("profit at another purchase price uses the same net sale", () => {
  assert.deepEqual(profitAt(270, 522.5), { profit: 181.47, roi: 0.6721 });
  assert.deepEqual(profitAt(451.47, 522.5), { profit: 0, roi: 0 });
  assert.equal(profitAt(500, 522.5).profit, -48.53);
  assert.equal(profitAt(0, 522.5).roi, null);
});

test("price position among used offers", () => {
  const offers = [550, 550, 550, 630, 730, 800, 900].map((price) => ({ price, condition: "used" }));
  const position = pricePosition(300, [...offers, { price: 917, condition: "new" }, { price: null, condition: "used" }]);
  assert.ok(position);
  assert.equal(position.count, 7);
  assert.equal(position.min, 550);
  assert.equal(position.max, 900);
  assert.equal(position.median, 630);
  assert.equal(position.cheaperThan, 7);
  // The listing is below the whole range: the axis starts at its price.
  assert.equal(position.axisMin, 300);
  assert.equal(position.at(300), 0);
  assert.equal(position.at(900), 1);
});

test("price inside the range is placed proportionally", () => {
  const position = pricePosition(600, [500, 600, 700, 800].map((price) => ({ price, condition: "used" })));
  assert.ok(position);
  assert.equal(position.cheaperThan, 2);
  assert.equal(position.at(600), 1 / 3);
});

test("too few used offers give no position", () => {
  assert.equal(pricePosition(100, [{ price: 200, condition: "used" }, { price: 210, condition: "used" }, { price: 900, condition: "new" }]), null);
});
