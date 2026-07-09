import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("quick model path self-check is metadata-only and q4-skipped", async () => {
  const runtime = await readFile(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url), "utf8");
  assert.ok(runtime.includes("async quickSelfCheckModelPath"));
  assert.ok(runtime.includes("runDeep: false"));
  assert.ok(runtime.includes("q4_forward_skipped_quick_check"));
  assert.ok(runtime.includes("quickTimeoutMs"));
});
