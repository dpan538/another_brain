import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

async function files(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await files(path));
    else if (/\.(js|ts|json|md|py|mjs)$/.test(entry.name)) out.push(path);
  }
  return out;
}

test("R28SHIP2 keeps profile/RAG surfaces out of broad answer-bank mode", async () => {
  const root = new URL("../..", import.meta.url).pathname;
  const relevant = [
    ...(await files(join(root, "web/another_brain/static_rag"))),
    ...(await files(join(root, "src/browser_runtime/rag"))),
    ...(await files(join(root, "src/browser_runtime/router")))
  ];
  const text = (await Promise.all(relevant.map((file) => readFile(file, "utf8")))).join("\n").toLowerCase();
  assert.equal(/"answer"\s*:|"final_answer"\s*:|"answer_text"\s*:/.test(text), false);
  assert.equal(/broad_answer_bank"\s*:\s*true/.test(text), false);
  assert.ok(text.includes("broad_answer_bank"));
});
