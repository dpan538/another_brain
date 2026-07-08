import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync("web/another_brain_chat/index.html", "utf8");
const app = readFileSync("web/another_brain_chat/app.js", "utf8");
const runtime = readFileSync("web/another_brain_chat/browser_runtime.js", "utf8");

test("dashboard exposes q4 generation trace fields", () => {
  for (const id of ["q4-attempted-status", "generation-started-status", "generation-status", "first-token-status", "generation-elapsed-status"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(app, /trace\.generation \|\| trace\.model/);
  assert.match(app, /routeStatus/);
  assert.match(app, /q4_attempted/);
  assert.match(app, /generation_started/);
  assert.match(app, /generation_status/);
  assert.match(app, /answerSourceStatus/);
  assert.match(app, /fallbackReasonStatus/);
  assert.match(runtime, /generation:\s*{/);
  assert.match(runtime, /answer_source_label/);
  assert.match(runtime, /first_token_ms/);
  assert.match(runtime, /total_generation_ms/);
  assert.match(runtime, /fallback_reason/);
});
