import test from "node:test";
import assert from "node:assert/strict";

test("browser public runtime exposes surface trace fields for micro-intent path", async () => {
  const { BrowserChatRuntime } = await import("../../web/another_brain_chat/browser_runtime.js");
  const runtime = new BrowserChatRuntime({
    mode: "static_q4_experimental",
    deliveryConfig: { model_mode: "static_q4_experimental", delivery_mode: "demo_static", rag_mode: "static_profile_pack" }
  });
  runtime.memoryRecords = [];
  const started = Date.now();
  const packet = await runtime.run("你好");
  const elapsed = Date.now() - started;
  assert.equal(packet.answer_route, "greeting_surface");
  assert.equal(packet.route_policy.surface_category, "greeting");
  assert.equal(packet.process_trace.router.surface_category, "greeting");
  assert.equal(packet.process_trace.router.length_policy.category, "greeting");
  assert.equal(packet.process_trace.router.used_model_draft, false);
  assert.ok(elapsed < 100);
});
