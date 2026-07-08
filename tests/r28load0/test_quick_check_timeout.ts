import test from "node:test";
import assert from "node:assert/strict";
import { ModelLoadingController, R28LOAD0_QUICK_CHECK_TIMEOUT_MS } from "../../src/browser_runtime/loading/model_loading_controller.ts";

test("quick check has a hard one second ceiling and reports timeout", async () => {
  assert.equal(R28LOAD0_QUICK_CHECK_TIMEOUT_MS, 1000);
  const controller = new ModelLoadingController({
    quickCheck: async () => new Promise(() => {})
  });

  const report = await controller.run({ quickTimeoutMs: 20 });

  assert.equal(report.loading_state.state, "timeout");
  assert.equal(report.loading_state.blocker, "quick_check_timeout");
  assert.equal(report.loading_state.runtime_mode, "synthetic_fallback");
});
