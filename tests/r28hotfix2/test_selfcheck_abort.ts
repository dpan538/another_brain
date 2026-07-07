import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("self-check exposes stop button and abort path", async () => {
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url), "utf8");
  assert.ok(html.includes("model-self-check-stop-button"));
  assert.ok(app.includes("new AbortController()"));
  assert.ok(app.includes("activeSelfCheckController.abort()"));
  assert.ok(runtime.includes("cancelSelfCheck"));
  assert.ok(runtime.includes("worker.terminate()"));
});
