import { test } from "node:test";
import assert from "node:assert/strict";
import { readSettings, settingsQuery, DEFAULT_SETTINGS } from "../lib/settings";

test("v1 settings migrate without the old hidden €800 cap", () => {
  const migrated = readSettings({ categories: ["airpods-pro", "ps5"], minDiscount: 20, minPrice: 50, maxPrice: 800 });
  assert.equal(migrated.maxPrice, null);
  assert.equal(migrated.minPrice, 50);
  assert.deepEqual(migrated.categories, ["airpods-pro-3", "ps5"]);
  assert.equal(readSettings({ maxPrice: 1200, priceFilterConfigured: true }).maxPrice, 1200);
});

test("query carries every setting to the server", () => {
  const params = settingsQuery({ ...DEFAULT_SETTINGS, location: { label: "Utrecht", city: "Utrecht", postcode: "3511KE", lat: 52.09, lon: 5.12, source: "manual" },
    radiusKm: 30, minPrice: 100, maxPrice: 2500, minDiscount: 20, minProfit: 50, minRoi: 25, categories: ["ps5", "macbook"], condition: "used", exactOnly: true }, "distance");
  assert.equal(params.toString(), "sort=distance&lat=52.09&lon=5.12&radiusKm=30&minPrice=100&maxPrice=2500&minDiscount=20&minProfit=50&minRoi=25&categories=ps5%2Cmacbook&condition=used&exactOnly=1&priority=profit");
});

test("whole country means no radius parameter at all", () => {
  const params = settingsQuery({ ...DEFAULT_SETTINGS, location: { label: "A", city: "A", postcode: null, lat: 52, lon: 5, source: "gps" }, radiusKm: null }, "profit");
  assert.equal(params.get("radiusKm"), null);
});
