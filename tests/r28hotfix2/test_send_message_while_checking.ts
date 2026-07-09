import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("send path does not wait indefinitely for self-check", async () => {
  const runtime = await readFile(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url), "utf8");
  assert.ok(runtime.includes("self_check_worker.js"));
  assert.ok(runtime.includes("timeoutMs: 8000"));
  assert.ok(runtime.includes("if (isIdentityQuestion(input))"));
  assert.ok(runtime.includes("decoderDraft = await this.draftWithWorker"));
});
