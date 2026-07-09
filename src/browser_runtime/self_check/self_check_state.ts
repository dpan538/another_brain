export const R28HOTFIX2_SELFCHECK_STATE_VERSION = "r28hotfix2-self-check-state-v1";

export const SELF_CHECK_STATUSES = Object.freeze([
  "idle",
  "checking_quick",
  "checking_deep",
  "passed",
  "failed",
  "timeout",
  "cancelled"
]);

export const SELF_CHECK_COMPONENT_STATUSES = Object.freeze([
  "pass",
  "fail",
  "skipped",
  "timeout"
]);

export function normalizeSelfCheckStatus(status = "idle") {
  return SELF_CHECK_STATUSES.includes(status) ? status : "failed";
}

export function buildSelfCheckState(input = {}) {
  return {
    status: normalizeSelfCheckStatus(input.status),
    manifest: input.manifest || "skipped",
    shards: input.shards || "skipped",
    tokenizer: input.tokenizer || "skipped",
    q4_forward: input.q4_forward || "skipped",
    q4_forward_ran: input.q4_forward_ran === true,
    tokens_generated: Number(input.tokens_generated || 0),
    decode_status: input.decode_status || "not_run",
    runtime_mode: input.runtime_mode || "synthetic_fallback",
    blocker: String(input.blocker || ""),
    elapsed_ms: Number(input.elapsed_ms || 0),
    version: R28HOTFIX2_SELFCHECK_STATE_VERSION
  };
}
