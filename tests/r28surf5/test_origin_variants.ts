import test from "node:test";
import assert from "node:assert/strict";
import { applyAnswerSurfacePolicy } from "../../src/browser_runtime/router/answer_surface_policy.ts";
import { answerVisibleCharCount } from "../../src/browser_runtime/router/answer_length_policy.ts";

test("origin answers have deterministic local-source variants", () => {
  const outputs = ["你从哪里来", "你来自哪里", "你的来源是什么"].map((input) =>
    applyAnswerSurfacePolicy({ user_input: input, evidence_status: "none", model_output: "" })
  );
  assert.ok(outputs.every((item) => item.route === "origin_surface"));
  assert.ok(outputs.every((item) => item.surface_category === "origin"));
  assert.ok(new Set(outputs.map((item) => item.final_answer)).size >= 2);
  assert.ok(outputs.every((item) => answerVisibleCharCount(item.final_answer) <= 80));
});
