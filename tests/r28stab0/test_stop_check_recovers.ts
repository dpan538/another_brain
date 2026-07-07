import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("stop self-check cancels the worker path and restores controls", async () => {
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url), "utf8");
  assert.ok(app.includes("modelSelfCheckStopButton"));
  assert.ok(app.includes("activeSelfCheckController.abort()"));
  assert.ok(app.includes("runtime.cancelSelfCheck(\"self_check_cancelled\")"));
  assert.ok(app.includes("status: \"cancelled\""));
  assert.ok(app.includes("setDisabled(modelSelfCheckButton, false)"));
  assert.ok(app.includes("setDisabled(modelSelfCheckStopButton, true)"));
  assert.ok(runtime.includes("cancelSelfCheck(reason = \"self_check_cancelled\")"));
  assert.ok(runtime.includes("this.activeSelfCheckController.abort(new Error(reason))"));
  assert.ok(runtime.includes("if (this.activeSelfCheckController === controller) this.activeSelfCheckController = null"));
});
