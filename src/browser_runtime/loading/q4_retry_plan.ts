export const R28SHIP0_Q4_RETRY_PLAN_VERSION = "r28ship0-q4-retry-plan-v1";

export const Q4_RETRY_STRATEGIES = Object.freeze([
  "primary",
  "reuse_http_cache",
  "cache_bust",
  "clear_model_cache",
  "worker_restart"
]);

export const Q4_RETRY_COMPONENT_STATUSES = Object.freeze(["pass", "fail"]);
export const Q4_RETRY_FORWARD_STATUSES = Object.freeze(["pass", "fail", "timeout", "skipped"]);

function normalizeEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function normalizePassFail(value) {
  if (value === true || value === "pass" || value === "passed") return "pass";
  return "fail";
}

export function retryStrategyForAttempt(attempt) {
  const index = Math.max(1, Number(attempt || 1)) - 1;
  return Q4_RETRY_STRATEGIES[Math.min(index, Q4_RETRY_STRATEGIES.length - 1)];
}

export function buildQ4RetryAttempt(input = {}) {
  const attempt = Math.max(1, Number(input.attempt || 1));
  const strategy = normalizeEnum(input.strategy || retryStrategyForAttempt(attempt), Q4_RETRY_STRATEGIES, "primary");
  const q4ForwardRaw = input.q4_forward === true ? "pass" : input.q4_forward === false ? "fail" : input.q4_forward || "skipped";
  return {
    attempt,
    strategy,
    manifest: normalizePassFail(input.manifest),
    shards: normalizePassFail(input.shards),
    tokenizer: normalizePassFail(input.tokenizer),
    q4_forward: normalizeEnum(q4ForwardRaw, Q4_RETRY_FORWARD_STATUSES, "fail"),
    blocker: String(input.blocker || ""),
    elapsed_ms: Math.max(0, Math.round(Number(input.elapsed_ms || 0))),
    version: R28SHIP0_Q4_RETRY_PLAN_VERSION
  };
}

export function retryAttemptPassed(attempt = {}) {
  const normalized = buildQ4RetryAttempt(attempt);
  return normalized.manifest === "pass"
    && normalized.shards === "pass"
    && normalized.tokenizer === "pass"
    && normalized.q4_forward === "pass";
}

export function retryAttemptNeedsFallback(attempt = {}) {
  return !retryAttemptPassed(attempt);
}

export function retryPlanExhausted(attempts = []) {
  const normalizedAttempts = attempts.map((attempt, index) => buildQ4RetryAttempt({ attempt: index + 1, ...attempt }));
  return normalizedAttempts.length >= Q4_RETRY_STRATEGIES.length
    && normalizedAttempts.every((attempt) => !retryAttemptPassed(attempt));
}

export function summarizeQ4RetryPlan(attempts = []) {
  const normalizedAttempts = attempts.map((attempt, index) => buildQ4RetryAttempt({ attempt: index + 1, ...attempt }));
  const passedAttempt = normalizedAttempts.find((attempt) => retryAttemptPassed(attempt));
  const lastAttempt = normalizedAttempts[normalizedAttempts.length - 1] || null;
  return {
    status: passedAttempt ? "q4_ready" : retryPlanExhausted(normalizedAttempts) ? "fallback_ready" : "retrying",
    attempts: normalizedAttempts,
    passed_attempt: passedAttempt || null,
    final_strategy: passedAttempt?.strategy || lastAttempt?.strategy || "primary",
    fallback_reason: passedAttempt ? "" : lastAttempt?.blocker || "q4_retry_plan_not_complete",
    exhausted: retryPlanExhausted(normalizedAttempts),
    version: R28SHIP0_Q4_RETRY_PLAN_VERSION
  };
}
