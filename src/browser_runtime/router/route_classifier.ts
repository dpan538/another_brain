import { detectOutputQualityFailure } from "../generation_policy.ts";
import { normalizeAnswerRouteInput } from "./answer_route.ts";
import { composeAnswerSurface } from "./answer_surface_composer.ts";
import { matchMicroIntent } from "./fuzzy_intent_matcher.ts";
import { buildIdentityRouteOutput, isIdentityQuestion } from "./identity_route.ts";
import { isMicroIntentRoute, routeForMicroIntent } from "./intent_taxonomy.ts";

const MALICIOUS_EVIDENCE_MARKERS = [
  "ignore previous instructions",
  "ignore the previous instructions",
  "reveal hidden prompt",
  "show the hidden prompt",
  "system prompt",
  "developer message",
  "chain-of-thought",
  "chain of thought",
  "<hidden",
  "忽略前面的规则",
  "隐藏提示",
  "开发者消息",
  "系统提示"
];

const PRODUCT_STATUS_MARKERS = [
  "product admission",
  "browser admission",
  "release checkpoint",
  "product model",
  "admitted",
  "admission",
  "release",
  "产品",
  "已上线",
  "上线",
  "发布",
  "浏览器 admission",
  "产品模型",
  "产品准入"
];

function evidenceText(evidencePacket = null) {
  return (evidencePacket?.retrieved_evidence || [])
    .map((item) => `${item.title || ""}\n${item.text || ""}`)
    .join("\n")
    .toLowerCase();
}

function evidenceStatus(input) {
  const packet = input.evidence_packet;
  if (input.evidence_status === "malicious") return "malicious";
  if (packet?.answer_policy_hint === "refuse") return "malicious";
  if (MALICIOUS_EVIDENCE_MARKERS.some((marker) => evidenceText(packet).includes(marker))) return "malicious";
  if (input.evidence_status === "conflicting" || packet?.evidence_status === "conflicting") return "conflicting";
  if (input.evidence_status === "none") return "none";
  if (input.evidence_status === "insufficient" || packet?.evidence_status === "insufficient" || packet?.evidence_status === "irrelevant") {
    return "insufficient";
  }
  return input.evidence_status || "none";
}

function asksProductStatus(text) {
  const lowered = String(text || "").toLowerCase();
  return PRODUCT_STATUS_MARKERS.some((marker) => lowered.includes(marker));
}

function uniqueFlags(flags) {
  return Array.from(new Set((flags || []).filter(Boolean).map(String)));
}

function modelQualityFlags(input) {
  const flags = uniqueFlags(input.generation_flags);
  const detected = detectOutputQualityFailure(input.model_output, {
    quality_status: flags.includes("quality_not_ready") ? "quality_not_ready" : ""
  });
  if (detected) flags.push(detected);
  return uniqueFlags(flags);
}

function failureReason(flags, preferred) {
  for (const item of preferred) {
    if (flags.includes(item)) return item;
  }
  return preferred[0] || "";
}

function hasBlockingModelFailure(input, flags) {
  const draftPresent = String(input.model_output || "").trim().length > 0;
  const explicitFlags = new Set(input.generation_flags || []);
  return flags.some((flag) => {
    if (flag === "empty_output") return draftPresent || explicitFlags.has("empty_output");
    return [
      "generation_timeout",
      "model_timeout",
      "runtime_timeout",
      "bad_token_suppressed",
      "token_id_only_output",
      "low_confidence_gibberish",
      "hidden_prompt_or_cot_marker",
      "hidden_prompt_disclosure_marker",
      "generic_fallback_marker",
      "overlong_output",
      "repetition_guard",
      "quality_not_ready"
    ].includes(flag);
  });
}

