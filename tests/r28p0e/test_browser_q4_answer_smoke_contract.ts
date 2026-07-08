import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function readScript(path) {
  return readFile(new URL(`../../scripts/${path}`, import.meta.url), "utf8");
}

test("real browser answer smoke requires q4 ready, generated tokens, and non-fallback answer path", async () => {
  const script = await readScript("r28p0e_browser_q4_answer_smoke.mjs");

  for (const marker of [
    "OPEN_Q4_PROMPT",
    "desktop_real_q4_answer",
    "mobile_real_q4_answer",
    "mobile_throttled_real_q4_answer",
    "window.__anotherBrainBootMetrics?.q4_status === \"ready\"",
    "q4_forward_ran=true",
    "answer_tokens_missing",
    "answer_source_fallback",
    "draft_trace_no_q4",
    "truth_table_not_pass",
    "prompt_not_submitted",
    "artifacts/r28p0e/reports/browser_q4_answer_smoke.json"
  ]) {
    assert.match(script, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), marker);
  }
});
