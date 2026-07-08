import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("q4 attempt telemetry is exposed in runtime, process trace, and QA schema", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url), "utf8");
  const qa = await readFile(new URL("../../scripts/r28ship2_final_qa_matrix.py", import.meta.url), "utf8");

  assert.ok(html.includes("q4-attempted-status"));
  assert.ok(app.includes("q4_attempted"));
  assert.ok(app.includes("fallbackReason"));
  assert.ok(runtime.includes("q4_ready_at_request"));
  assert.ok(runtime.includes("q4_attempted: true"));
  assert.ok(qa.includes("q4_tokens_generated"));
  assert.ok(qa.includes("q4_attempt_visible_for_open_questions"));
});
