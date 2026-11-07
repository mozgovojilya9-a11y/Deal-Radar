import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { href, LOCALES, pageFromSlug, SLUGS, SUB_PAGES, getDictionary } from "../lib/site/i18n";
import { categoryGroups, siteCategoryLabel, TOTAL_SEARCHES, FOCUS_KEYS } from "../lib/site/catalog";

const config = JSON.parse(readFileSync(new URL("../../config.json", import.meta.url), "utf8")) as { queries: Array<{ key: string }> };

test("every page has a unique slug per locale that resolves back to the page", () => {
  for (const locale of LOCALES) {
    const slugs = SUB_PAGES.map((page) => SLUGS[locale][page]);
    assert.equal(new Set(slugs).size, slugs.length);
    for (const page of SUB_PAGES) assert.equal(pageFromSlug(locale, SLUGS[locale][page]), page);
    assert.equal(href(locale, "home"), "/" + locale);
  }
});

test("website categories match the scanner configuration exactly", () => {
  const configured = new Set(config.queries.map((query) => query.key));
  assert.equal(TOTAL_SEARCHES, configured.size);
  for (const locale of LOCALES) {
    const listed = categoryGroups(locale).flatMap((group) => group.items.map((item) => item.key));
    assert.deepEqual(new Set(listed), configured);
  }
  for (const keys of Object.values(FOCUS_KEYS)) for (const key of keys) assert.ok(configured.has(key), key + " is not a scanner query");
});

test("public labels are Dutch/English, never the app's Russian labels", () => {
  for (const locale of LOCALES) {
    for (const query of config.queries) assert.doesNotMatch(siteCategoryLabel(query.key, locale), /[А-я]/, query.key);
    const t = getDictionary(locale);
    for (const group of categoryGroups(locale)) assert.ok(t.categories.groups[group.key], group.key);
  }
});

test("both dictionaries have the same FAQ, feature and step structure", () => {
  const [nl, en] = LOCALES.map(getDictionary);
  assert.equal(nl.faq.items.length, en.faq.items.length);
  assert.deepEqual(nl.features.items.map((item) => [item.key, item.status]), en.features.items.map((item) => [item.key, item.status]));
  assert.deepEqual(nl.how.steps.map((step) => step.key), en.how.steps.map((step) => step.key));
});
