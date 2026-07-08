import test from "node:test";
import assert from "node:assert/strict";
import { buildGenerationResult, generationAlwaysResolves } from "../../src/browser_runtime/generation/generation_result.ts";

test("generation result schema requires terminal status", () => {
  const result = buildGenerationResult({
    status: "timeout",
    q4_attempted: true,
    generation_started: true,
    tokens_generated: 0,
    fallback_reason: "q4_generation_timeout"
  });
  assert.equal(result.generation_status, "timeout");
  assert.equal(result.q4_attempted, true);
  assert.equal(generationAlwaysResolves(result), true);
});

test("non-terminal pending is rejected", () => {
  assert.equal(generationAlwaysResolves({ generation_status: "pending" }), false);
});

test("runtime watchdog converts started but silent worker into terminal timeout", async () => {
  const previousWorker = globalThis.Worker;
  const previousPerformance = globalThis.performance;

  class SilentStartedWorker {
    postMessage() {
      queueMicrotask(() => {
        this.onmessage?.({ data: { type: "state", stage: "loading_model" } });
      });
    }

    terminate() {
      this.terminated = true;
    }
  }

  Object.defineProperty(globalThis, "Worker", { value: SilentStartedWorker, configurable: true });
  Object.defineProperty(globalThis, "performance", { value: { now: () => Date.now() }, configurable: true });

  try {
    const { BrowserChatRuntime } = await import("../../web/another_brain_chat/browser_runtime.js");
    const runtime = new BrowserChatRuntime({ mode: "static_q4_experimental", deliveryConfig: { model_mode: "static_q4_experimental" } });
    runtime.worker = new SilentStartedWorker();

    await assert.rejects(
      () => runtime.draftWithWorker("你如何看待生与死？", { firstTokenTimeoutMs: 1, timeoutMs: 2, q4ReadyAtRequest: true }),
      /q4_generation_timeout/
    );
    const result = buildGenerationResult({ status: runtime.lastRuntimeStats.generation_status, ...runtime.lastRuntimeStats });
    assert.equal(result.generation_status, "timeout");
    assert.equal(result.q4_attempted, true);
    assert.equal(result.generation_started, true);
    assert.equal(result.generation_timeout, true);
    assert.equal(result.fallback_reason, "q4_generation_timeout");
    assert.equal(generationAlwaysResolves(result), true);
  } finally {
    Object.defineProperty(globalThis, "Worker", { value: previousWorker, configurable: true });
    Object.defineProperty(globalThis, "performance", { value: previousPerformance, configurable: true });
  }
});
