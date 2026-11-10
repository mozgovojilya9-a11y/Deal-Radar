import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dealScore, scoreTone } from "../lib/score";

type Fixture = { name: string; deal: Record<string, unknown>; ageHours: number; expected: { total: number; parts: Record<string, number> } };
const fixtures = JSON.parse(readFileSync(new URL("../../score_fixtures.json", import.meta.url), "utf8")) as Fixture[];

for (const fixture of fixtures) {
  test("score equals the scanner's: " + fixture.name, () => {
    const result = dealScore(fixture.deal, fixture.ageHours);
    assert.equal(result.total, fixture.expected.total);
    assert.deepEqual(result.parts, fixture.expected.parts);
  });
}

test("score tones", () => {
  assert.deepEqual([80, 60, 40, 10].map(scoreTone), ["top", "solid", "fair", "weak"]);
});
