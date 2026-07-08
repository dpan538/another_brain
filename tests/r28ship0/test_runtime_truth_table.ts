import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRuntimeTruth } from "../../src/browser_runtime/runtime_truth_table.ts";

test("static_q4_experimental cannot silently claim no_model_fallback", () => {
  const result = evaluateRuntimeTruth({
    runtime_mode: "static_q4_experimental",
    assets: "pass",
    tokenizer: "pass",
    q4_forward: "fail",
    answer_source: "no_model_fallback"
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes("fallback_source_requires_visible_blocker"));
  assert.ok(result.failures.includes("q4_forward_false_requires_visible_reason"));
});

test("q4 forward true requires generated tokens and model-aware answer source", () => {
  assert.equal(evaluateRuntimeTruth({
    runtime_mode: "static_q4_experimental",
    assets: "pass",
    tokenizer: "pass",
    q4_forward: true,
    q4_forward_ran: true,
    tokens_generated: 2,
    answer_source: "model_draft"
  }).ok, true);

  assert.equal(evaluateRuntimeTruth({
    runtime_mode: "static_q4_experimental",
    assets: "pass",
    tokenizer: "pass",
    q4_forward: true,
    q4_forward_ran: true,
    tokens_generated: 0,
    answer_source: "model_draft"
  }).ok, false);
});
