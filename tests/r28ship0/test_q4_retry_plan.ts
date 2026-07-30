import test from "node:test";
import assert from "node:assert/strict";
import {
  buildQ4RetryAttempt,
  retryPlanExhausted,
  retryStrategyForAttempt,
  summarizeQ4RetryPlan
} from "../../src/browser_runtime/loading/q4_retry_plan.ts";

test("retry plan uses primary plus Plan B strategies before fallback", () => {
  assert.equal(retryStrategyForAttempt(1), "primary");
  assert.equal(retryStrategyForAttempt(2), "reuse_http_cache");
  assert.equal(retryStrategyForAttempt(3), "cache_bust");
  assert.equal(retryStrategyForAttempt(4), "clear_model_cache");
  assert.equal(retryStrategyForAttempt(5), "worker_restart");

  const failed = [1, 2, 3, 4, 5].map((attempt) => buildQ4RetryAttempt({
    attempt,
    strategy: retryStrategyForAttempt(attempt),
    manifest: "pass",
    shards: "pass",
    tokenizer: "pass",
    q4_forward: "fail",
    blocker: "q4_forward_not_confirmed"
  }));
  assert.equal(retryPlanExhausted(failed), true);
  assert.equal(summarizeQ4RetryPlan(failed).status, "fallback_ready");
});

test("retry plan reports q4_ready on first successful forward", () => {
  const summary = summarizeQ4RetryPlan([
    buildQ4RetryAttempt({ attempt: 1, strategy: "primary", manifest: "pass", shards: "pass", tokenizer: "pass", q4_forward: "fail", blocker: "worker_error" }),
    buildQ4RetryAttempt({ attempt: 2, strategy: "reuse_http_cache", manifest: "pass", shards: "pass", tokenizer: "pass", q4_forward: "pass" })
  ]);
  assert.equal(summary.status, "q4_ready");
  assert.equal(summary.passed_attempt.strategy, "reuse_http_cache");
  assert.equal(summary.fallback_reason, "");
});
