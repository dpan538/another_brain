import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("process trace exposes source provenance summary without private text", async () => {
  const runtime = await readFile("web/another_brain_chat/browser_runtime.js", "utf8");
  const app = await readFile("web/another_brain_chat/app.js", "utf8");
  assert.ok(runtime.includes("provenance"));
  assert.ok(runtime.includes("review_status"));
  assert.ok(app.includes("review_status"));
  assert.ok(app.includes("traceEvidenceSummary"));
});
