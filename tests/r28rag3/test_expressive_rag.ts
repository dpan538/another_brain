import test from "node:test";
import assert from "node:assert/strict";
import { buildPromptPacket, buildRetrievalPacket, buildStatePacket } from "../../src/browser_runtime/rag_packet.ts";
import { buildProcessTraceFromPacket } from "../../src/browser_runtime/trace/process_trace.ts";
import { buildExpressiveContextPack } from "../../src/browser_runtime/rag/expressive_rag.ts";

test("expressive RAG packet merges profile cards without backend or vector store", async () => {
  const statePacket = buildStatePacket("你是谁，你能怎么回答？");
  const packet = await buildRetrievalPacket("你是谁，你能怎么回答？", statePacket);
  assert.equal(packet.local_only, true);
  assert.equal(packet.backend_retrieval, false);
  assert.equal(packet.hosted_vector_store, false);
  assert.equal(packet.external_storage_runtime, false);
  assert.equal(packet.profile_rag.enabled, true);
  assert.equal(packet.profile_rag.answer_bank, false);
  assert.equal(packet.profile_rag.allowed_for_training, false);
  assert.ok(packet.retrieved_evidence.some((item) => item.metadata?.profile_card === true));
  assert.ok(packet.retrieved_evidence.some((item) => item.metadata?.provenance === "approved_anchor_summary"));
  assert.ok(packet.expressive_context_pack.cards_used.length >= 1);
  assert.equal(packet.expressive_context_pack.answer_bank, false);
  assert.equal(packet.expressive_context_pack.hidden_prompt, false);
  assert.equal(packet.expressive_context_pack.cot, false);
});

test("prompt packet carries only light expressive hints and public source fields", async () => {
  const statePacket = buildStatePacket("回答风格要自然一点。");
  const evidencePacket = await buildRetrievalPacket("回答风格要自然一点。", statePacket);
  const promptPacket = buildPromptPacket("回答风格要自然一点。", statePacket, evidencePacket);
  const pack = promptPacket.evidence_packet.expressive_context_pack;
  assert.equal(pack.runtime_hints_only, true);
  assert.equal(pack.evidence_is_instruction, false);
  assert.equal(pack.answer_bank, false);
  assert.ok(pack.expressive_hints.length <= 3);
  assert.ok(promptPacket.evidence_packet.retrieved_evidence.some((item) => item.provenance));
  assert.ok(promptPacket.evidence_packet.retrieved_evidence.some((item) => item.kind));
});

test("process trace exposes source provenance for dashboard mode", async () => {
  const input = "证据不足时怎么办？";
  const statePacket = buildStatePacket(input);
  const evidencePacket = await buildRetrievalPacket(input, statePacket);
  const trace = buildProcessTraceFromPacket({
    input,
    state_packet: statePacket,
    evidence_packet: evidencePacket,
    retrieved_evidence: evidencePacket.retrieved_evidence,
    decoder_draft: "证据不足时先说明不足。",
    runtime_stats: { runtime_mode: "synthetic_tiny", tokens_generated: 2 },
    route_policy: { route: "rag_grounded_answer", use_model_draft: true },
    use_model_draft: true,
    fallback_used: false
  });
  assert.ok(trace.rag.top_sources.length > 0);
  assert.ok(trace.rag.top_sources.some((source) => source.provenance));
  assert.ok(trace.rag.top_sources.some((source) => source.kind));
});

test("expressive context pack is source metadata, not a hidden prompt", () => {
  const pack = buildExpressiveContextPack("你好", [
    {
      source_id: "card_1",
      title: "style profile card",
      text: "风格提示：短答。",
      trust_level: "high",
      retrieval_score: 0.5,
      license_or_origin: "approved_anchor_summary",
      can_answer: true,
      metadata: {
        profile_card: true,
        kind: "style",
        provenance: "approved_anchor_summary",
        review_status: "approved_for_runtime",
        expressive_hints: ["brief"]
      }
    }
  ]);
  assert.equal(pack.runtime_hints_only, true);
  assert.equal(pack.evidence_is_instruction, false);
  assert.equal(pack.answer_bank, false);
  assert.equal(pack.broad_answer_bank, false);
  assert.equal(pack.hidden_prompt, false);
  assert.equal(pack.cot, false);
});
