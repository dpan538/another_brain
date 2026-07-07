import { buildSelfCheckState } from "./self_check_state.ts";

export const R28HOTFIX2_MODEL_PATH_SELFCHECK_VERSION = "r28hotfix2-model-path-self-check-v1";

export function buildQuickModelPathSelfCheck(input = {}) {
  const manifest = input.manifest === true ? "pass" : "fail";
  const shards = input.shards === true ? "pass" : "fail";
  const tokenizer = input.tokenizer === true ? "pass" : "fail";
  const quickPassed = manifest === "pass" && shards === "pass" && tokenizer === "pass";
  return buildSelfCheckState({
    status: quickPassed ? "passed" : "failed",
    manifest,
    shards,
    tokenizer,
    q4_forward: "skipped",
    q4_forward_ran: false,
    tokens_generated: 0,
    decode_status: tokenizer === "pass" ? "exact_runtime_tokenizer" : "not_run",
    runtime_mode: quickPassed ? "static_q4_experimental" : "synthetic_fallback",
    blocker: quickPassed ? "q4_forward_skipped_quick_check" : "model_path_quick_check_failed",
    elapsed_ms: input.elapsed_ms
  });
}

export function buildDeepModelPathSelfCheck(input = {}) {
  const q4Passed = input.q4_forward_ran === true && Number(input.tokens_generated || 0) > 0;
  return buildSelfCheckState({
    status: input.timeout ? "timeout" : q4Passed ? "passed" : "failed",
    manifest: input.manifest === false ? "fail" : "pass",
    shards: input.shards === false ? "fail" : "pass",
    tokenizer: input.tokenizer === false ? "fail" : "pass",
    q4_forward: input.timeout ? "timeout" : q4Passed ? "pass" : "fail",
    q4_forward_ran: q4Passed,
    tokens_generated: input.tokens_generated,
    decode_status: input.decode_status || (q4Passed ? "exact_runtime_tokenizer" : "not_run"),
    runtime_mode: q4Passed ? "static_q4_experimental" : "synthetic_fallback",
    blocker: input.blocker || (q4Passed ? "" : "q4_forward_not_confirmed"),
    elapsed_ms: input.elapsed_ms
  });
}
