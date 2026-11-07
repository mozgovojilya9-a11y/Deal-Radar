import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST } from "../app/api/contact/route";
import { normalizeContact, validateContact } from "../lib/site/contact";

const valid = { name: "Anna de Vries", email: "anna@example.nl", subject: "Vraag over Deal Radar", message: "Hoe vaak wordt de catalogus bijgewerkt?" };
let ipCounter = 0;
const send = (body: Record<string, unknown>, headers: Record<string, string> = {}) => POST(new NextRequest("http://localhost/api/contact", {
  method: "POST",
  headers: { "Content-Type": "application/json", host: "localhost", origin: "http://localhost", "x-forwarded-for": `10.0.0.${++ipCounter}`, ...headers },
  body: JSON.stringify({ startedAt: Date.now() - 10_000, website: "", locale: "nl", ...body }),
}));

type Sent = { url: string; body: Record<string, unknown> };
function mockFetch(ok = true): Sent[] {
  const sent: Sent[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    sent.push({ url: String(url), body: JSON.parse(String(init?.body || "{}")) });
    return new Response("{}", { status: ok ? 200 : 500 });
  }) as typeof fetch;
  return sent;
}
function setEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
}

test("validation rejects short or malformed fields", () => {
  assert.deepEqual(validateContact(normalizeContact(valid)), []);
  assert.deepEqual(validateContact(normalizeContact({ ...valid, email: "not-an-email" })), ["email"]);
  assert.deepEqual(validateContact(normalizeContact({ name: "A", email: "", subject: "", message: "hi" })).sort(), ["email", "message", "name", "subject"]);
});

test("without any delivery channel the API says unavailable instead of faking success", async () => {
  setEnv({ TELEGRAM_TOKEN: undefined, CONTACT_TELEGRAM_CHAT_ID: undefined, RESEND_API_KEY: undefined, CONTACT_FROM_EMAIL: undefined });
  const sent = mockFetch();
  const response = await send(valid);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "unavailable");
  assert.equal(sent.length, 0);
});

test("delivers to Telegram and email when configured, with HTML escaped", async () => {
  setEnv({ TELEGRAM_TOKEN: "123:abc", CONTACT_TELEGRAM_CHAT_ID: "42", RESEND_API_KEY: "re_test", CONTACT_FROM_EMAIL: "Deal Radar <site@example.com>" });
  const sent = mockFetch();
  const response = await send({ ...valid, message: "Werkt <b>dit</b> ook met AirPods?" });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
  const telegram = sent.find((item) => item.url.includes("api.telegram.org"));
  const email = sent.find((item) => item.url.includes("api.resend.com"));
  assert.ok(telegram && email);
  assert.equal(telegram.body.chat_id, "42");
  assert.match(String(telegram.body.text), /&lt;b&gt;dit&lt;\/b&gt;/);
  assert.equal(email.body.reply_to, valid.email);
});

test("reports failure when every configured channel fails", async () => {
  setEnv({ TELEGRAM_TOKEN: "123:abc", CONTACT_TELEGRAM_CHAT_ID: "42", RESEND_API_KEY: undefined, CONTACT_FROM_EMAIL: undefined });
  mockFetch(false);
  const response = await send(valid);
  assert.equal(response.status, 502);
});

test("spam protection: honeypot, instant submit, foreign origin, link spam", async () => {
  setEnv({ TELEGRAM_TOKEN: "123:abc", CONTACT_TELEGRAM_CHAT_ID: "42" });
  const sent = mockFetch();
  assert.equal((await send({ ...valid, website: "http://spam.example" })).status, 400);
  assert.equal((await send({ ...valid, startedAt: Date.now() })).status, 400);
  assert.equal((await send(valid, { origin: "https://evil.example" })).status, 403);
  assert.equal((await send({ ...valid, message: "buy http://a.com http://b.com http://c.com http://d.com now" })).status, 400);
  assert.equal(sent.length, 0);
});

test("invalid input returns the failing fields", async () => {
  mockFetch();
  const response = await send({ ...valid, email: "nope" });
  assert.equal(response.status, 422);
  assert.deepEqual((await response.json()).fields, ["email"]);
});

test("rate limit: at most 5 messages per hour per address", async () => {
  setEnv({ TELEGRAM_TOKEN: "123:abc", CONTACT_TELEGRAM_CHAT_ID: "42" });
  mockFetch();
  const statuses: number[] = [];
  for (let i = 0; i < 6; i += 1) statuses.push((await send(valid, { "x-forwarded-for": "192.168.1.1" })).status);
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
});
