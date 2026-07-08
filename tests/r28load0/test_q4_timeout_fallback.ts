import test from "node:test";
import assert from "node:assert/strict";
import { modelLoadingStateFromSelfCheckReport } from "../../src/browser_runtime/loading/model_loading_report.ts";

test("q4 timeout becomes synthetic fallback with q4_forward_timeout blocker", () => {
  const state = modelLoadingStateFromSelfCheckReport({
    status: "timeout",
    elapsed_ms: 8000,
    assets: { manifest_loaded: true, shards_verified: true },
    tokenizer: { exact_runtime_tokenizer: true },
    q4_forward: { status: "timeout", q4_forward_ran: false, tokens_generated: 0 }
  });

  assert.equal(state.state, "timeout");
  assert.equal(state.runtime_mode, "synthetic_fallback");
  assert.equal(state.q4_forward, "timeout");
  assert.equal(state.blocker, "q4_forward_timeout");
});

test("missing shards expose q4_shards_unavailable blocker", () => {
  const state = modelLoadingStateFromSelfCheckReport({
    status: "failed",
    elapsed_ms: 100,
    assets: { manifest_loaded: true, shards_verified: false },
    tokenizer: { exact_runtime_tokenizer: true },
    q4_forward: { status: "skipped", q4_forward_ran: false, tokens_generated: 0 },
    blockers: ["q4_shards_unavailable"]
  });

  assert.equal(state.state, "failed");
  assert.equal(state.runtime_mode, "synthetic_fallback");
  assert.equal(state.blocker, "q4_shards_unavailable");
});
