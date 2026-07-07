import test from "node:test";
import assert from "node:assert/strict";
import { runGenerationLoop } from "../../src/browser_runtime/generation_loop.ts";

class RepeatingRuntime {
  constructor() {
    this.mode = "synthetic_repeat_fixture";
    this.loaded = false;
  }

  async load() {
    this.loaded = true;
    return { mode: this.mode, product_model: false };
  }

  async *generate() {
    for (let index = 0; index < 12; index += 1) yield "重复";
  }
}

test("GEN1 repetition guard stops repeated token streams", async () => {
  const result = await runGenerationLoop(new RepeatingRuntime(), "你好", {
    maxTokens: 12,
    repetitionLimit: 3,
    timeoutMs: 1000
  });
  assert.equal(result.finish_reason, "repetition_guard");
  assert.ok(result.guard_failures.includes("repetition_guard"));
  assert.equal(result.fallback_recommended, true);
  assert.ok(result.tokens_generated < 12);
});
