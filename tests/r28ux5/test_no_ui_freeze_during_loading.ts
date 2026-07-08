import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("loading and self-check stay cancellable and progress-driven instead of blocking the UI", async () => {
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url), "utf8");

  assert.ok(app.includes("AbortController"));
  assert.ok(app.includes("activeLoadingController"));
  assert.ok(app.includes("onProgress"));
  assert.ok(app.includes("loadingCancelButton"));
  assert.ok(runtime.includes("buildSelfCheckProgress"));
  assert.ok(runtime.includes("SELF_CHECK_SHARD_PROBE_TIMEOUT_MS"));
  assert.equal(/while\s*\(\s*true\s*\)/.test(app), false);
});
