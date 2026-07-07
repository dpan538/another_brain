import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("frontend polish keeps non-product and no-remote-inference claims explicit", async () => {
  const html = await readFile("web/another_brain_chat/index.html", "utf8");
  const app = await readFile("web/another_brain_chat/app.js", "utf8");
  const runtime = await readFile("web/another_brain_chat/browser_runtime.js", "utf8");
  const combined = `${html}\n${app}\n${runtime}`;

  assert.match(combined, /不是 product model/);
  assert.match(combined, /没有 admission/);
  assert.match(combined, /无后端 \/ 无外部 LLM/);
  assert.match(app, /product_model: false/);
  assert.match(app, /backend_inference: false/);
  assert.match(app, /external_llm_api: false/);
  assert.doesNotMatch(combined, /product_model:\s*true/);
  assert.doesNotMatch(combined, /product_admission:\s*true/);
});
