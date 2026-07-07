import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("fallback reason remains visible for q4 blockers and router fallback", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  assert.ok(html.includes("Fallback Reason"));
  assert.ok(html.includes("self-check-fallback-reason"));
  assert.ok(app.includes("fallbackReasonStatus"));
  assert.ok(app.includes("q4_self_check_failed"));
});
