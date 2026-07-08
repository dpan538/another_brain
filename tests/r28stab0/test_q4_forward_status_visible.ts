import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("q4 forward status is visible and recoverable in the static UI", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url), "utf8");
  assert.ok(html.includes('id="q4-status-badge"'));
  assert.ok(html.includes('id="self-check-q4"'));
  assert.ok(html.includes("q4 forward"));
  assert.ok(app.includes("setText(q4StatusBadge"));
  assert.ok(app.includes("q4_forward_ran"));
  assert.ok(runtime.includes("runQ4SelfCheckSmoke"));
  assert.ok(runtime.includes("q4_forward_not_confirmed"));
  assert.ok(runtime.includes("q4_forward_smoke_passed"));
});
