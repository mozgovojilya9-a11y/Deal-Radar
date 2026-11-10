import { test } from "node:test";
import assert from "node:assert/strict";
import { understandQuery } from "../lib/query-understanding";

test("Russian product names, typos and spacing become clean model queries", () => {
  assert.equal(understandQuery("айфон 15 про макс").query, "iPhone 15 Pro Max");
  assert.equal(understandQuery("плейстейшн 5 слим").query, "PlayStation 5 Slim");
  assert.equal(understandQuery("эйрподс про 3").query, "AirPods Pro 3");
  assert.equal(understandQuery("airpdos pro 2").query, "airpods pro 2");
  assert.equal(understandQuery("Sony A7 IV").query, "Sony A7 IV");
  assert.equal(understandQuery("samsnug oled tv").query, "samsung oled tv");
  assert.deepEqual(understandQuery("DJI Mini 4 Pro").corrections, []);
  assert.equal(understandQuery("айфон 14 плюс 128").query, "iPhone 14 Plus 128");
  assert.equal(understandQuery("макбук эйр м2").query, "MacBook Air M2");
  assert.equal(understandQuery("эпл вотч 46").query, "Apple Watch 46");
  assert.equal(understandQuery("джбл чардж").query.startsWith("JBL"), true);
  assert.equal(understandQuery("стим дек").query, "Steam Deck");
});
