import {
  buildFallbackReadyState,
  buildModelLoadingState,
  buildQ4ReadyState,
  initialModelLoadingState
} from "./model_loading_state.ts";
import { buildModelLoadingReport } from "./model_loading_report.ts";

export const R28LOAD0_MODEL_LOADING_CONTROLLER_VERSION = "r28load0-model-loading-controller-v1";
export const R28LOAD0_QUICK_CHECK_TIMEOUT_MS = 1000;
export const R28LOAD0_DEEP_CHECK_TIMEOUT_MS = 8000;
export const R28LOAD0_DEEP_CHECK_MAX_TIMEOUT_MS = 15000;

function nowMs() {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

function clampTimeout(value, fallback, min, max) {
  const numeric = Number(value || fallback);
  return Math.min(Math.max(Number.isFinite(numeric) ? numeric : fallback, min), max);
}

function timeoutError(reason) {
  const error = new Error(reason);
  error.reason = reason;
  return error;
}

export function withTimeout(task, timeoutMs, signal = null, timeoutReason = "model_loading_timeout") {
  const controller = new AbortController();
  let timer = null;
  return new Promise((resolve, reject) => {
    const relayAbort = () => {
      controller.abort(signal?.reason || timeoutError("model_loading_cancelled"));
      reject(timeoutError("model_loading_cancelled"));
    };
    if (signal) {
      if (signal.aborted) relayAbort();
      else signal.addEventListener("abort", relayAbort, { once: true });
    }
    timer = setTimeout(() => {
      controller.abort(timeoutError(timeoutReason));
      reject(timeoutError(timeoutReason));
    }, timeoutMs);
    Promise.resolve()
      .then(() => task(controller.signal))
      .then(resolve, reject)
      .finally(() => {
        clearTimeout(timer);
        if (signal) signal.removeEventListener?.("abort", relayAbort);
      });
  });
}

export class ModelLoadingController {
  constructor(options = {}) {
    this.quickCheck = options.quickCheck || (async () => ({ manifest: true, shards: true, tokenizer: true }));
    this.deepCheck = options.deepCheck || (async () => ({ q4_forward_ran: false, tokens_generated: 0 }));
    this.onReport = typeof options.onReport === "function" ? options.onReport : () => {};
    this.state = initialModelLoadingState();
    this.activeController = null;
    this.activePromise = null;
    this.startedAt = 0;
    this.workerStarts = 0;
  }

  elapsedMs() {
    return Math.max(0, Math.round(nowMs() - this.startedAt));
  }

  emit(partial = {}) {
    this.state = buildModelLoadingState({
      ...this.state,
      ...partial,
      elapsed_ms: partial.elapsed_ms ?? this.elapsedMs()
    });
    const report = buildModelLoadingReport(this.state);
    this.onReport(report);
    return report;
  }

  cancel(reason = "model_loading_cancelled") {
    if (!this.activeController) {
      this.emit({
        state: "cancelled",
        q4_forward: "skipped",
        runtime_mode: "synthetic_fallback",
        blocker: reason,
        cancelable: false
      });
      return false;
    }
    this.activeController.abort(timeoutError(reason));
    this.activeController = null;
    this.activePromise = null;
    this.emit({
      state: "cancelled",
      q4_forward: "skipped",
      runtime_mode: "synthetic_fallback",
      blocker: reason,
      cancelable: false
    });
    return true;
  }

  run(options = {}) {
    if (this.activePromise) return this.activePromise;
    const runDeep = options.runDeep === true;
    const quickTimeoutMs = clampTimeout(options.quickTimeoutMs, R28LOAD0_QUICK_CHECK_TIMEOUT_MS, 1, R28LOAD0_QUICK_CHECK_TIMEOUT_MS);
    const deepTimeoutMs = clampTimeout(
      options.deepTimeoutMs || options.timeoutMs,
      R28LOAD0_DEEP_CHECK_TIMEOUT_MS,
      1000,
      R28LOAD0_DEEP_CHECK_MAX_TIMEOUT_MS
    );
    this.startedAt = nowMs();
    this.activeController = new AbortController();
    this.activePromise = this.runInternal({
      runDeep,
      quickTimeoutMs,
      deepTimeoutMs,
      signal: this.activeController.signal
    }).finally(() => {
      this.activeController = null;
      this.activePromise = null;
    });
    return this.activePromise;
  }

  async runInternal({ runDeep, quickTimeoutMs, deepTimeoutMs, signal }) {
    this.emit({
      state: "checking_manifest",
      manifest: "pending",
      shards: "pending",
      tokenizer: "pending",
      q4_forward: "pending",
      q4_forward_ran: false,
      tokens_generated: 0,
      decode_status: "not_run",
      runtime_mode: "synthetic_fallback",
      blocker: null,
      cancelable: true
    });

    let quick;
    try {
      quick = await withTimeout((innerSignal) => this.quickCheck({ signal: innerSignal }), quickTimeoutMs, signal, "quick_check_timeout");
    } catch (error) {
      if (signal.aborted || error.message === "model_loading_cancelled") {
        return this.emit({
          state: "cancelled",
          q4_forward: "skipped",
          blocker: "model_loading_cancelled",
          cancelable: false
        });
      }
      return this.emit({
        state: error.message === "quick_check_timeout" ? "timeout" : "failed",
        manifest: "fail",
        shards: "skipped",
        tokenizer: "skipped",
        q4_forward: "skipped",
        runtime_mode: "synthetic_fallback",
        blocker: error.message === "quick_check_timeout" ? "quick_check_timeout" : error.message || "quick_check_failed",
        cancelable: false
      });
    }

    const manifestPassed = quick.manifest === true || quick.manifest === "pass";
    this.emit({ state: "checking_shards", manifest: manifestPassed ? "pass" : "fail", cancelable: true });
    const shardsPassed = quick.shards === true || quick.shards === "pass";
    this.emit({ state: "checking_tokenizer", shards: shardsPassed ? "pass" : "fail", cancelable: true });
    const tokenizerPassed = quick.tokenizer === true || quick.tokenizer === "pass";
    const blocker = quick.blocker || (!manifestPassed ? "asset_manifest_unavailable" : !shardsPassed ? "q4_shards_unavailable" : !tokenizerPassed ? "exact_runtime_tokenizer_unavailable" : null);
    if (!manifestPassed || !shardsPassed || !tokenizerPassed) {
      return this.emit({
        state: "fallback_ready",
        tokenizer: tokenizerPassed ? "pass" : "fail",
        q4_forward: "skipped",
        decode_status: tokenizerPassed ? "exact_runtime_tokenizer" : "fallback",
        runtime_mode: "synthetic_fallback",
        blocker,
        cancelable: false
      });
    }

    this.emit({
      state: runDeep ? "warming_q4" : "fallback_ready",
      tokenizer: "pass",
      q4_forward: runDeep ? "pending" : "skipped",
      decode_status: "exact_runtime_tokenizer",
      runtime_mode: runDeep ? "synthetic_fallback" : "static_q4_experimental",
      blocker: runDeep ? null : "q4_forward_skipped_quick_check",
      cancelable: runDeep
    });
    if (!runDeep) return buildModelLoadingReport(this.state);

    try {
      this.workerStarts += 1;
      const deep = await withTimeout((innerSignal) => this.deepCheck({ signal: innerSignal }), deepTimeoutMs, signal, "q4_forward_timeout");
      if (deep.q4_forward_ran === true && Number(deep.tokens_generated || 0) >= 1) {
        this.state = buildQ4ReadyState({
          elapsed_ms: this.elapsedMs(),
          tokens_generated: Number(deep.tokens_generated || 1)
        });
        const report = buildModelLoadingReport(this.state);
        this.onReport(report);
        return report;
      }
      return this.emit({
        state: "fallback_ready",
        q4_forward: "fail",
        q4_forward_ran: false,
        tokens_generated: Number(deep.tokens_generated || 0),
        runtime_mode: "synthetic_fallback",
        blocker: deep.blocker || "q4_forward_not_confirmed",
        cancelable: false
      });
    } catch (error) {
      if (signal.aborted || error.message === "model_loading_cancelled") {
        return this.emit({
          state: "cancelled",
          q4_forward: "skipped",
          runtime_mode: "synthetic_fallback",
          blocker: "model_loading_cancelled",
          cancelable: false
        });
      }
      return this.emit({
        state: error.message === "q4_forward_timeout" ? "timeout" : "failed",
        q4_forward: error.message === "q4_forward_timeout" ? "timeout" : "fail",
        q4_forward_ran: false,
        tokens_generated: 0,
        runtime_mode: "synthetic_fallback",
        blocker: error.message === "q4_forward_timeout" ? "q4_forward_timeout" : error.message || "q4_forward_failed",
        cancelable: false
      });
    }
  }
}
