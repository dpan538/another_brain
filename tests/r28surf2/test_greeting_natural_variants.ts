import test from "node:test";
import assert from "node:assert/strict";
import { classifyAnswerRoute } from "../../src/browser_runtime/router/route_classifier.ts";

test("greetings return fast natural deterministic variants without q4 draft", () => {
  const outputs = ["你好", "哈喽", "晚上好"].map((input) => classifyAnswerRoute({ user_input: input, evidence_status: "none" }));
  for (const output of outputs) {
    assert.equal(output.route, "greeting_surface");
    assert.equal(output.use_model_draft, false);
    assert.equal(output.final_answer_source, "router_surface");
    assert.equal(output.broad_answer_bank, false);
    assert.ok(output.intent_confidence >= 0.58);
  }
  assert.ok(new Set(outputs.map((item) => item.final_answer)).size >= 2);
});
