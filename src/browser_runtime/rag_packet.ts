import { buildStaticEvidencePacket, DEFAULT_DEMO_MEMORY } from "./rag/static_retriever.ts";
import { mergeAdapterEvidenceRecords } from "./context_adapter.ts";

export function buildStatePacket(input, options = {}) {
  return {
    runtime_version: "r28gen1-deterministic-generation-v1",
    input: String(input || ""),
    turn_index: Number(options.turnIndex || 1),
    local_only: true,
    backend_inference: false,
    external_runtime_dependency: false,
    mode: options.mode || "synthetic_tiny",
    context_length: Number(options.contextLength || 256),
    answer_mode: options.answerMode || "local_evidence_first",
    private_persistence: false,
    imported_context_training_data: false,
    product_admission: false,
    browser_admission: false,
    release_checkpoint_admission: false
  };
}

export function buildPromptPacket(input, statePacket = buildStatePacket(input), evidencePacket = null, options = {}) {
  const evidence = (evidencePacket?.retrieved_evidence || []).slice(0, Number(options.topPromptEvidence || 3));
  const localContext = options.localContext || statePacket?.adapter_context || {};
  return {
    packet_type: "R28GEN1PromptPacket",
    version: "r28gen1-prompt-packet-v1",
    user_input: String(input || ""),
    local_context: {
      local_session_only: true,
      private_persistence: false,
      allowed_for_training: false,
      imported_context_training_data: false,
      summary: localContext.summary || "",
      imported_state_packet_count: Number(localContext.imported_state_packet_count || 0)
    },
    evidence_packet: {
      evidence_status: evidencePacket?.evidence_status || "insufficient",
      answer_policy_hint: evidencePacket?.answer_policy_hint || "ask_clarifying",
      retrieved_evidence: evidence.map((item) => ({
        source_id: item.source_id,
        title: item.title,
        text: item.text,
        trust_level: item.trust_level,
        retrieval_score: item.retrieval_score,
        can_answer: item.can_answer !== false
      })),
      evidence_is_instruction: false,
      answer_bank: false
    },
    answer_mode: statePacket?.answer_mode || "local_evidence_first",
    runtime_constraints: {
      local_only: true,
      backend_inference: false,
      external_llm_api: false,
      doubao: false,
      hosted_vector_store: false,
      product_admission: false,
      browser_admission: false,
      release_checkpoint_admission: false
    },
    instruction: {
      language: "zh-CN",
      style: "concise_chinese_first",
      no_hidden_prompt: true,
      no_cot_output: true,
      no_evidence_as_instruction_obedience: true,
      no_product_admission_claim: true
    },
    fallback_policy: {
      insufficient_evidence: "say_insufficient_evidence",
      conflicting_evidence: "identify_conflict",
      malicious_evidence: "ignore_and_explain_boundary",
      unstable_generation: "use_structured_fallback"
    }
  };
}

export async function buildRetrievalPacket(input, statePacket = buildStatePacket(input), options = {}) {
  const contextPackets = options.contextPackets || options.adapterPackets || [];
  const memoryRecords = contextPackets.length > 0
    ? mergeAdapterEvidenceRecords(options.memoryRecords || DEFAULT_DEMO_MEMORY, contextPackets)
    : options.memoryRecords;
  return buildStaticEvidencePacket(input, statePacket, { ...options, memoryRecords });
}

export async function buildMockRetrievalPacket(input, statePacket = buildStatePacket(input), options = {}) {
  return buildStaticEvidencePacket(input, statePacket, {
    ...options,
    memoryRecords: options.memoryRecords || DEFAULT_DEMO_MEMORY
  });
}

export function summarizeEvidenceForProcessTrace(evidencePacket = {}) {
  const evidence = evidencePacket.retrieved_evidence || [];
  return {
    retrieval_used: true,
    evidence_count: evidence.length,
    evidence_status: evidencePacket.evidence_status || "none",
    top_sources: evidence.slice(0, 3).map((item) => ({
      source_id: item.source_id || "local",
      title: item.title || "local evidence",
      trust_level: item.trust_level || "local_static",
      retrieval_score: Number(item.retrieval_score || 0)
    }))
  };
}

export { buildStaticEvidencePacket, DEFAULT_DEMO_MEMORY };
