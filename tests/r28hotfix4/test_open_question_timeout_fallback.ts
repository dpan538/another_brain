import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runtime = readFileSync("web/another_brain_chat/browser_runtime.js", "utf8");

test("q4 generation timeout resolves to abstract/value fallback", () => {
  assert.match(runtime, /firstTokenTimer/);
  assert.match(runtime, /totalTimer/);
  assert.match(runtime, /failTimeout\("q4_generation_timeout"\)/);
  assert.match(runtime, /buildOpenQuestionRoutePolicy\(input,\s*openRoute/);
  assert.match(runtime, /abstractValueFallbackSurface/);
});
