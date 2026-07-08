import test from "node:test";
import assert from "node:assert/strict";
import { ModelLoadingController } from "../../src/browser_runtime/loading/model_loading_controller.ts";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("repeated load requests reuse the active promise and do not start a worker storm", async () => {
  const controller = new ModelLoadingController({
    quickCheck: async () => ({ manifest: true, shards: true, tokenizer: true }),
    deepCheck: async () => {
      await delay(20);
      return { q4_forward_ran: true, tokens_generated: 1 };
    }
  });

  const first = controller.run({ runDeep: true, deepTimeoutMs: 1000 });
  const second = controller.run({ runDeep: true, deepTimeoutMs: 1000 });
  assert.equal(first, second);

  const report = await first;
  assert.equal(controller.workerStarts, 1);
  assert.equal(report.loading_state.state, "q4_ready");
});
