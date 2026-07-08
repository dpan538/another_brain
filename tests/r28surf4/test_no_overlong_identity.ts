import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { classifyAnswerRoute } from "../../src/browser_runtime/router/route_classifier.ts";

test("legacy overlong identity wording is removed from runtime surfaces", async () => {
  const routed = classifyAnswerRoute({ user_input: "介绍一下你自己", evidence_status: "sufficient", model_output: "模型草稿" });
  assert.ok(routed.final_answer.length <= 28);
  for (const file of [
    "../../src/browser_runtime/router/identity_route.ts",
    "../../src/browser_runtime/router/answer_surfaces.ts",
    "../../src/browser_runtime/router/natural_surfaces.ts",
    "../../web/another_brain_chat/browser_runtime.js"
  ]) {
    const text = await readFile(new URL(file, import.meta.url), "utf8");
    assert.ok(!text.includes("我是这个本地网页里的另一个大脑界面"), file);
    assert.ok(!text.includes("更准确地说，我是这个本地网页"), file);
  }
});
