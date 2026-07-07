import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("chat UI exposes route and fallback reason details", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url), "utf8");
  assert.ok(html.includes("route-status"));
  assert.ok(app.includes("answer_route"));
  assert.ok(app.includes("route_policy"));
  assert.ok(runtime.includes("applyAnswerSurfacePolicy"));
  assert.ok(runtime.includes("route_policy"));
});
