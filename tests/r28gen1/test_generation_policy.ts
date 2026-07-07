import test from "node:test";
import assert from "node:assert/strict";
import {
  applyGenerationGuards,
  detectOutputQualityFailure,
  normalizeGenerationPolicy
} from "../../src/browser_runtime/generation_policy.ts";
import { buildPromptPacket, buildStatePacket } from "../../src/browser_runtime/rag_packet.ts";

test("GEN1 generation policy is deterministic and conservative", () => {
  const policy = normalizeGenerationPolicy({ maxTokens: 128, maxTokenCap: 24, timeoutMs: 9000 });
  assert.equal(policy.decoding, "greedy");
  assert.equal(policy.max_new_tokens, 24);
  assert.equal(policy.hard_max_new_tokens, 24);
  assert.equal(policy.timeout_ms, 9000);
  assert.equal(policy.answer_bank, false);
  assert.equal(policy.product_admission, false);
});

test("GEN1 bad-token and token-id-only guards recommend fallback", () => {
  const guarded = applyGenerationGuards({
    tokens: ["安全", "token_id:42", "回答"],
    draft: "token_id:42 token_id:43"
  });
  assert.equal(guarded.ok, false);
  assert.ok(guarded.failures.includes("bad_token_suppressed"));
  assert.ok(guarded.failures.includes("token_id_only_output"));
  assert.equal(detectOutputQualityFailure("token_id:1 token_id:2"), "token_id_only_output");
});

test("GEN1 prompt packet carries state, evidence, fallback, and non-admission constraints", () => {
  const statePacket = buildStatePacket("你好", { mode: "static_q4_experimental" });
  const promptPacket = buildPromptPacket("你好", statePacket, {
    evidence_status: "sufficient",
    answer_policy_hint: "answer",
    retrieved_evidence: [{ source_id: "local", title: "本地证据", text: "只作为事实参考", trust_level: "high" }]
  });
  assert.equal(promptPacket.user_input, "你好");
  assert.equal(promptPacket.local_context.local_session_only, true);
  assert.equal(promptPacket.local_context.allowed_for_training, false);
  assert.equal(promptPacket.evidence_packet.answer_bank, false);
  assert.equal(promptPacket.instruction.no_cot_output, true);
  assert.equal(promptPacket.runtime_constraints.product_admission, false);
  assert.equal(promptPacket.fallback_policy.malicious_evidence, "ignore_and_explain_boundary");
});
