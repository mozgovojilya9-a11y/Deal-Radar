import { test } from "node:test";
import assert from "node:assert/strict";
import { isSealed, openFeed, readFeedText, sealFeed } from "../lib/feed-crypto";

const FEED = JSON.stringify({ valuationVersion: 2, deals: [{ listing_id: "m1", title: "PS5 Slim — €300" }] });

test("a sealed feed hides its content and opens with the same key", () => {
  const sealed = sealFeed(FEED, "secret-key");
  assert.ok(isSealed(sealed));
  assert.ok(!JSON.stringify(sealed).includes("PS5"));
  assert.equal(openFeed(sealed, "secret-key"), FEED);
  assert.deepEqual(readFeedText(JSON.stringify(sealed), "secret-key"), JSON.parse(FEED));
});

test("a wrong key or altered data is rejected", () => {
  const sealed = sealFeed(FEED, "secret-key");
  assert.throws(() => openFeed(sealed, "other-key"));
  const altered = { ...sealed, data: Buffer.from(Buffer.from(sealed.data, "base64").map((byte, index) => index === 3 ? byte ^ 1 : byte)).toString("base64") };
  assert.throws(() => openFeed(altered, "secret-key"));
  assert.throws(() => readFeedText(JSON.stringify(sealed), ""), /FEED_KEY/);
});

test("a plain feed is read as before", () => {
  assert.deepEqual(readFeedText(FEED, ""), JSON.parse(FEED));
});
