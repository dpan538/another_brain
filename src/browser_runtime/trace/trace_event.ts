export const PROCESS_TRACE_EVENT_TYPES = Object.freeze([
  "input_received",
  "adapter_context_loaded",
  "rag_retrieval_started",
  "rag_retrieval_completed",
  "model_manifest_loaded",
  "q4_shards_verified",
  "tokenizer_ready",
  "q4_forward_started",
  "q4_forward_completed",
  "draft_generated",
  "router_route_selected",
  "finalizer_applied",
  "fallback_used",
  "answer_completed"
]);

export function createTraceEvent(type, payload = {}, options = {}) {
  const safeType = PROCESS_TRACE_EVENT_TYPES.includes(type) ? type : "answer_completed";
  return {
    type: safeType,
    at: options.created_at || new Date().toISOString(),
    public: true,
    payload: payload && typeof payload === "object" ? { ...payload } : {}
  };
}

export function hasTraceEvent(events = [], type) {
  return Array.isArray(events) && events.some((event) => event?.type === type);
}
