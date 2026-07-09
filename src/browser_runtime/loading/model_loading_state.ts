export const R28LOAD0_MODEL_LOADING_STATE_VERSION = "r28load0-model-loading-state-v1";

export const MODEL_LOADING_STATES = Object.freeze([
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

export const MODEL_LOADING_COMPONENT_STATUSES = Object.freeze([
  "pass",
  "fail",
  "pending",
  "skipped"
]);

export const MODEL_LOADING_Q4_STATUSES = Object.freeze([
  "pass",
  "fail",
  "timeout",
  "pending",
  "skipped"
]);

export const MODEL_LOADING_DECODE_STATUSES = Object.freeze([
  "exact_runtime_tokenizer",
  "fallback",
  "not_run"
]);

export const MODEL_LOADING_RUNTIME_MODES = Object.freeze([
  "static_q4_experimental",
  "synthetic_fallback"
]);

export const MODEL_LOADING_TERMINAL_STATES = Object.freeze([
  "q4_ready",
  "fallback_ready",
  "timeout",
  "cancelled",
  "failed"
]);

export const MODEL_LOADING_TRANSITIONS = Object.freeze({
  idle: ["checking_manifest", "cancelled"],
  checking_manifest: ["checking_shards", "fallback_ready", "failed", "timeout", "cancelled"],
  checking_shards: ["checking_tokenizer", "fallback_ready", "failed", "timeout", "cancelled"],
  checking_tokenizer: ["warming_q4", "fallback_ready", "failed", "timeout", "cancelled"],
  warming_q4: ["q4_ready", "fallback_ready", "timeout", "failed", "cancelled"],
  q4_ready: ["checking_manifest"],
  fallback_ready: ["checking_manifest"],
  timeout: ["checking_manifest"],
  cancelled: ["checking_manifest"],
  failed: ["checking_manifest"]
});

function normalizeEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

export function isModelLoadingState(state) {
  return MODEL_LOADING_STATES.includes(state);
}

export function isTerminalModelLoadingState(state) {
  return MODEL_LOADING_TERMINAL_STATES.includes(state);
}

export function canTransitionModelLoadingState(from, to) {
  const source = normalizeEnum(from, MODEL_LOADING_STATES, "idle");
  const target = normalizeEnum(to, MODEL_LOADING_STATES, "failed");
  return (MODEL_LOADING_TRANSITIONS[source] || []).includes(target);
}

export function normalizeModelLoadingBlocker(value) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

export function buildModelLoadingState(input = {}) {
  const state = normalizeEnum(input.state || "idle", MODEL_LOADING_STATES, "failed");
  const q4Forward = normalizeEnum(input.q4_forward || "pending", MODEL_LOADING_Q4_STATUSES, "fail");
  const runtimeMode = normalizeEnum(
    input.runtime_mode || (state === "q4_ready" ? "static_q4_experimental" : "synthetic_fallback"),
    MODEL_LOADING_RUNTIME_MODES,
    "synthetic_fallback"
  );
  return {
    state,
    manifest: normalizeEnum(input.manifest || "pending", MODEL_LOADING_COMPONENT_STATUSES, "pending"),
    shards: normalizeEnum(input.shards || "pending", MODEL_LOADING_COMPONENT_STATUSES, "pending"),
    tokenizer: normalizeEnum(input.tokenizer || "pending", MODEL_LOADING_COMPONENT_STATUSES, "pending"),
    q4_forward: q4Forward,
    q4_forward_ran: input.q4_forward_ran === true,
    tokens_generated: Math.max(0, Number(input.tokens_generated || 0)),
    decode_status: normalizeEnum(input.decode_status || "not_run", MODEL_LOADING_DECODE_STATUSES, "not_run"),
    runtime_mode: runtimeMode,
    blocker: normalizeModelLoadingBlocker(input.blocker),
    elapsed_ms: Math.max(0, Math.round(Number(input.elapsed_ms || 0))),
    cancelable: input.cancelable === true,
    version: R28LOAD0_MODEL_LOADING_STATE_VERSION
  };
}

export function initialModelLoadingState() {
  return buildModelLoadingState({
    state: "idle",
    manifest: "skipped",
    shards: "skipped",
    tokenizer: "skipped",
    q4_forward: "skipped",
    runtime_mode: "synthetic_fallback",
    cancelable: false
  });
}

export function buildQ4ReadyState(input = {}) {
  return buildModelLoadingState({
    ...input,
    state: "q4_ready",
    manifest: "pass",
    shards: "pass",
    tokenizer: "pass",
    q4_forward: "pass",
    q4_forward_ran: true,
    tokens_generated: Math.max(1, Number(input.tokens_generated || 1)),
    decode_status: "exact_runtime_tokenizer",
    runtime_mode: "static_q4_experimental",
    blocker: null,
    cancelable: false
  });
}

export function buildFallbackReadyState(input = {}) {
  return buildModelLoadingState({
    ...input,
    state: input.state || "fallback_ready",
    q4_forward_ran: false,
    runtime_mode: "synthetic_fallback",
    cancelable: false
  });
}

export function transitionModelLoadingState(current, next = {}) {
  const source = buildModelLoadingState(current);
  const target = buildModelLoadingState({
    ...source,
    ...next
  });
  if (!canTransitionModelLoadingState(source.state, target.state)) {
    throw new Error(`invalid_model_loading_transition:${source.state}->${target.state}`);
  }
  return target;
}
