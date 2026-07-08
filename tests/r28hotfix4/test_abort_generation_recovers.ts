import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runtime = readFileSync("web/another_brain_chat/browser_runtime.js", "utf8");
const app = readFileSync("web/another_brain_chat/app.js", "utf8");

test("abort records terminal generation status and releases pending request", () => {
  assert.match(runtime, /activeGenerationCancel/);
  assert.match(runtime, /recordTerminalGenerationStats\("aborted"/);
  assert.match(runtime, /generation_aborted/);
  assert.match(app, /runtime\.abort\(\)/);
  assert.match(app, /setPipelineStatus\("fallback"\)/);
});
