import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("model path self-check verifies assets and reports q4 forward blockers", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url), "utf8");
  assert.ok(html.includes("检查本地模型路径"));
  assert.ok(app.includes("modelSelfCheckButton"));
  assert.ok(runtime.includes("selfCheckModelPath"));
  assert.ok(runtime.includes("q4_forward_not_confirmed"));
  assert.ok(runtime.includes("q4_forward_ran"));
});
