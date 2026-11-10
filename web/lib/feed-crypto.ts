/**
 * The deals feed is published on a public GitHub branch. With FEED_KEY set it is sealed:
 * gzip-compressed, then AES-256-GCM encrypted, so only the scanner and this app can read it.
 * Without FEED_KEY the feed stays plain JSON (backward compatible).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

export type SealedFeed = { sealed: "aes-256-gcm+gzip"; v: 1; iv: string; tag: string; data: string };

const keyOf = (secret: string) => createHash("sha256").update(secret, "utf8").digest();

export function isSealed(value: unknown): value is SealedFeed {
  const row = value as Partial<SealedFeed> | null;
  return Boolean(row) && typeof row === "object" && row!.sealed === "aes-256-gcm+gzip" && typeof row!.data === "string";
}

export function sealFeed(json: string, secret: string): SealedFeed {
  if (!secret) throw new Error("FEED_KEY is empty");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyOf(secret), iv);
  const data = Buffer.concat([cipher.update(gzipSync(Buffer.from(json, "utf8"), { level: 9 })), cipher.final()]);
  return { sealed: "aes-256-gcm+gzip", v: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") };
}

/** Throws when the key is wrong or the data was altered (GCM authentication). */
export function openFeed(sealed: SealedFeed, secret: string): string {
  if (!secret) throw new Error("FEED_KEY is not configured, the feed is encrypted");
  const decipher = createDecipheriv("aes-256-gcm", keyOf(secret), Buffer.from(sealed.iv, "base64"));
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(sealed.data, "base64")), decipher.final()]);
  return gunzipSync(plain).toString("utf8");
}

/** Parses a published feed document, opening it when sealed. */
export function readFeedText(text: string, secret = process.env.FEED_KEY || ""): unknown {
  const parsed = JSON.parse(text) as unknown;
  return isSealed(parsed) ? JSON.parse(openFeed(parsed, secret)) : parsed;
}
