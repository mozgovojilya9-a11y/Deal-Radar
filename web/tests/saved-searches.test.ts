import { test } from "node:test";
import assert from "node:assert/strict";
import { addSavedSearch, isSaved, readHistory, readSavedSearches, rememberQuery, removeSavedSearch } from "../lib/saved-searches";

test("recent queries: newest first, no duplicates, at most 8", () => {
  let history: string[] = [];
  for (const query of ["ps5", "iphone 15", "PS5 ", "a", ...Array.from({ length: 10 }, (_, i) => "query " + i)]) history = rememberQuery(history, query);
  assert.equal(history.length, 8);
  assert.equal(history[0], "query 9");
  assert.equal(history.filter((item) => item.toLowerCase() === "ps5").length, 0);
  assert.deepEqual(rememberQuery(["iphone 15", "ps5"], "  PS5  "), ["PS5", "iphone 15"]);
  assert.deepEqual(rememberQuery(["ps5"], "x"), ["ps5"]);
});

test("saved searches are unique and removable", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  let saved = addSavedSearch([], { text: "iphone 15", category: "", dropsOnly: false }, now);
  saved = addSavedSearch(saved, { text: "IPHONE  15", category: "", dropsOnly: false }, now);
  assert.equal(saved.length, 1);
  saved = addSavedSearch(saved, { text: "iphone 15", category: "iphone-15", dropsOnly: true }, now);
  assert.equal(saved.length, 2);
  assert.ok(isSaved(saved, { text: "iphone 15", category: "iphone-15", dropsOnly: true }));
  assert.equal(addSavedSearch(saved, { text: " ", category: "", dropsOnly: false }, now).length, 2);
  assert.equal(removeSavedSearch(saved, saved[0].id).length, 1);
});

test("stored data of the wrong shape is dropped", () => {
  assert.deepEqual(readSavedSearches({ nope: 1 }), []);
  assert.deepEqual(readSavedSearches([{ id: "a", text: "ps5" }, null]), []);
  assert.deepEqual(readHistory(["ps5", 3, "", "iphone"]), ["ps5", "iphone"]);
});
