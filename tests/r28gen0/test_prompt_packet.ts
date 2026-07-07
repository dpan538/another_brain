import test from "node:test";
import assert from "node:assert/strict";
import { buildGenerationPrompt, buildGenerationPromptPacket } from "../../src/browser_runtime/generation_prompt.ts";
import { buildStatePacket } from "../../src/browser_runtime/rag_packet.ts";

test("GEN0 prompt packet is Chinese-first, local-only, and evidence-bounded", () => {
  const statePacket = buildStatePacket("本地记忆是什么？", { mode: "static_q4_experimental", maxTokens: 12 });
  const packet = buildGenerationPromptPacket({
    input: "本地记忆是什么？",
    statePacket,
    evidencePacket: {
      evidence_status: "sufficient",
      answer_policy_hint: "answer",
      retrieved_evidence: [{ source_id: "e1", title: "Local note", text: "只使用本地 session 证据。" }]
    },
    contextPackets: [{ source_label: "Manual context", content: "导入上下文只在本地 session 使用。" }]
  });
  assert.equal(packet.output_policy.language, "zh-first");
  assert.equal(packet.output_policy.no_hidden_prompt, true);
  assert.equal(packet.output_policy.no_chain_of_thought, true);
  assert.equal(packet.output_policy.no_answer_bank, true);
  assert.equal(packet.evidence_packet.backend_retrieval, false);
  assert.equal(packet.evidence_packet.hosted_vector_store, false);
  assert.equal(packet.state_packet.backend_inference, false);
  assert.equal(packet.local_context[0].allowed_for_training, false);
  assert.ok(packet.non_product_constraints.some((line) => line.includes("不是 product model")));
});

test("rendered prompt contains runtime constraints and no teacher/runtime API", () => {
  const { prompt } = buildGenerationPrompt("你好", {
    evidence_status: "insufficient",
    answer_policy_hint: "ask_clarifying",
    retrieved_evidence: []
  });
  assert.match(prompt, /中文优先/);
  assert.match(prompt, /不使用后端推理/);
  assert.match(prompt, /不要输出推理过程/);
  assert.match(prompt, /证据不足/);
  assert.doesNotMatch(prompt, /teacher api/i);
});
