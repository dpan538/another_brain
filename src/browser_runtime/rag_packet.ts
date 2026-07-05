import { buildStaticEvidencePacket, DEFAULT_DEMO_MEMORY } from "./rag/static_retriever.ts";

export function buildStatePacket(input, options = {}) {
  return {
    runtime_version: "r27b3-static-rag-memory-v1",
    input: String(input || ""),
    turn_index: Number(options.turnIndex || 1),
    local_only: true,
    backend_inference: false,
    external_runtime_dependency: false,
    mode: options.mode || "synthetic_tiny",
    context_length: Number(options.contextLength || 256)
  };
}

export async function buildRetrievalPacket(input, statePacket = buildStatePacket(input), options = {}) {
  return buildStaticEvidencePacket(input, statePacket, options);
}

export async function buildMockRetrievalPacket(input, statePacket = buildStatePacket(input), options = {}) {
  return buildStaticEvidencePacket(input, statePacket, {
    ...options,
    memoryRecords: options.memoryRecords || DEFAULT_DEMO_MEMORY
  });
}

export { buildStaticEvidencePacket, DEFAULT_DEMO_MEMORY };
