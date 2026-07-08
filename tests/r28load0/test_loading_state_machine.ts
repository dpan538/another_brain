import test from "node:test";
import assert from "node:assert/strict";
import { ModelLoadingController } from "../../src/browser_runtime/loading/model_loading_controller.ts";

test("loading controller emits quick metadata states then q4 ready", async () => {
  const states = [];
  const controller = new ModelLoadingController({
    quickCheck: async () => ({ manifest: true, shards: true, tokenizer: true }),
    deepCheck: async () => ({ q4_forward_ran: true, tokens_generated: 1 }),
    onReport: (report) => states.push(report.loading_state.state)
  });

  const report = await controller.run({ runDeep: true, quickTimeoutMs: 100, deepTimeoutMs: 100 });

  assert.deepEqual(states.slice(0, 4), [
    "checking_manifest",
    "checking_shards",
    "checking_tokenizer",
    "warming_q4"
  ]);
  assert.equal(report.loading_state.state, "q4_ready");
  assert.equal(report.loading_state.runtime_mode, "static_q4_experimental");
  assert.equal(report.loading_state.q4_forward_ran, true);
});
