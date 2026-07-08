import test from "node:test";
import assert from "node:assert/strict";
import { applyAnswerSurfacePolicy } from "../../src/browser_runtime/router/answer_surface_policy.ts";

test("identity answers vary deterministically without broad banking", () => {
  const inputs = ["你是谁", "你叫什么", "你是什么", "你是鳄鱼吗"];
  const outputs = inputs.map((input) => applyAnswerSurfacePolicy({ user_input: input, evidence_status: "none", model_output: "" }));
  assert.ok(outputs.every((item) => item.route === "identity_surface"));
  assert.ok(outputs.every((item) => item.surface_category === "identity"));
  assert.ok(new Set(outputs.map((item) => item.final_answer)).size >= 2);
  assert.ok(outputs.some((item) => /鳄鱼/.test(item.final_answer)));
  assert.ok(outputs.every((item) => item.broad_answer_bank === false));
});
