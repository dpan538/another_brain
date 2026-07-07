import { buildStaticEvidencePacket, DEFAULT_DEMO_MEMORY } from "./rag/static_retriever.ts";
import { mergeAdapterEvidenceRecords } from "./context_adapter.ts";

export const R28GEN0_STATE_PACKET_VERSION = "r28gen0-state-packet-v1";

export function buildStatePacket(input, options = {}) {
  return {
    runtime_version: "r27b3-static-rag-memory-v1",
    state_packet_version: R28GEN0_STATE_PACKET_VERSION,
    input: String(input || ""),
    turn_index: Number(options.turnIndex || 1),
    local_only: true,
    privacy_scope: "local_session_only",
    no_private_persistence: true,
    allowed_for_training: false,
    backend_inference: false,
    external_runtime_dependency: false,
    external_llm_api: false,
    doubao: false,
    hosted_vector_store: false,
    product_model: false,
    browser_admission: false,
    release_checkpoint_admission: false,
    no_answer_bank: true,
    mode: options.mode || "synthetic_tiny",
    answer_mode: options.answerMode || "zh_first_evidence_bounded",
    prompt_packet_version: "r28gen0-generation-prompt-packet-v1",
    context_length: Number(options.contextLength || 256),
    generation_policy: {
      decoding: "greedy",
      max_new_tokens: Number(options.maxTokens || options.maxNewTokens || 16),
      repetition_guard: true,
      timeout_ms: Number(options.timeoutMs || 3000)
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

export { buildStaticEvidencePacket, DEFAULT_DEMO_MEMORY };
