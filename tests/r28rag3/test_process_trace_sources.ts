import test from "node:test";
import assert from "node:assert/strict";
import { buildProcessTraceFromPacket } from "../../src/browser_runtime/trace/process_trace.ts";

test("process trace displays R28RAG3 provenance, kind, and tone hints", () => {
  const trace = buildProcessTraceFromPacket({
    input: "你怎么看审美",
    decoder_draft: "",
    evidence_packet: {
      evidence_status: "sufficient",
      retrieved_evidence: [{
        source_id: "r28rag3-aesthetic-situated-judgment",
        title: "R28RAG3 aesthetic card",
        text: "Aesthetic runtime hint.",
        trust_level: "high",
        retrieval_score: 0.8,
        license_or_origin: "approved_anchor_summary",
        can_answer: true,
        metadata: {
          card_kind: "aesthetic",
          provenance: "approved_anchor_summary",
          tone_hints: ["textured", "specific"]
        }
      }],
      rag_profile_pack: {
        version: "r28rag3-lightweight-affective-rag-v1",
        runtime_hints_only: true,
        broad_answer_bank: false,
        private_raw_data: false,
        hosted_vector_store: false,
        tone_hints: ["textured", "specific"]
      }
    },
    runtime_stats: { runtime_mode: "static_q4_experimental", tokens_generated: 0, fallback_used: true },
    route_policy: { route: "aesthetic_surface", use_model_draft: false, final_answer_source: "router_surface" },
    answer_route: "aesthetic_surface",
    use_model_draft: false
  });
  assert.equal(trace.rag.top_sources[0].provenance, "approved_anchor_summary");
  assert.equal(trace.rag.top_sources[0].kind, "aesthetic");
  assert.deepEqual(trace.rag.tone_hints, ["textured", "specific"]);
  assert.equal(trace.rag.profile_pack.runtime_hints_only, true);
  assert.equal(trace.rag.profile_pack.private_raw_data, false);
});
