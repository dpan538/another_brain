export const R28ROUT0_ROUTE_SCHEMA_VERSION = "r28rout0-answer-route-schema-v1";

export const ANSWER_ROUTES = Object.freeze([
  "direct_model_draft",
  "rag_grounded_answer",
  "identity_boundary",
  "insufficient_evidence_boundary",
  "conflicting_evidence_boundary",
  "malicious_evidence_boundary",
  "adapter_context_boundary",
  "model_empty_fallback",
  "model_gibberish_fallback",
  "model_repetition_fallback",
  "model_timeout_fallback",
  "not_product_status",
  "synthetic_demo_fallback"
]);

export const EVIDENCE_STATUSES = Object.freeze([
  "sufficient",
  "insufficient",
  "conflicting",
  "malicious",
  "none"
]);

export const RUNTIME_MODES = Object.freeze([
  "static_q4_experimental",
  "synthetic_tiny",
  "mock"
]);

export const DECODE_STATUSES = Object.freeze([
  "exact_runtime_tokenizer",
  "lossy_fallback",
  "failed"
]);

export const ROUTER_NON_CLAIMS = Object.freeze([
  "not product model",
  "not product admission",
  "not browser admission",
  "not release checkpoint",
  "no training",
  "no backend inference",
  "no external LLM API",
  "no Doubao",
  "hard router is product-surface guard only"
]);

export function normalizeAnswerRouteInput(input = {}) {
  const evidencePacket = input.evidence_packet || input.evidencePacket || null;
  const evidenceStatus = String(
    input.evidence_status ||
      evidencePacket?.evidence_status ||
      (evidencePacket ? "insufficient" : "none")
  );
  const runtimeMode = String(input.runtime_mode || input.runtimeMode || "mock");
  const decodeStatus = String(input.decode_status || input.decodeStatus || "");
  return {
    user_input: String(input.user_input ?? input.input ?? ""),
    evidence_status: EVIDENCE_STATUSES.includes(evidenceStatus) ? evidenceStatus : "insufficient",
    runtime_mode: RUNTIME_MODES.includes(runtimeMode) ? runtimeMode : runtimeMode,
    model_output: String(input.model_output ?? input.draft ?? ""),
    decode_status: DECODE_STATUSES.includes(decodeStatus) ? decodeStatus : decodeStatus,
    generation_flags: Array.isArray(input.generation_flags) ? input.generation_flags.map(String) : [],
    adapter_context_present: input.adapter_context_present === true || input.adapterContextPresent === true,
    product_admission: input.product_admission === true,
    evidence_packet: evidencePacket
  };
}

export function isAnswerRoute(route) {
  return ANSWER_ROUTES.includes(route);
}

export function buildAnswerRouteOutput({ route, useModelDraft = false, finalAnswer = "", fallbackReason = "", qualityFlags = [], nonClaims = ROUTER_NON_CLAIMS } = {}) {
  if (!isAnswerRoute(route)) throw new Error(`unknown_answer_route:${String(route || "")}`);
  const output = {
    route,
    use_model_draft: useModelDraft === true,
    quality_flags: Array.from(new Set((qualityFlags || []).map(String))),
    non_claims: Array.from(new Set((nonClaims || []).map(String))),
    route_schema_version: R28ROUT0_ROUTE_SCHEMA_VERSION
  };
  if (finalAnswer) output.final_answer = String(finalAnswer);
  if (fallbackReason) output.fallback_reason = String(fallbackReason);
  return output;
}

export function getAnswerRouteSchema() {
  return {
    schema_version: R28ROUT0_ROUTE_SCHEMA_VERSION,
    input: {
      user_input: "string",
      evidence_status: [...EVIDENCE_STATUSES],
      runtime_mode: [...RUNTIME_MODES],
      model_output: "string",
      decode_status: [...DECODE_STATUSES],
      generation_flags: "string[]",
      adapter_context_present: "boolean",
      product_admission: "boolean"
    },
    output: {
      route: [...ANSWER_ROUTES],
      use_model_draft: "boolean",
      final_answer: "optional string",
      fallback_reason: "optional string",
      quality_flags: "string[]",
      non_claims: "string[]"
    }
  };
}
