import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("open-question path has generation watchdog and terminal fallback states", async () => {
  const runtime = await readFile(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url), "utf8");
  const qa = await readFile(new URL("../../scripts/r28ship2_final_qa_matrix.py", import.meta.url), "utf8");
  assert.ok(runtime.includes("GENERATION_START_TIMEOUT_MS"));
  assert.ok(runtime.includes("DESKTOP_TOTAL_GENERATION_TIMEOUT_MS"));
  assert.ok(runtime.includes("MOBILE_TOTAL_GENERATION_TIMEOUT_MS"));
  assert.ok(runtime.includes("TERMINAL_GENERATION_STATUSES"));
  assert.ok(runtime.includes("q4_generation_timeout"));
  assert.ok(runtime.includes("open_question_route"));
  assert.ok(qa.includes("open_question_sla_exceeded"));
  assert.ok(qa.includes("open_question_no_hang"));
});
