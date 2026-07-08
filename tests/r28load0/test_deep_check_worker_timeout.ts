import test from "node:test";
import assert from "node:assert/strict";
import {
  ModelLoadingController,
  R28LOAD0_DEEP_CHECK_MAX_TIMEOUT_MS,
  R28LOAD0_DEEP_CHECK_TIMEOUT_MS
} from "../../src/browser_runtime/loading/model_loading_controller.ts";
import { runModelLoadingWorkerTask } from "../../src/browser_runtime/loading/model_loading_worker.ts";

test("deep q4 warmup defaults to 8s, caps at 15s, and times out to fallback", async () => {
  assert.equal(R28LOAD0_DEEP_CHECK_TIMEOUT_MS, 8000);
  assert.equal(R28LOAD0_DEEP_CHECK_MAX_TIMEOUT_MS, 15000);
  const controller = new ModelLoadingController({
    quickCheck: async () => ({ manifest: true, shards: true, tokenizer: true }),
    deepCheck: async () => new Promise(() => {})
  });

  const report = await controller.run({ runDeep: true, deepTimeoutMs: 20 });

  assert.equal(controller.workerStarts, 1);
  assert.equal(report.loading_state.state, "timeout");
  assert.equal(report.loading_state.q4_forward, "timeout");
  assert.equal(report.loading_state.blocker, "q4_forward_timeout");
  assert.equal(report.loading_state.runtime_mode, "synthetic_fallback");
});

test("model loading worker task reports q4_ready after a warmup token", async () => {
  const report = await runModelLoadingWorkerTask(
    { type: "r28load0_q4_warmup", timeoutMs: 1000, maxTokens: 1 },
    async () => ({ stats: { q4_forward_ran: true, tokens_generated: 1, elapsed_ms: 3 } })
  );

  assert.equal(report.loading_state.state, "q4_ready");
  assert.equal(report.loading_state.tokens_generated, 1);
});
