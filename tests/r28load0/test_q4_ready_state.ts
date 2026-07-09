import test from "node:test";
import assert from "node:assert/strict";
import { ModelLoadingController } from "../../src/browser_runtime/loading/model_loading_controller.ts";
import { modelLoadingStateFromSelfCheckReport } from "../../src/browser_runtime/loading/model_loading_report.ts";

test("q4 ready requires q4 forward to run and generate at least one token", async () => {
  const controller = new ModelLoadingController({
    quickCheck: async () => ({ manifest: true, shards: true, tokenizer: true }),
    deepCheck: async () => ({ q4_forward_ran: true, tokens_generated: 2 })
  });

  const report = await controller.run({ runDeep: true, deepTimeoutMs: 1000 });

  assert.equal(report.loading_state.state, "q4_ready");
  assert.equal(report.loading_state.q4_forward, "pass");
  assert.equal(report.loading_state.q4_forward_ran, true);
  assert.equal(report.loading_state.tokens_generated >= 1, true);
  assert.equal(report.loading_state.runtime_mode, "static_q4_experimental");
});

test("legacy self-check report maps to q4_ready only after warmup token", () => {
  const state = modelLoadingStateFromSelfCheckReport({
    status: "passed",
    elapsed_ms: 42,
    assets: { manifest_loaded: true, shards_verified: true },
    tokenizer: { exact_runtime_tokenizer: true },
    q4_forward: { q4_forward_ran: true, tokens_generated: 1 }
  });

  assert.equal(state.state, "q4_ready");
  assert.equal(state.decode_status, "exact_runtime_tokenizer");
});
