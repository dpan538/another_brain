import test from "node:test";
import assert from "node:assert/strict";
import { ModelLoadingController } from "../../src/browser_runtime/loading/model_loading_controller.ts";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("user can cancel q4 warmup and recover to a cancel state with fallback mode", async () => {
  const controller = new ModelLoadingController({
    quickCheck: async () => ({ manifest: true, shards: true, tokenizer: true }),
    deepCheck: async () => new Promise(() => {})
  });
  const promise = controller.run({ runDeep: true, deepTimeoutMs: 2000 });
  while (controller.state.state !== "warming_q4") await delay(1);

  assert.equal(controller.cancel("user_cancelled"), true);
  const report = await promise;

  assert.equal(report.loading_state.state, "cancelled");
  assert.equal(report.loading_state.runtime_mode, "synthetic_fallback");
  assert.equal(report.loading_state.blocker, "model_loading_cancelled");
});
