import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("q4 worker reports generated tokens when q4 path is available", async () => {
  const worker = await readFile(new URL("../../web/another_brain_chat/runtime_worker.js", import.meta.url), "utf8");
  const q4 = await readFile(new URL("../../web/another_brain_chat/q4_worker_runtime.js", import.meta.url), "utf8");
  assert.ok(worker.includes("generateStaticQ4Draft"));
  assert.equal(worker.includes("web_static_q4_worker_bundle_not_embedded"), false);
  assert.ok(q4.includes("tokens_generated: generatedTokenIds.length"));
  assert.ok(q4.includes('runtime_mode: "static_q4_experimental"'));
  assert.ok(q4.includes("q4_forward_ran: true"));
});