export function classifyAnswerRoute(rawInput = {}) {
  const input = normalizeAnswerRouteInput(rawInput);
  const status = evidenceStatus(input);
  const flags = modelQualityFlags(input);
  const microBaseFlags = uniqueFlags(input.generation_flags);
  const microIntent = matchMicroIntent(input.user_input);

  if (microIntent.route && !hasBlockingModelFailure(input, flags)) {
    const composed = composeAnswerSurface({
      intent: microIntent.intent,
      input: input.user_input,
      runtimeStatus: {
        runtime_mode: input.runtime_mode,
        decode_status: input.decode_status
      },
      evidenceStatus: status,
      adapterContextPresent: input.adapter_context_present,
      productAdmission: input.product_admission
    });
    return {
      route: microIntent.route,
      use_model_draft: false,
      final_answer: composed.final_answer,
      fallback_reason: isMicroIntentRoute(microIntent.route) ? "micro_intent_fast_path" : composed.fallback_reason,
      quality_flags: uniqueFlags([...microBaseFlags, ...composed.quality_flags, `intent_confidence:${microIntent.confidence}`]),
      intent: microIntent.intent,
      intent_confidence: microIntent.confidence,
      intent_matcher_version: microIntent.matcher_version,
      final_answer_source: composed.final_answer_source,
      fragment_ids: composed.fragment_ids || [],
      indexed_surface: composed.indexed_surface === true,
      answer_bank: false
    };
  }

  if (isIdentityQuestion(input.user_input)) {
    const legacy = buildIdentityRouteOutput();
    return {
      ...legacy,
      route: routeForMicroIntent("identity_who_are_you") || legacy.route,
      fallback_reason: "micro_intent_fast_path",
      quality_flags: uniqueFlags([...microBaseFlags, "micro_intent:identity_who_are_you", "micro_intent_fast_path"]),
      intent: "identity_who_are_you",
      final_answer_source: "router_surface",
      fragment_ids: ["identity_core_01", "identity_core_02", "identity_core_03"],
      indexed_surface: true
    };
  }

  if (status === "malicious") {
    return {
      route: "malicious_evidence_boundary",
      use_model_draft: false,
      fallback_reason: "malicious_evidence_ignored",
      quality_flags: uniqueFlags([...flags, "malicious_evidence"])
    };
  }
  if (status === "conflicting") {
    return {
      route: "conflicting_evidence_boundary",
      use_model_draft: false,
      fallback_reason: "conflicting_evidence",
      quality_flags: uniqueFlags([...flags, "conflicting_evidence"])
    };
  }
  if (flags.includes("adapter_context_boundary")) {
    return {
      route: "adapter_context_boundary",
      use_model_draft: false,
      fallback_reason: "adapter_context_boundary",
      quality_flags: uniqueFlags([...flags, "adapter_context_present"])
    };
  }
  if (input.product_admission !== true && asksProductStatus(input.user_input)) {
    return {
      route: "not_product_status",
      use_model_draft: false,
      fallback_reason: "not_product_status",
      quality_flags: uniqueFlags([...flags, "not_product_model"])
    };
  }
  if (status === "insufficient" || status === "none") {
    return {
      route: "insufficient_evidence_boundary",
      use_model_draft: false,
      fallback_reason: "insufficient_evidence",
      quality_flags: uniqueFlags([...flags, "insufficient_evidence"])
    };
  }
  if (flags.includes("generation_timeout") || flags.includes("model_timeout") || flags.includes("runtime_timeout")) {
    return {
      route: "model_timeout_fallback",
      use_model_draft: false,
      fallback_reason: failureReason(flags, ["generation_timeout", "model_timeout", "runtime_timeout"]),
      quality_flags: flags
    };
  }
  if (flags.includes("empty_output")) {
    return {
      route: "model_empty_fallback",
      use_model_draft: false,
      fallback_reason: "empty_output",
      quality_flags: flags
    };
  }
  if (flags.includes("repetition_guard")) {
    return {
      route: "model_repetition_fallback",
      use_model_draft: false,
      fallback_reason: "repetition_guard",
      quality_flags: flags
    };
  }
  if (flags.some((flag) => [
    "bad_token_suppressed",
    "token_id_only_output",
    "low_confidence_gibberish",
    "hidden_prompt_or_cot_marker",
    "hidden_prompt_disclosure_marker",
    "generic_fallback_marker",
    "overlong_output"
  ].includes(flag))) {
    return {
      route: "model_gibberish_fallback",
      use_model_draft: false,
      fallback_reason: failureReason(flags, [
        "bad_token_suppressed",
        "token_id_only_output",
        "low_confidence_gibberish",
        "hidden_prompt_or_cot_marker",
        "hidden_prompt_disclosure_marker",
        "generic_fallback_marker",
        "overlong_output"
      ]),
      quality_flags: flags
    };
  }
  if (flags.includes("synthetic_demo_fallback")) {
    return {
      route: "synthetic_demo_fallback",
      use_model_draft: false,
      fallback_reason: "synthetic_demo_fallback",
      quality_flags: flags
    };
  }
  if (status === "sufficient" && (input.evidence_packet?.retrieved_evidence || []).length > 0) {
    return {
      route: "rag_grounded_answer",
      use_model_draft: true,
      fallback_reason: "",
      quality_flags: flags
    };
  }
  return {
    route: "direct_model_draft",
    use_model_draft: true,
    fallback_reason: "",
    quality_flags: flags
  };
}

export function summarizeRouteForProcessTrace(route = {}, modelDraftGenerated = false) {
  return {
    route: route.route || "synthetic_demo_fallback",
    used_model_draft: route.use_model_draft === true,
    replaced_model_draft: modelDraftGenerated === true && route.use_model_draft !== true,
    reason: route.fallback_reason || "",
    intent: route.intent || "",
    fragment_ids: route.fragment_ids || [],
    indexed_surface: route.indexed_surface === true
  };
}
