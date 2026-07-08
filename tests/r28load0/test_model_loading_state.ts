import test from "node:test";
import assert from "node:assert/strict";
import {
  MODEL_LOADING_STATES,
  buildFallbackReadyState,
  buildModelLoadingState,
  buildQ4ReadyState,
  canTransitionModelLoadingState,
  initialModelLoadingState
} from "../../src/browser_runtime/loading/model_loading_state.ts";

test("R28LOAD0 model loading state schema includes required states", () => {
  for (const state of [
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
  ]) {
    assert.ok(MODEL_LOADING_STATES.includes(state), state);
  }
  assert.equal(initialModelLoadingState().state, "idle");
  assert.equal(buildModelLoadingState({ state: "not_real" }).state, "failed");
});

test("q4 ready and fallback states normalize runtime participation", () => {
  const ready = buildQ4ReadyState({ tokens_generated: 1 });
  assert.equal(ready.state, "q4_ready");
  assert.equal(ready.runtime_mode, "static_q4_experimental");
  assert.equal(ready.q4_forward_ran, true);
  assert.equal(ready.decode_status, "exact_runtime_tokenizer");

  const fallback = buildFallbackReadyState({ blocker: "q4_shards_unavailable" });
  assert.equal(fallback.state, "fallback_ready");
  assert.equal(fallback.runtime_mode, "synthetic_fallback");
  assert.equal(fallback.q4_forward_ran, false);
  assert.equal(fallback.blocker, "q4_shards_unavailable");
});

test("finite state transitions allow the R28LOAD0 loading path", () => {
  assert.equal(canTransitionModelLoadingState("idle", "checking_manifest"), true);
  assert.equal(canTransitionModelLoadingState("checking_manifest", "checking_shards"), true);
  assert.equal(canTransitionModelLoadingState("checking_shards", "checking_tokenizer"), true);
  assert.equal(canTransitionModelLoadingState("checking_tokenizer", "warming_q4"), true);
  assert.equal(canTransitionModelLoadingState("warming_q4", "q4_ready"), true);
  assert.equal(canTransitionModelLoadingState("checking_manifest", "q4_ready"), false);
});
