import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runtime = readFileSync("web/another_brain_chat/browser_runtime.js", "utf8");

test("open questions attempt q4 when runtime is ready", () => {
  assert.match(runtime, /openRoute\.should_attempt_q4/);
  assert.match(runtime, /isQ4ReadyForGeneration\(\)/);
  assert.match(runtime, /q4ReadyAtRequest/);
  assert.match(runtime, /draftWithWorker\(buildDecoderPrompt/);
  assert.match(runtime, /q4_attempted:\s*true/);
  assert.match(runtime, /generation_started/);
});
