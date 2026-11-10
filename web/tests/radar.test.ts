import { test } from "node:test";
import assert from "node:assert/strict";
import type { Deal } from "../lib/deals";
import { radarPoints } from "../lib/radar";

const deal = (id: string, category_key: string, deal_score: number, estimated_profit: number) =>
  ({ listing_id: id, category_key, deal_score, estimated_profit, status: "good" }) as unknown as Deal;

const distance = (point: { x: number; y: number }) => Math.hypot(point.x - 50, point.y - 50);

test("a higher score sits closer to the centre and stays inside the scope", () => {
  const [top, low] = radarPoints([deal("a", "ps5", 95, 100), deal("b", "ps5", 20, 100)]);
  assert.ok(distance(top) < distance(low));
  for (const point of [top, low]) assert.ok(distance(point) <= 46.01 && distance(point) >= 8);
});

test("a dot keeps its place between refreshes and grows with profit", () => {
  const first = radarPoints([deal("m1", "iphone-15", 60, 50), deal("m2", "iphone-15", 60, 200)]);
  const again = radarPoints([deal("m2", "iphone-15", 60, 200), deal("m1", "iphone-15", 60, 50)]);
  assert.deepEqual([again[1].x, again[1].y], [first[0].x, first[0].y]);
  assert.ok(first[1].size > first[0].size);
});

test("different category groups land in different sectors", () => {
  const [phone, watch] = radarPoints([deal("p", "iphone-15", 60, 80), deal("w", "watch-tissot", 60, 80)]);
  assert.notEqual(phone.group, watch.group);
  const angle = (point: { x: number; y: number }) => Math.atan2(point.y - 50, point.x - 50);
  assert.ok(Math.abs(angle(phone) - angle(watch)) > 0.3);
});
