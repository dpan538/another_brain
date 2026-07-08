import test from "node:test";
import assert from "node:assert/strict";
import { Q4WorkerLifecycle } from "../../src/browser_runtime/loading/q4_worker_lifecycle.ts";
import { Q4MountController } from "../../src/browser_runtime/loading/q4_mount_controller.ts";

test("worker lifecycle restarts at most once", () => {
  let terminated = 0;
  const lifecycle = new Q4WorkerLifecycle({
    workerFactory: () => ({ terminate: () => { terminated += 1; } }),
    maxRestarts: 1
  });
  lifecycle.start();
  assert.equal(lifecycle.restartOnce().restarted, true);
  assert.equal(lifecycle.restartOnce().restarted, false);
  assert.equal(lifecycle.snapshot().restarts, 1);
  assert.equal(terminated, 1);
});

test("mount controller only invokes worker restart on the final Plan B strategy", async () => {
  let restarts = 0;
  const controller = new Q4MountController({
    restartWorkerOnce: async () => {
      restarts += 1;
      return { restarted: true };
    },
    check: async () => ({
      assets: { manifest_loaded: true, shards_verified: true },
      tokenizer: { exact_runtime_tokenizer: true },
      q4_forward: { status: "fail", q4_forward_ran: false, blocker: "worker_error" },
      blockers: ["worker_error"]
    })
  });
  const result = await controller.run();
  assert.equal(result.ok, false);
  assert.equal(restarts, 1);
  assert.equal(result.attempts.at(-1).strategy, "worker_restart");
});
