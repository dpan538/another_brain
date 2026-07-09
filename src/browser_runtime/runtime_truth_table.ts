export const R28SHIP0_RUNTIME_TRUTH_TABLE_VERSION = "r28ship0-runtime-truth-table-v1";

export const RUNTIME_TRUTH_BLOCKERS = Object.freeze([
  "asset_missing",
  "tokenizer_fail",
  "forward_timeout",
  "worker_error",
  "q4_forward_not_confirmed",
  "q4_retry_plan_exhausted",
  "model_loading_cancelled"
]);

export const Q4_QUALITY_BLOCKING_FLAGS = Object.freeze([
  "bad_token_suppressed",
  "token_id_only_output",
  "low_confidence_gibberish",
  "mojibake_output",
  "mojibake_symbol_mix",
  "mixed_script_mojibake",
  "control_char_output",
  "hidden_prompt_disclosure_marker",
  "generic_fallback_marker",
  "overlong_output",
  "repetition_guard",
  "quality_not_ready"
]);

function normalizeStatus(value) {
  if (value === true || value === "pass" || value === "passed" || value === "通过") return "pass";
  if (value === "warming" || value === "pending" || value === "检查中") return "warming";
  if (value === "timeout") return "timeout";
  if (value === "skipped") return "skipped";
  return "fail";
}

function visibleBlocker(input = {}) {
  return String(input.blocker || input.fallback_reason || input.q4_forward_blocker || "").trim();
}

export function evaluateRuntimeTruth(input = {}) {
  const runtimeMode = String(input.runtime_mode || "");
  const answerSource = String(input.answer_source || input.answer_source_label || "");
  const blocker = visibleBlocker(input);
  const assets = normalizeStatus(input.assets || input.manifest || input.q4_assets);
  const tokenizer = normalizeStatus(input.tokenizer);
  const q4Forward = normalizeStatus(input.q4_forward);
  const q4ForwardBoolean = input.q4_forward === true || input.q4_forward_ran === true;
  const tokensGenerated = Math.max(0, Number(input.tokens_generated || 0));
  const qualityFlags = Array.isArray(input.quality_flags) ? input.quality_flags.map(String) : [];
  const q4QualityAccepted = input.q4_quality_accepted === true;
  const q4QualityAssessed = input.q4_quality_assessed === true || qualityFlags.some((flag) => Q4_QUALITY_BLOCKING_FLAGS.includes(flag));
  const failures = [];

  if (runtimeMode === "static_q4_experimental") {
    if (assets !== "pass") failures.push("static_q4_requires_assets_pass");
    if (tokenizer !== "pass") failures.push("static_q4_requires_tokenizer_pass");
    if (!["pass", "warming", "timeout"].includes(q4Forward)) failures.push("static_q4_requires_forward_pass_warming_or_timeout");
    if (answerSource === "no_model_fallback" && !blocker) failures.push("fallback_source_requires_visible_blocker");
  }

  if (input.q4_forward === false || q4Forward === "fail" || q4Forward === "timeout") {
    if (!blocker) failures.push("q4_forward_false_requires_visible_reason");
    if (blocker && !RUNTIME_TRUTH_BLOCKERS.includes(blocker) && !blocker.includes("asset") && !blocker.includes("tokenizer") && !blocker.includes("timeout") && !blocker.includes("worker") && !blocker.includes("q4")) {
      failures.push("q4_forward_false_reason_not_specific");
    }
  }

  if (q4ForwardBoolean || q4Forward === "pass") {
    if (tokensGenerated <= 0) failures.push("q4_forward_true_requires_tokens_generated");
    if (!["model_draft", "router_after_model_draft", "static_q4_experimental", "self_check_static_q4_experimental"].includes(answerSource)) {
      failures.push("q4_forward_true_answer_source_mismatch");
    }
    if (q4QualityAssessed && !q4QualityAccepted) failures.push("q4_forward_quality_not_admitted");
  }

  return {
    ok: failures.length === 0,
    failures,
    runtime_mode: runtimeMode,
    q4_forward: q4Forward,
    tokens_generated: tokensGenerated,
    answer_source: answerSource,
    blocker,
    q4_quality_accepted: q4QualityAccepted,
    quality_flags: qualityFlags,
    version: R28SHIP0_RUNTIME_TRUTH_TABLE_VERSION
  };
}
