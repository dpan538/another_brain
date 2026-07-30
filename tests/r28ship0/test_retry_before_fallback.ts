import test from "node:test";
import assert from "node:assert/strict";
import { Q4MountController } from "../../src/browser_runtime/loading/q4_mount_controller.ts";

test("mount controller does not fallback after the first failed q4 check", async () => {
  const seen = [];
  const controller = new Q4MountController({
    check: async ({ attempt, strategy }) => {
      seen.push(strategy);
      if (attempt < 3) {
        return {
          assets: { manifest_loaded: true, shards_verified: true },
          tokenizer: { exact_runtime_tokenizer: true },
          q4_forward: { status: "fail", q4_forward_ran: false, blocker: "q4_forward_not_confirmed" },
          blockers: ["q4_forward_not_confirmed"]
        };
      }
      return {
        assets: { manifest_loaded: true, shards_verified: true },
        tokenizer: { exact_runtime_tokenizer: true },
        q4_forward: { status: "pass", q4_forward_ran: true, tokens_generated: 1 },
        blockers: []
      };
    }
  });
  const result = await controller.run();
  assert.equal(result.ok, true);
  assert.deepEqual(seen, ["primary", "reuse_http_cache", "cache_bust"]);
  assert.equal(result.retry_plan.status, "q4_ready");
});
