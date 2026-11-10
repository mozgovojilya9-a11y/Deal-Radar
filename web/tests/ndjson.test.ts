import { test } from "node:test";
import assert from "node:assert/strict";
import { readNdjson } from "../lib/ndjson";

test("lines split across chunks and multi-byte characters are reassembled", async () => {
  const bytes = new TextEncoder().encode('{"type":"progress","label":"Кляйнанцайген"}\n{"type":"result","data":{"n":1}}\n');
  const cut = [0, 7, 20, 45, 46, bytes.length];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let index = 1; index < cut.length; index += 1) controller.enqueue(bytes.slice(cut[index - 1], cut[index]));
      controller.close();
    },
  });
  const lines: unknown[] = [];
  await readNdjson(new Response(stream), (line) => lines.push(line));
  assert.deepEqual(lines, [{ type: "progress", label: "Кляйнанцайген" }, { type: "result", data: { n: 1 } }]);
});

test("a last line without a newline is still read", async () => {
  const lines: unknown[] = [];
  await readNdjson(new Response('{"a":1}\n{"b":2}'), (line) => lines.push(line));
  assert.deepEqual(lines, [{ a: 1 }, { b: 2 }]);
});
