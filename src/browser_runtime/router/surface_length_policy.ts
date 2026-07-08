export const R28SURF5_SURFACE_LENGTH_POLICY_VERSION = "r28surf5-surface-length-policy-v1";

export const R28SURF5_SURFACE_CATEGORIES = Object.freeze([
  "greeting",
  "identity",
  "origin",
  "capability",
  "model_status",
  "evidence_insufficient",
  "evidence_conflict",
  "malicious_evidence",
  "abstract_value_fallback",
  "aesthetic_fallback",
  "relation_fallback",
  "language_meaning_fallback",
  "q4_timeout_fallback",
  "q4_unavailable_fallback",
  "smalltalk_safe",
  "refusal_boundary"
]);

export const SURFACE_LENGTH_POLICY = Object.freeze({
  greeting: Object.freeze({ sentence_min: 1, sentence_max: 1, max_chars: 20, trim_strategy: "single_sentence" }),
  identity: Object.freeze({ sentence_min: 1, sentence_max: 2, max_chars: 50, trim_strategy: "short_identity" }),
  origin: Object.freeze({ sentence_min: 1, sentence_max: 2, max_chars: 80, trim_strategy: "short_origin" }),
  capability: Object.freeze({ sentence_min: 1, sentence_max: 2, max_chars: 80, trim_strategy: "short_capability" }),
  model_status: Object.freeze({ sentence_min: 1, sentence_max: 2, max_chars: 90, trim_strategy: "status_boundary" }),
  evidence_insufficient: Object.freeze({ sentence_min: 1, sentence_max: 3, max_chars: 110, trim_strategy: "evidence_boundary" }),
  evidence_conflict: Object.freeze({ sentence_min: 1, sentence_max: 3, max_chars: 120, trim_strategy: "evidence_boundary" }),
  malicious_evidence: Object.freeze({ sentence_min: 1, sentence_max: 3, max_chars: 120, trim_strategy: "refusal_boundary" }),
  abstract_value_fallback: Object.freeze({ sentence_min: 2, sentence_max: 4, max_chars: 160, trim_strategy: "abstract_value" }),
  aesthetic_fallback: Object.freeze({ sentence_min: 2, sentence_max: 4, max_chars: 160, trim_strategy: "abstract_value" }),
  relation_fallback: Object.freeze({ sentence_min: 2, sentence_max: 4, max_chars: 160, trim_strategy: "abstract_value" }),
  language_meaning_fallback: Object.freeze({ sentence_min: 2, sentence_max: 4, max_chars: 160, trim_strategy: "abstract_value" }),
  q4_timeout_fallback: Object.freeze({ sentence_min: 2, sentence_max: 4, max_chars: 160, trim_strategy: "q4_fallback" }),
  q4_unavailable_fallback: Object.freeze({ sentence_min: 2, sentence_max: 4, max_chars: 160, trim_strategy: "q4_fallback" }),
  smalltalk_safe: Object.freeze({ sentence_min: 1, sentence_max: 1, max_chars: 24, trim_strategy: "single_sentence" }),
  refusal_boundary: Object.freeze({ sentence_min: 1, sentence_max: 3, max_chars: 120, trim_strategy: "refusal_boundary" }),
  q4_accepted_open_answer: Object.freeze({ sentence_min: 1, sentence_max: 5, max_chars: 220, trim_strategy: "trim_rambling_model_draft" }),
  model_draft: Object.freeze({ sentence_min: 1, sentence_max: 6, max_chars: 280, trim_strategy: "draft_passthrough" })
});

export function isR28Surf5SurfaceCategory(category = "") {
  return R28SURF5_SURFACE_CATEGORIES.includes(category);
}

export function policyForSurfaceCategory(category = "") {
  return SURFACE_LENGTH_POLICY[category] || SURFACE_LENGTH_POLICY.model_draft;
}

export function getSurfaceLengthPolicySummary(category = "") {
  const policy = policyForSurfaceCategory(category);
  return {
    category: SURFACE_LENGTH_POLICY[category] ? category : "model_draft",
    sentence_min: policy.sentence_min,
    sentence_max: policy.sentence_max,
    max_chars: policy.max_chars,
    trim_strategy: policy.trim_strategy,
    policy_version: R28SURF5_SURFACE_LENGTH_POLICY_VERSION
  };
}
