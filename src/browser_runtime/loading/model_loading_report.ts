import {
  buildFallbackReadyState,
  buildModelLoadingState,
  buildQ4ReadyState,
  R28LOAD0_MODEL_LOADING_STATE_VERSION
} from "./model_loading_state.ts";

export const R28LOAD0_MODEL_LOADING_REPORT_VERSION = "r28load0-model-loading-report-v1";

export const MODEL_LOADING_STEP_LABELS = Object.freeze({
  checking_manifest: "读取 manifest",
  checking_shards: "校验 shards",
  checking_tokenizer: "加载 tokenizer",
  warming_q4: "q4 warmup",
  fallback_ready: "fallback available"
});

export function statusFromBoolean(value, pending = false) {
  if (value === true) return "pass";
  if (value === false) return "fail";
  return pending ? "pending" : "skipped";
}

export function blockerFromReport(report = {}) {
  if (report.blocker) return String(report.blocker);
  if (Array.isArray(report.blockers) && report.blockers.length) return String(report.blockers[0]);
  if (report.q4_forward?.blocker) return String(report.q4_forward.blocker);
  if (report.fallback?.reason) return String(report.fallback.reason);
  return null;
}

export function modelLoadingStateFromSelfCheckReport(report = {}) {
  const status = String(report.status || "");
  const timedOut = status === "timeout" || report.q4_forward?.status === "timeout";
  const cancelled = status === "cancelled";
  const q4Ran = report.q4_forward?.q4_forward_ran === true;
  const tokensGenerated = Number(report.q4_forward?.tokens_generated || report.tokens_generated || 0);
  if (q4Ran && tokensGenerated >= 1) {
    return buildQ4ReadyState({
      elapsed_ms: report.elapsed_ms,
      tokens_generated: tokensGenerated
    });
  }
  const manifest = statusFromBoolean(report.assets?.manifest_loaded, status.startsWith("checking"));
  const shards = statusFromBoolean(report.assets?.shards_verified, status.startsWith("checking"));
  const tokenizer = statusFromBoolean(report.tokenizer?.exact_runtime_tokenizer, status.startsWith("checking"));
  if (cancelled) {
    return buildFallbackReadyState({
      state: "cancelled",
      manifest,
      shards,
      tokenizer,
      q4_forward: "skipped",
      decode_status: tokenizer === "pass" ? "exact_runtime_tokenizer" : "not_run",
      blocker: "self_check_cancelled",
      elapsed_ms: report.elapsed_ms
    });
  }
  if (timedOut) {
    return buildFallbackReadyState({
      state: "timeout",
      manifest,
      shards,
      tokenizer,
      q4_forward: "timeout",
      decode_status: tokenizer === "pass" ? "exact_runtime_tokenizer" : "fallback",
      blocker: "q4_forward_timeout",
      elapsed_ms: report.elapsed_ms
    });
  }
  const blocker = blockerFromReport(report);
  return buildFallbackReadyState({
    state: status === "failed" ? "failed" : "fallback_ready",
    manifest,
    shards,
    tokenizer,
    q4_forward: report.check_level === "quick" ? "skipped" : "fail",
    decode_status: tokenizer === "pass" ? "exact_runtime_tokenizer" : "fallback",
    blocker: blocker || (shards === "fail" ? "q4_shards_unavailable" : "q4_forward_not_confirmed"),
    elapsed_ms: report.elapsed_ms
  });
}

export function buildModelLoadingReport(input = {}) {
  const loadingState = buildModelLoadingState(input.loading_state || input);
  const steps = [
    "checking_manifest",
    "checking_shards",
    "checking_tokenizer",
    "warming_q4",
    "fallback_ready"
  ].map((step) => {
    const done =
      (step === "checking_manifest" && loadingState.manifest === "pass") ||
      (step === "checking_shards" && loadingState.shards === "pass") ||
      (step === "checking_tokenizer" && loadingState.tokenizer === "pass") ||
      (step === "warming_q4" && loadingState.q4_forward === "pass") ||
      (step === "fallback_ready" && loadingState.runtime_mode === "synthetic_fallback");
    const active = loadingState.state === step || (step === "fallback_ready" && loadingState.state === "fallback_ready");
    return {
      id: step,
      label: MODEL_LOADING_STEP_LABELS[step],
      status: done ? "pass" : active ? "pending" : "skipped"
    };
  });
  return {
    version: R28LOAD0_MODEL_LOADING_REPORT_VERSION,
    state_schema_version: R28LOAD0_MODEL_LOADING_STATE_VERSION,
    loading_state: loadingState,
    steps,
    q4_ready: loadingState.state === "q4_ready",
    fallback_visible: loadingState.state !== "q4_ready",
    blocker: loadingState.blocker,
    non_claims: {
      product_model: false,
      product_admission: false,
      browser_admission: false,
      release_checkpoint: false,
      training: false,
      new_model_assets: false,
      backend_inference: false,
      external_llm_api: false,
      doubao: false,
      hosted_vector_store: false
    }
  };
}
