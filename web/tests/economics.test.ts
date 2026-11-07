import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PROFITABILITY, resaleEconomics } from "../lib/economics";

test("web profitability constants match the scanner config", () => {
  const config = JSON.parse(readFileSync(new URL("../../config.json", import.meta.url), "utf8"));
  for (const [key, value] of Object.entries(PROFITABILITY)) assert.equal(config.profitability[key], value, key);
});

test("profit after negotiation, fee and fixed costs equals the scanner formula", () => {
  // Scanner: 295 * 0.95 = 280.25; *(1-0.04)*(1-0.08) - 10 - 150 = 87.52
  const result = resaleEconomics(150, 295);
  assert.equal(result.expectedResale, 280.25);
  assert.equal(result.profit, 87.52);
  assert.equal(Math.round(result.roi * 100), 58);
});
