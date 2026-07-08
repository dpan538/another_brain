import test from "node:test";
import assert from "node:assert/strict";

test("open question with q4 ready sends worker generate and records tokens", async () => {
  const previousWorker = globalThis.Worker;
  const previousNavigator = globalThis.navigator;
  const previousPerformance = globalThis.performance;
  let postedGenerate = null;

  class FakeWorker {
    postMessage(message) {
      postedGenerate = message;
      queueMicrotask(() => {
        this.onmessage?.({ data: { type: "state", stage: "q4_forward_started" } });
        this.onmessage?.({ data: { type: "token", token: "我" } });
        this.onmessage?.({
          data: {
            type: "final",
            draft: "我会把它看成边界问题，但不把它说成漂亮废话。",
            tokens: ["我", "会", "看"],
            stats: {
              tokens_generated: 3,
              runtime_mode: "static_q4_experimental",
              decode_status: "exact_runtime_tokenizer",
              fallback_used: false
            }
          }
        });
      });
    }

    terminate() {
      this.terminated = true;
    }
  }

  Object.defineProperty(globalThis, "Worker", { value: FakeWorker, configurable: true });
  Object.defineProperty(globalThis, "navigator", { value: { userAgent: "Chrome Desktop", onLine: true }, configurable: true });
  Object.defineProperty(globalThis, "performance", { value: { now: () => Date.now() }, configurable: true });

  try {
    const { BrowserChatRuntime } = await import("../../web/another_brain_chat/browser_runtime.js");
    const runtime = new BrowserChatRuntime({
      mode: "static_q4_experimental",
      deliveryConfig: { model_mode: "static_q4_experimental", delivery_mode: "demo_static", rag_mode: "static_profile_pack" }
    });
    runtime.worker = new FakeWorker();
    runtime.q4MountReport = { ok: true, report: { ok: true } };
    runtime.assetStatus = { verification: "q4_manifest_shards_tokenizer_forward_verified" };
    runtime.memoryRecords = [
      {
        title: "approved local abstract anchor",
        text: "生与死 活着 意义 判断 关系 作品 有限 时间",
        trust_level: "high",
        can_answer: true,
        keywords: ["生", "死", "意义", "判断"]
      }
    ];

    const packet = await runtime.run("你如何看待生与死？");
    assert.equal(postedGenerate?.type, "generate");
    assert.equal(packet.process_trace.generation.q4_attempted, true);
    assert.equal(packet.process_trace.generation.generation_started, true);
    assert.equal(packet.process_trace.generation.generation_status, "completed");
    assert.equal(packet.process_trace.generation.tokens_generated, 3);
    assert.equal(packet.answer_source_label, "static_q4_experimental");
  } finally {
    Object.defineProperty(globalThis, "Worker", { value: previousWorker, configurable: true });
    Object.defineProperty(globalThis, "navigator", { value: previousNavigator, configurable: true });
    Object.defineProperty(globalThis, "performance", { value: previousPerformance, configurable: true });
  }
});
