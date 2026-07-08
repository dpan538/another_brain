import test from "node:test";
import assert from "node:assert/strict";
import { applyAnswerSurfacePolicy } from "../../src/browser_runtime/router/answer_surface_policy.ts";
import { answerVisibleCharCount } from "../../src/browser_runtime/router/answer_length_policy.ts";

test("capability answers stay short and varied", () => {
  const outputs = ["你能做什么", "你可以帮我什么", "你擅长什么"].map((input) =>
    applyAnswerSurfacePolicy({ user_input: input, evidence_status: "none", model_output: "" })
  );
  assert.ok(outputs.every((item) => item.route === "capability_surface"));
  assert.ok(outputs.every((item) => item.surface_category === "capability"));
  assert.ok(new Set(outputs.map((item) => item.final_answer)).size >= 2);
  assert.ok(outputs.every((item) => answerVisibleCharCount(item.final_answer) <= 80));
});
