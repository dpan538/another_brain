import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("deep model path self-check runs q4 smoke in a dedicated worker", async () => {
  const runtime = await readFile(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url), "utf8");
  const worker = await readFile(new URL("../../web/another_brain_chat/self_check_worker.js", import.meta.url), "utf8");
  assert.ok(runtime.includes("runQ4SelfCheckSmoke"));
  assert.ok(
    runtime.includes("./self_check_worker.js?v=r28hotfix2-nonblocking-selfcheck") ||
    runtime.includes("./self_check_worker.js?v=r28hotfix3-q4-asset-path-fix")
  );
  assert.ok(worker.includes("generateStaticQ4Draft"));
  assert.ok(worker.includes("q4_smoke"));
  assert.ok(worker.includes("maxTokens: Math.min(Number(message.maxTokens || 1), 1)"));
});
