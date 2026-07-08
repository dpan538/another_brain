import test from "node:test";
import assert from "node:assert/strict";
import { classifyOpenQuestionRoute } from "../../src/browser_runtime/router/open_question_route.ts";

const CASES = [
  ["你如何看待生与死？", "abstract_value_question"],
  ["人为什么要活着？", "philosophical_question"],
  ["什么是美？", "aesthetic_question"],
  ["关系里最重要的是什么？", "value_or_relation_question"],
  ["语言有什么意义？", "abstract_meaning_question"]
];

test("browser runtime and TS open-question route categories stay in parity", async () => {
  const previousWorker = globalThis.Worker;
  Object.defineProperty(globalThis, "Worker", { value: undefined, configurable: true });
  const { BrowserChatRuntime } = await import("../../web/another_brain_chat/browser_runtime.js");
  try {
    const runtime = new BrowserChatRuntime({
      mode: "static_q4_experimental",
      deliveryConfig: { model_mode: "static_q4_experimental", delivery_mode: "demo_static", rag_mode: "static_profile_pack" }
    });
    runtime.memoryRecords = [];

    for (const [input, expected] of CASES) {
      const moduleRoute = classifyOpenQuestionRoute(input);
      const packet = await runtime.run(input);
      assert.equal(moduleRoute.category, expected, input);
      assert.equal(packet.route, expected, input);
      assert.equal(packet.process_trace.router.route, expected, input);
      assert.equal(packet.process_trace.generation.q4_attempted, false, input);
      assert.equal(packet.process_trace.generation.fallback_reason, "worker_unavailable", input);
      assert.ok(packet.final_answer.length > 10, input);
    }
  } finally {
    Object.defineProperty(globalThis, "Worker", { value: previousWorker, configurable: true });
  }
});
