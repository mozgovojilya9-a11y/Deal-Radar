import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { POST } from "../app/api/feedback/route";

process.env.TELEGRAM_TOKEN = "123:test";
function initData(id: number) {
  const fields: Record<string, string> = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id }) };
  const check = Object.keys(fields).sort().map((key) => key + "=" + fields[key]).join("\n");
  const secret = createHmac("sha256", "WebAppData").update("123:test").digest();
  return new URLSearchParams({ ...fields, hash: createHmac("sha256", secret).update(check).digest("hex") }).toString();
}
const call = (body: unknown) => POST(new NextRequest("http://x/api/feedback", { method: "POST", body: JSON.stringify(body) }));
const valid = { kind: "wrong_model", title: "Canon <R6>", url: "https://www.marktplaats.nl/v/a/m1", price: 900, marketValue: 1500 };

test("a report without valid Telegram identity is refused and nothing is sent", async () => {
  let called = false;
  globalThis.fetch = (async () => { called = true; return new Response("{}"); }) as typeof fetch;
  assert.equal((await call({ ...valid, initData: "hash=bad" })).status, 401);
  assert.equal(called, false);
});

test("a report reaches the reporter's chat with escaped text", async () => {
  let sent: { chat_id: string; text: string } | null = null;
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => { sent = JSON.parse(String(init.body)); return new Response("{}"); }) as typeof fetch;
  delete process.env.CONTACT_TELEGRAM_CHAT_ID;
  assert.equal((await call({ ...valid, initData: initData(77) })).status, 200);
  assert.equal(sent!.chat_id, "77");
  assert.match(sent!.text, /Canon &lt;R6&gt;/);
});

test("links outside Marktplaats and unknown reasons are rejected", async () => {
  assert.equal((await call({ ...valid, url: "https://evil.example/x", initData: initData(78) })).status, 400);
  assert.equal((await call({ ...valid, kind: "nope", initData: initData(79) })).status, 400);
});

test("a Telegram failure is reported as a failure", async () => {
  globalThis.fetch = (async () => new Response("{}", { status: 403 })) as typeof fetch;
  assert.equal((await call({ ...valid, initData: initData(80) })).status, 502);
});
