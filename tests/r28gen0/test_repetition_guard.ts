import test from "node:test";
import assert from "node:assert/strict";
import { runGenerationLoop } from "../../src/browser_runtime/generation_loop.ts";

class RepeatingRuntime {
  constructor() {
    this.mode = "synthetic_tiny";
    this.loaded = false;
  }
  async load() {
    this.loaded = true;
  }
  async *generate() {
    while (true) yield "啊";
  }
}

test("repetition guard stops repeated tokens and marks surface fallback", async () => {
  const generation = await runGenerationLoop(new RepeatingRuntime(), "repeat", { maxTokens: 12, repetitionLimit: 2 });
  assert.equal(generation.repetition_guard_triggered, true);
  assert.equal(generation.needs_fallback, true);
  assert.equal(generation.fallback_reason, "repetition_guard_triggered");
  assert.equal(generation.finish_reason, "repetition_guard");
  assert.ok(generation.tokens_generated < 12);
});
