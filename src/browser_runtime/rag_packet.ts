export function buildStatePacket(input, options = {}) {
  return {
    runtime_version: "r27b1b-browser-runtime-smoke-v1",
    input: String(input || ""),
    turn_index: Number(options.turnIndex || 1),
    local_only: true,
    backend_inference: false,
    external_runtime_dependency: false,
    mode: options.mode || "synthetic_tiny",
    context_length: Number(options.contextLength || 256)
  };
}

export function buildMockRetrievalPacket(input, statePacket = buildStatePacket(input)) {
  const normalized = String(input || "").trim();
  return {
    query: normalized,
    state_packet: statePacket,
    retrieved_evidence: [
      {
        id: "r27b1b-local-memory-smoke",
        source: "same-origin mock retrieval",
        score: 1,
        text: "The browser runtime smoke path uses local mock retrieval and deterministic generation."
      }
    ],
    local_only: true
  };
}
