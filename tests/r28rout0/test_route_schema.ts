import test from "node:test";
import assert from "node:assert/strict";
import { ANSWER_ROUTES, getAnswerRouteSchema, normalizeAnswerRouteInput } from "../../src/browser_runtime/router/answer_route.ts";

test("R28ROUT0 route schema exposes the required input and output fields", () => {
  const schema = getAnswerRouteSchema();
  for (const route of [
    "direct_model_draft",
    "rag_grounded_answer",
    "insufficient_evidence_boundary",
    "conflicting_evidence_boundary",
    "malicious_evidence_boundary",
    "adapter_context_boundary",
    "model_empty_fallback",
    "model_gibberish_fallback",
    "model_repetition_fallback",
    "model_timeout_fallback",
    "not_product_status",
    "synthetic_demo_fallback"
  ]) {
    assert.ok(ANSWER_ROUTES.includes(route));
    assert.ok(schema.output.route.includes(route));
  }
  assert.equal(schema.input.product_admission, "boolean");
  assert.equal(schema.output.use_model_draft, "boolean");
  assert.equal(schema.output.quality_flags, "string[]");
  assert.equal(schema.output.non_claims, "string[]");
});

test("R28ROUT0 normalizes route input without admitting product status", () => {
  const input = normalizeAnswerRouteInput({
    user_input: "hello",
    evidence_status: "sufficient",
    runtime_mode: "static_q4_experimental",
    decode_status: "exact_runtime_tokenizer",
    product_admission: false
  });
  assert.equal(input.product_admission, false);
  assert.equal(input.runtime_mode, "static_q4_experimental");
});
