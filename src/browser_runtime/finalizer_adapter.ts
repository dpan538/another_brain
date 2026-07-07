import { applyGenerationGuards, normalizeGenerationPolicy, stripGenericBoilerplate } from "./generation_policy.ts";
import { applyAnswerSurfacePolicy } from "./router/answer_surface_policy.ts";

export const R28GEN1_FINALIZER_VERSION = "r28gen1-answer-surface-finalizer-v1";

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

function evidenceText(evidencePacket = null) {
  return (evidencePacket?.retrieved_evidence || [])
    .map((item) => `${item.title || ""}\n${item.text || ""}`)
    .join("\n")
    .toLowerCase();
}

export function classifyEvidenceForFinalizer(evidencePacket = null) {
  if (!evidencePacket) return "";
  const status = evidencePacket.evidence_status || "insufficient";
  if (evidencePacket.answer_policy_hint === "refuse" || evidencePacket.answer_policy_hint === "ignore_untrusted_instruction") {
    return "malicious_evidence_ignored";
  }
  if (MALICIOUS_EVIDENCE_MARKERS.some((marker) => evidenceText(evidencePacket).includes(marker))) {
    return "malicious_evidence_ignored";
  }
  if (status === "insufficient" || status === "irrelevant") return "insufficient_evidence";
  if (status === "conflicting") return "conflicting_evidence";
  return "";
}

function userSnippet(input) {
  return String(input || "").trim().slice(0, 120);
}

export function buildDeterministicFallback(input, reason = "runtime_or_verifier_fallback", details = {}) {
  const routeByReason = {
    insufficient_evidence: "insufficient_evidence_boundary",
    empty_evidence: "insufficient_evidence_boundary",
    irrelevant_evidence: "insufficient_evidence_boundary",
    conflicting_evidence: "conflicting_evidence_boundary",
    malicious_evidence_ignored: "malicious_evidence_boundary",
    evidence_policy_refuse: "malicious_evidence_boundary",
    evidence_instruction_injection: "malicious_evidence_boundary",
    evidence_hidden_prompt_request: "malicious_evidence_boundary",
    empty_output: "model_empty_fallback",
    token_id_only_output: "model_gibberish_fallback",
    low_confidence_gibberish: "model_gibberish_fallback",
    bad_token_suppressed: "model_gibberish_fallback",
    overlong_output: "model_gibberish_fallback",
    repetition_guard: "model_repetition_fallback",
    generation_timeout: "model_timeout_fallback",
    not_product_status: "not_product_status",
    synthetic_demo_fallback: "synthetic_demo_fallback"
  };
  const routed = applyAnswerSurfacePolicy(
    {
      user_input: userSnippet(input),
      evidence_status: "sufficient",
      runtime_mode: details.runtime_mode || "mock",
      model_output: "",
      decode_status: details.decode_status || "failed",
      generation_flags: [reason],
      adapter_context_present: details.adapter_context_present === true,
      product_admission: false
    },
    {
      route: routeByReason[reason] || "model_gibberish_fallback",
      fallbackReason: reason,
      qualityFlags: [reason]
    }
  );
  return {
    final_answer: routed.final_answer,
    fallback_used: true,
    fallback_reason: reason,
    answer_status: "fallback",
    route: routed.route,
    answer_route: routed.route,
    use_model_draft: false,
    quality_flags: routed.quality_flags,
    non_claims: routed.non_claims,
    route_policy: routed,
    finalizer_version: R28GEN1_FINALIZER_VERSION,
    chinese_first: true,
    no_answer_bank: true,
    product_admission: false,
    browser_admission: false,
    release_checkpoint_admission: false,
    details
  };
}

function makeChineseFirstAnswer(text) {
  const cleaned = stripGenericBoilerplate(text);
  if (/[\u4e00-\u9fff]/.test(cleaned.slice(0, 80))) return cleaned;
  return `根据当前本地证据：${cleaned}`;
}

export function finalizeAnswerSurface({ input, draft = "", generation = {}, evidencePacket = null, verifierResult = null, policy = null } = {}) {
  const normalizedPolicy = policy || normalizeGenerationPolicy();
  const verifierFailure = verifierResult?.passed === false
    ? (verifierResult.failures || [])[0] || "verification_failed"
    : "";
  const guarded = applyGenerationGuards({
    tokens: generation.tokens || [],
    draft,
    runtimeStats: generation,
    policy: normalizedPolicy
  });
  const generationFlags = Array.from(new Set([
    ...((generation.guard_failures || []).map(String)),
    ...((verifierResult?.failures || []).map(String)),
    ...guarded.failures,
    generation.fallback_reason || "",
    generation.quality_status === "quality_not_ready" ? "quality_not_ready" : ""
  ].filter(Boolean)));
  const routed = applyAnswerSurfacePolicy({
    user_input: input,
    evidence_status: evidencePacket?.evidence_status || "none",
    runtime_mode: generation.runtime_mode || "mock",
    model_output: guarded.draft || draft,
    decode_status: generation.decode_status || "",
    generation_flags: generationFlags,
    adapter_context_present: generation.adapter_context_present === true,
    product_admission: false,
    evidence_packet: evidencePacket
  });
  if (routed.fallback_used) {
    return {
      final_answer: routed.final_answer,
      fallback_used: true,
      fallback_reason: routed.fallback_reason || verifierFailure || guarded.failures[0] || "router_fallback",
      answer_status: "fallback",
      route: routed.route,
      answer_route: routed.route,
      use_model_draft: false,
      quality_flags: routed.quality_flags,
      non_claims: routed.non_claims,
      route_policy: routed,
      finalizer_version: R28GEN1_FINALIZER_VERSION,
      chinese_first: true,
      no_answer_bank: true,
      product_admission: false,
      browser_admission: false,
      release_checkpoint_admission: false,
      details: { verifier_failures: verifierResult?.failures || [], guard_failures: guarded.failures }
    };
  }

  const finalAnswer = routed.final_answer || makeChineseFirstAnswer(guarded.draft);
  return {
    final_answer: finalAnswer,
    fallback_used: false,
    fallback_reason: "",
    answer_status: "final",
    route: routed.route,
    answer_route: routed.route,
    use_model_draft: routed.use_model_draft === true,
    quality_flags: routed.quality_flags,
    non_claims: routed.non_claims,
    route_policy: routed,
    finalizer_version: R28GEN1_FINALIZER_VERSION,
    chinese_first: true,
    no_answer_bank: true,
    product_admission: false,
    browser_admission: false,
    release_checkpoint_admission: false,
    generation_policy: normalizedPolicy.policy_version
  };
}

export function summarizeFinalizerDecision(finalized = {}, generation = {}) {
  const q4ForwardRan = generation.runtime_mode === "static_q4_experimental"
    && Number(generation.tokens_generated || 0) > 0
    && generation.fallback_used !== true;
  return {
    final_answer_source: finalized.use_model_draft && q4ForwardRan ? "model_draft" : finalized.fallback_used ? "fallback" : "router_boundary",
    quality_flags: finalized.quality_flags || [],
    fallback_reason: finalized.fallback_reason || "",
    replaced_model_draft: Boolean(generation.draft || generation.tokens?.length) && finalized.use_model_draft !== true
  };
}
