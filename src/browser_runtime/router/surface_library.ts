import { R28SURF5_SURFACE_CATEGORIES } from "./surface_length_policy.ts";

export const R28SURF5_SURFACE_LIBRARY_VERSION = "r28surf5-wide-surface-library-v1";

export const R28SURF5_SURFACE_LIBRARY = Object.freeze({
  greeting: Object.freeze({
    intents: Object.freeze(["greeting"]),
    routes: Object.freeze(["greeting_surface"]),
    fragment_groups: Object.freeze(["greeting_core"]),
    micro_intent_only: true
  }),
  identity: Object.freeze({
    intents: Object.freeze(["identity_who_are_you", "identity_are_you_crocodile", "boundary_are_you_ai"]),
    routes: Object.freeze(["identity_surface", "identity_boundary"]),
    fragment_groups: Object.freeze(["identity_core", "crocodile_confirm"]),
    micro_intent_only: true
  }),
  origin: Object.freeze({
    intents: Object.freeze(["origin_where_from"]),
    routes: Object.freeze(["origin_surface"]),
    fragment_groups: Object.freeze(["origin_core"]),
    micro_intent_only: true
  }),
  capability: Object.freeze({
    intents: Object.freeze(["capability_what_can_you_do"]),
    routes: Object.freeze(["capability_surface"]),
    fragment_groups: Object.freeze(["capability_core"]),
    micro_intent_only: true
  }),
  model_status: Object.freeze({
    intents: Object.freeze(["runtime_status"]),
    routes: Object.freeze(["runtime_status_surface", "not_product_status", "synthetic_demo_fallback"]),
    fragment_groups: Object.freeze(["runtime_core", "model_status_core"]),
    micro_intent_only: false
  }),
  evidence_insufficient: Object.freeze({
    intents: Object.freeze(["evidence_insufficient"]),
    routes: Object.freeze(["insufficient_evidence_boundary", "adapter_context_boundary", "model_empty_fallback"]),
    fragment_groups: Object.freeze(["evidence_insufficient_core"]),
    micro_intent_only: false
  }),
  evidence_conflict: Object.freeze({
    intents: Object.freeze(["evidence_conflict"]),
    routes: Object.freeze(["conflicting_evidence_boundary"]),
    fragment_groups: Object.freeze(["evidence_conflict_core"]),
    micro_intent_only: false
  }),
  malicious_evidence: Object.freeze({
    intents: Object.freeze(["malicious_instruction"]),
    routes: Object.freeze(["malicious_evidence_boundary"]),
    fragment_groups: Object.freeze(["malicious_evidence_core"]),
    micro_intent_only: false
  }),
  abstract_value_fallback: Object.freeze({
    intents: Object.freeze(["value_judgment_light"]),
    routes: Object.freeze(["abstract_value_question", "philosophical_question", "open_question"]),
    fragment_groups: Object.freeze(["abstract_value_core"]),
    micro_intent_only: false
  }),
  aesthetic_fallback: Object.freeze({
    intents: Object.freeze(["aesthetic_judgment_light"]),
    routes: Object.freeze(["aesthetic_surface", "aesthetic_question"]),
    fragment_groups: Object.freeze(["aesthetic_core"]),
    micro_intent_only: false
  }),
  relation_fallback: Object.freeze({
    intents: Object.freeze(["relation_to_user"]),
    routes: Object.freeze(["relation_surface", "value_or_relation_question", "value_surface"]),
    fragment_groups: Object.freeze(["relation_core"]),
    micro_intent_only: false
  }),
  language_meaning_fallback: Object.freeze({
    intents: Object.freeze(["abstract_meaning_question"]),
    routes: Object.freeze(["abstract_meaning_surface", "abstract_meaning_question"]),
    fragment_groups: Object.freeze(["language_meaning_core"]),
    micro_intent_only: false
  }),
  q4_timeout_fallback: Object.freeze({
    intents: Object.freeze([]),
    routes: Object.freeze(["model_timeout_fallback"]),
    fragment_groups: Object.freeze(["q4_timeout_core"]),
    micro_intent_only: false
  }),
  q4_unavailable_fallback: Object.freeze({
    intents: Object.freeze([]),
    routes: Object.freeze(["model_gibberish_fallback", "model_repetition_fallback"]),
    fragment_groups: Object.freeze(["q4_unavailable_core"]),
    micro_intent_only: false
  }),
  smalltalk_safe: Object.freeze({
    intents: Object.freeze(["smalltalk_safe", "smalltalk_light"]),
    routes: Object.freeze(["smalltalk_surface"]),
    fragment_groups: Object.freeze(["smalltalk_core"]),
    micro_intent_only: true
  }),
  refusal_boundary: Object.freeze({
    intents: Object.freeze([]),
    routes: Object.freeze(["refusal_boundary"]),
    fragment_groups: Object.freeze(["refusal_core"]),
    micro_intent_only: false
  })
});

const INTENT_TO_CATEGORY = Object.freeze(
  Object.fromEntries(
    Object.entries(R28SURF5_SURFACE_LIBRARY).flatMap(([category, meta]) =>
      meta.intents.map((intent) => [intent, category])
    )
  )
);

const ROUTE_TO_CATEGORY = Object.freeze(
  Object.fromEntries(
    Object.entries(R28SURF5_SURFACE_LIBRARY).flatMap(([category, meta]) =>
      meta.routes.map((route) => [route, category])
    )
  )
);

export function surfaceCategoryForIntent(intent = "") {
  return INTENT_TO_CATEGORY[intent] || "";
}

export function surfaceCategoryForOpenQuestion(input = "", route = "") {
  const text = String(input || "");
  if (route === "aesthetic_question" || /美|审美|漂亮|难看|好看|风格|品味/.test(text)) return "aesthetic_fallback";
  if (route === "abstract_meaning_question" || /语言|文字|词语|词|表达/.test(text)) return "language_meaning_fallback";
  if (route === "value_or_relation_question" || /关系|爱|亲密|朋友|信任|承诺/.test(text)) return "relation_fallback";
  if (route === "abstract_value_question" || route === "philosophical_question" || /生与死|生死|活着|死亡|意义|存在|虚无|有限/.test(text)) {
    return "abstract_value_fallback";
  }
  return "abstract_value_fallback";
}

export function surfaceCategoryForRoute(route = "", fallbackReason = "", input = "") {
  const reason = String(fallbackReason || "");
  if (/timeout/.test(reason) || route === "model_timeout_fallback") return "q4_timeout_fallback";
  if (/q4_not_ready|worker_unavailable|tokenizer|no_model_assets|asset|not_ready|unavailable/.test(reason)) return "q4_unavailable_fallback";
  if (["abstract_value_question", "philosophical_question", "aesthetic_question", "value_or_relation_question", "abstract_meaning_question", "open_question"].includes(route)) {
    return surfaceCategoryForOpenQuestion(input, route);
  }
  return ROUTE_TO_CATEGORY[route] || "";
}

export function validateSurfaceLibrary() {
  const categories = Object.keys(R28SURF5_SURFACE_LIBRARY);
  const missing = R28SURF5_SURFACE_CATEGORIES.filter((category) => !categories.includes(category));
  return {
    ok: missing.length === 0 && categories.length === R28SURF5_SURFACE_CATEGORIES.length,
    categories,
    missing_categories: missing,
    answer_bank: false,
    broad_answer_bank: false,
    library_version: R28SURF5_SURFACE_LIBRARY_VERSION
  };
}
