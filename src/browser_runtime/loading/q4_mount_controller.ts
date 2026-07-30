import {
  Q4_RETRY_STRATEGIES,
  buildQ4RetryAttempt,
  retryAttemptPassed,
  summarizeQ4RetryPlan
} from "./q4_retry_plan.ts";

export const R28SHIP0_Q4_MOUNT_CONTROLLER_VERSION = "r28ship0-q4-mount-controller-v1";

export const Q4_MOUNT_STATES = Object.freeze([
  "idle",
  "checking_manifest",
  "checking_shards",
  "checking_tokenizer",
  "warming_q4",
  "q4_ready",
  "fallback_ready",
  "timeout",
  "cancelled",
  "failed"
]);

function nowMs() {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

function blockerFromReport(report = {}) {
  return (Array.isArray(report.blockers) && report.blockers[0])
    || report.q4_forward?.blocker
    || report.fallback?.reason
    || report.error
    || "";
}

function attemptFromReport(report = {}, attempt, strategy, elapsedMs = 0) {
  return buildQ4RetryAttempt({
    attempt,
    strategy,
    manifest: report.assets?.manifest_loaded === true || report.manifest === "pass",
    shards: report.assets?.shards_verified === true || report.shards === "pass",
    tokenizer: report.tokenizer?.exact_runtime_tokenizer === true || report.tokenizer === "pass",
    q4_forward: report.q4_forward?.q4_forward_ran === true ? "pass" : report.q4_forward?.status || "fail",
    blocker: blockerFromReport(report),
    elapsed_ms: elapsedMs
  });
}

export class Q4MountController {
  constructor(options = {}) {
    this.check = options.check || (async () => ({ ok: false, blocker: "check_not_configured" }));
    this.clearModelCache = options.clearModelCache || (async () => ({ cleared: false }));
    this.restartWorkerOnce = options.restartWorkerOnce || (async () => ({ restarted: false, blocker: "restart_not_configured" }));
    this.onReport = typeof options.onReport === "function" ? options.onReport : () => {};
    this.activePromise = null;
    this.cancelled = false;
  }

  cancel(reason = "q4_mount_cancelled") {
    this.cancelled = true;
    this.onReport({
      state: "cancelled",
      retry_plan: summarizeQ4RetryPlan([]),
      blocker: reason,
      version: R28SHIP0_Q4_MOUNT_CONTROLLER_VERSION
    });
  }

  run(options = {}) {
    if (this.activePromise) return this.activePromise;
    this.cancelled = false;
    this.activePromise = this.runInternal(options).finally(() => {
      this.activePromise = null;
    });
    return this.activePromise;
  }

  async runInternal(options = {}) {
    const attempts = [];
    const startedAt = nowMs();
    for (let index = 0; index < Q4_RETRY_STRATEGIES.length; index += 1) {
      if (this.cancelled) break;
      const attemptNumber = index + 1;
      const strategy = Q4_RETRY_STRATEGIES[index];
      this.onReport({
        state: "warming_q4",
        retrying: attemptNumber > 1,
        current_attempt: attemptNumber,
        current_strategy: strategy,
        attempts,
        retry_plan: summarizeQ4RetryPlan(attempts),
        version: R28SHIP0_Q4_MOUNT_CONTROLLER_VERSION
      });

      if (strategy === "clear_model_cache") await this.clearModelCache();
      if (strategy === "worker_restart") await this.restartWorkerOnce();

      let report;
      try {
        report = await this.check({
          ...options,
          attempt: attemptNumber,
          strategy,
          reuseHttpCache: strategy === "reuse_http_cache",
          cacheBust: strategy === "cache_bust",
          clearModelCache: strategy === "clear_model_cache",
          workerRestart: strategy === "worker_restart"
        });
      } catch (error) {
        report = {
          status: error.message === "q4_forward_timeout" ? "timeout" : "failed",
          assets: { manifest_loaded: false, shards_verified: false },
          tokenizer: { exact_runtime_tokenizer: false },
          q4_forward: { status: error.message === "q4_forward_timeout" ? "timeout" : "fail", q4_forward_ran: false, blocker: error.message },
          blockers: [error.message || "q4_mount_check_failed"]
        };
      }

      const attempt = attemptFromReport(report, attemptNumber, strategy, nowMs() - startedAt);
      attempts.push(attempt);
      const summary = summarizeQ4RetryPlan(attempts);
      this.onReport({
        state: retryAttemptPassed(attempt) ? "q4_ready" : attempt.q4_forward === "timeout" ? "timeout" : "warming_q4",
        retrying: !retryAttemptPassed(attempt),
        current_attempt: attemptNumber,
        current_strategy: strategy,
        attempts,
        retry_plan: summary,
        last_report: report,
        blocker: attempt.blocker,
        version: R28SHIP0_Q4_MOUNT_CONTROLLER_VERSION
      });
      if (retryAttemptPassed(attempt)) {
        return {
          ok: true,
          state: "q4_ready",
          report,
          attempts,
          retry_plan: summary,
          version: R28SHIP0_Q4_MOUNT_CONTROLLER_VERSION
        };
      }
    }

    const summary = summarizeQ4RetryPlan(attempts);
    return {
      ok: false,
      state: this.cancelled ? "cancelled" : "fallback_ready",
      attempts,
      retry_plan: summary,
      fallback_reason: summary.fallback_reason || "q4_retry_plan_exhausted",
      version: R28SHIP0_Q4_MOUNT_CONTROLLER_VERSION
    };
  }
}
