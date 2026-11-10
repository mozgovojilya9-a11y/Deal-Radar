import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogMatcher } from "../lib/catalog-search";

type Row = { title: string; category_label: string; category_key: string };
const row = (title: string, category_key = "x", category_label = ""): Row => ({ title, category_key, category_label });

const ROWS = {
  iphone15pro: row("Apple iPhone 15 Pro 128GB Natural Titanium", "iphone-15", "iPhone 15"),
  iphone15: row("iPhone 15 128GB zwart", "iphone-15", "iPhone 15"),
  iphone16: row("iPhone 16 Pro 256GB, €150 korting", "iphone-16", "iPhone 16"),
  ps5: row("PS5 Slim Disc Edition", "ps5", "PlayStation 5"),
  ps5digital: row("PlayStation 5 Digital Edition 825GB", "ps5", "PlayStation 5"),
  ps4: row("PS4 Pro 1TB met controller", "other", "Другое"),
  airpodsMax: row("Apple AirPods Max 2 USB-C", "airpods-max", "AirPods Max"),
  macbookAir: row("MacBook Air M2 13 inch 256GB", "macbook", "MacBook Air / Pro"),
  sonyXm5: row("Sony WH-1000XM5 zwart", "headphones-sony", "Наушники Sony"),
  tissot: row("Tissot PR100 Sport Chrono Dames", "watch-tissot", "Tissot"),
  dji: row("DJI Mini 4 Pro Fly More Combo", "drones", "Дроны DJI"),
};
type Key = keyof typeof ROWS;

const cases: Array<[query: string, expected: Key[]]> = [
  ["iphone 15", ["iphone15pro", "iphone15"]],
  ["айфон 15 про", ["iphone15pro"]],
  ["iPhone15", ["iphone15pro", "iphone15"]],
  ["ps5", ["ps5", "ps5digital"]],
  ["пс5", ["ps5", "ps5digital"]],
  ["playstation 5 digital", ["ps5digital"]],
  ["airpod max", ["airpodsMax"]],
  ["эйрподс макс", ["airpodsMax"]],
  ["macbok air", ["macbookAir"]],
  ["сони наушники", ["sonyXm5"]],
  ["headphones", ["sonyXm5"]],
  ["xm5", ["sonyXm5"]],
  ["wh1000xm5", ["sonyXm5"]],
  ["tisot", ["tissot"]],
  ["часы", ["tissot"]],
  ["дрон", ["dji"]],
  ["128", ["iphone15pro", "iphone15"]],
  ["256gb", ["iphone16", "macbookAir"]],
  ["15", ["iphone15pro", "iphone15"]],
  ["iphone pro", ["iphone15pro", "iphone16"]],
];

for (const [query, expected] of cases) {
  test("catalogue search «" + query + "»", () => {
    const matches = catalogMatcher(query);
    const found = (Object.keys(ROWS) as Key[]).filter((key) => matches(ROWS[key]));
    assert.deepEqual(found, expected);
  });
}

test("edition words are whole words", () => {
  assert.equal(catalogMatcher("iphone 13 pro")(row("iPhone 13 128gb Product Red!")), false);
  assert.equal(catalogMatcher("dyson air")(row("Dyson Airwrap Complete")), false);
  assert.equal(catalogMatcher("dyson airwrap")(row("Dyson Airwrap Complete")), true);
});

test("an empty or one-letter query matches everything", () => {
  assert.equal(catalogMatcher("")(ROWS.ps4), true);
  assert.equal(catalogMatcher(" a ")(ROWS.ps4), true);
});
