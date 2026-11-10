/**
 * Seals or opens the deals feed for the Python scanner (FEED_KEY from the environment).
 * Run: node --no-warnings --import ./tests/register.mjs scripts/feed-crypto-cli.ts seal|open < in > out
 */
import { openFeed, sealFeed, isSealed } from "../lib/feed-crypto";

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
const input = Buffer.concat(chunks).toString("utf8");
const secret = process.env.FEED_KEY || "";
const mode = process.argv[2];
if (mode === "seal") {
  process.stdout.write(JSON.stringify(sealFeed(input, secret)));
} else if (mode === "open") {
  const parsed = JSON.parse(input) as unknown;
  process.stdout.write(isSealed(parsed) ? openFeed(parsed, secret) : input);
} else {
  process.stderr.write("usage: feed-crypto-cli.ts seal|open\n");
  process.exit(2);
}
