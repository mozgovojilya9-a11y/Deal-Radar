import assert from "node:assert/strict";
import { test } from "node:test";
import { addPurchase, markSold, purchaseSummary, readPurchases, removePurchase, sellerMessage, type Purchase } from "../lib/purchases";
import { offerLimits } from "../lib/economics";

const row = (id: string, paid: number, soldFor: number | null = null, expectedProfit: number | null = 50): Purchase => ({ id, title: "PS5 " + id, url: "", paid, expectedProfit, boughtAt: "2026-11-09T10:00:00Z", soldFor });

test("realised profit counts only sold items, stock is separate", () => {
  assert.deepEqual(purchaseSummary([row("a", 200, 280), row("b", 300, 250), row("c", 100, null, 40)]), { count: 3, soldCount: 2, realizedProfit: 30, inStock: 100, expectedProfit: 40 });
});

test("the same listing is not counted twice", () => {
  assert.equal(addPurchase([row("a", 200)], row("a", 180)).length, 1);
  assert.equal(addPurchase([row("a", 200)], row("a", 180))[0].paid, 180);
});

test("a sale can be recorded, undone and a record removed", () => {
  const sold = markSold([row("a", 200)], "a", 260);
  assert.equal(sold[0].soldFor, 260);
  assert.equal(markSold(sold, "a", null)[0].soldFor, null);
  assert.deepEqual(removePurchase(sold, "a"), []);
});

test("broken stored data is dropped, not shown", () => {
  assert.deepEqual(readPurchases("x"), []);
  assert.equal(readPurchases([row("a", 200), { id: "b" }, { id: "c", title: "x", paid: -5 }]).length, 1);
});

test("seller message names the offer", () => {
  assert.match(sellerMessage("JBL Charge 5", 70), /€70/);
});

test("offer limits leave the required profit and ROI", () => {
  const { maxOffer, openingOffer } = offerLimits(200, 340, 50, 0.2);
  assert.equal(maxOffer, 280);
  assert.ok(340 - maxOffer! >= 50 && (340 - maxOffer!) / maxOffer! >= 0.2);
  assert.equal(openingOffer, 180);
});

test("no offer is suggested when nothing can be earned", () => {
  assert.deepEqual(offerLimits(100, 40, 50, 0.2), { maxOffer: null, openingOffer: null });
});
