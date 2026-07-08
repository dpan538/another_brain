import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runtime = readFileSync("web/another_brain_chat/browser_runtime.js", "utf8");

test("life/death question is explicitly covered by no-hang pipeline", () => {
  assert.match(runtime, /classifyOpenQuestionRoute\(input\)/);
  assert.match(runtime, /生与死/);
  assert.match(runtime, /q4_generation_timeout/);
  assert.match(runtime, /TERMINAL_GENERATION_STATUSES/);
  assert.match(runtime, /recordTerminalGenerationStats\("fallback"/);
});
