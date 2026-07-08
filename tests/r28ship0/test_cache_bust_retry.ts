import test from "node:test";
import assert from "node:assert/strict";
import { Q4MountController } from "../../src/browser_runtime/loading/q4_mount_controller.ts";

test("cache-bust strategy is passed to the q4 check before fallback", async () => {
  const options = [];
  const controller = new Q4MountController({
    check: async (input) => {
      options.push(input);
      return {
        assets: { manifest_loaded: true, shards_verified: true },
        tokenizer: { exact_runtime_tokenizer: true },
        q4_forward: { status: input.cacheBust ? "pass" : "fail", q4_forward_ran: input.cacheBust === true, tokens_generated: input.cacheBust ? 1 : 0, blocker: input.cacheBust ? "" : "forward_timeout" },
        blockers: input.cacheBust ? [] : ["forward_timeout"]
      };
    }
  });
  const result = await controller.run();
  assert.equal(result.ok, true);
  assert.equal(options[2].strategy, "cache_bust");
  assert.equal(options[2].cacheBust, true);
});
