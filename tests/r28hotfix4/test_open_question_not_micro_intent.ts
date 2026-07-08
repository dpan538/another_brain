import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyOpenQuestionRoute } from "../../src/browser_runtime/router/open_question_route.ts";

const runtime = readFileSync("web/another_brain_chat/browser_runtime.js", "utf8");

test("open question route guards micro-intent fast path", () => {
  const route = classifyOpenQuestionRoute("你如何看待生与死？");
  assert.equal(route.should_attempt_q4, true);
  assert.match(runtime, /microIntent\.route && isMicroIntentRoute\(microIntent\.route\) && !openRoute\.should_attempt_q4/);
});
