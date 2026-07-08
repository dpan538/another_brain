import {
  R28LOAD0_DEEP_CHECK_MAX_TIMEOUT_MS,
  R28LOAD0_DEEP_CHECK_TIMEOUT_MS,
  withTimeout
} from "./model_loading_controller.ts";
import { buildFallbackReadyState, buildQ4ReadyState } from "./model_loading_state.ts";
import { buildModelLoadingReport } from "./model_loading_report.ts";

export const R28LOAD0_MODEL_LOADING_WORKER_VERSION = "r28load0-model-loading-worker-v1";

function clampDeepTimeout(timeoutMs) {
  const numeric = Number(timeoutMs || R28LOAD0_DEEP_CHECK_TIMEOUT_MS);
  return Math.min(Math.max(Number.isFinite(numeric) ? numeric : R28LOAD0_DEEP_CHECK_TIMEOUT_MS, 1000), R28LOAD0_DEEP_CHECK_MAX_TIMEOUT_MS);
}

export async function runModelLoadingWorkerTask(message = {}, generate = null) {
  if (message.type !== "r28load0_q4_warmup") {
    throw new Error("unsupported_model_loading_worker_message");
  }
  if (typeof generate !== "function") {
    throw new Error("model_loading_worker_generate_missing");
  }
  const timeoutMs = clampDeepTimeout(message.timeoutMs);
  try {
    const result = await withTimeout(
      (signal) => generate({
        prompt: message.prompt || "R28LOAD0 q4 warmup",
        maxTokens: Math.min(Number(message.maxTokens || 1), 1),
        contextLength: Math.min(Number(message.contextLength || 32), 32),
        timeoutMs,
        signal
      }),
      timeoutMs,
      message.signal || null,
      "q4_forward_timeout"
    );
    const stats = result?.stats || result || {};
    const tokensGenerated = Number(stats.tokens_generated || result?.tokens?.length || 0);
    if (stats.q4_forward_ran === true && tokensGenerated >= 1) {
      return buildModelLoadingReport(buildQ4ReadyState({ tokens_generated: tokensGenerated, elapsed_ms: stats.elapsed_ms || 0 }));
    }
    return buildModelLoadingReport(buildFallbackReadyState({
      state: "fallback_ready",
      manifest: "pass",
      shards: "pass",
      tokenizer: "pass",
      q4_forward: "fail",
      decode_status: "exact_runtime_tokenizer",
      blocker: stats.blocker || "q4_forward_not_confirmed",
      elapsed_ms: stats.elapsed_ms || 0
    }));
  } catch (error) {
    return buildModelLoadingReport(buildFallbackReadyState({
      state: error.message === "q4_forward_timeout" ? "timeout" : "failed",
      manifest: "pass",
      shards: "pass",
      tokenizer: "pass",
      q4_forward: error.message === "q4_forward_timeout" ? "timeout" : "fail",
      decode_status: "exact_runtime_tokenizer",
      blocker: error.message === "q4_forward_timeout" ? "q4_forward_timeout" : error.message || "q4_forward_failed",
      elapsed_ms: timeoutMs
    }));
  }
}
