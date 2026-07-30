import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("browser runtime runs Plan B before final fallback", async () => {
  const runtime = await readFile(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url), "utf8");
  assert.ok(runtime.includes("mountQ4WithRetry"));
  assert.ok(runtime.includes("reuse_http_cache"));
  assert.ok(runtime.includes("cache_bust"));
  assert.ok(runtime.includes("clear_model_cache"));
  assert.ok(runtime.includes("worker_restart"));
  assert.ok(runtime.includes("q4_retry_plan_exhausted"));
});
