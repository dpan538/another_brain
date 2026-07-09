import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("public UI submit path sends open question through runtime and renders final answer", () => {
  const html = readFileSync("web/another_brain_chat/index.html", "utf8");
  const app = readFileSync("web/another_brain_chat/app.js", "utf8");

  assert.match(html, /id="chat-form"/);
  assert.match(html, /id="chat-input"/);
  assert.match(html, /id="message-list"/);
  assert.match(html, /id="route-status"/);
  assert.match(html, /id="q4-attempted-status"/);
  assert.match(html, /id="generation-status"/);
  assert.match(app, /on\(form,\s*"submit"/);
  assert.match(app, /runtime\.run\(text,\s*{\s*onStatus:\s*setPipelineStatus\s*}\)/);
  assert.match(app, /appendMessage\("assistant",\s*packet\.final_answer/);
  assert.match(app, /updateStatus\(packet\)/);
});

test("public runtime path returns life/death answer instead of pending", async () => {
  const { BrowserChatRuntime } = await import("../../web/another_brain_chat/browser_runtime.js");
  const runtime = new BrowserChatRuntime({
    mode: "static_q4_experimental",
    deliveryConfig: { model_mode: "static_q4_experimental", delivery_mode: "demo_static", rag_mode: "static_profile_pack" }
  });
  runtime.memoryRecords = [];

  const packet = await runtime.run("你如何看待生与死？");
  assert.equal(packet.answer_status, "fallback");
  assert.equal(packet.route, "abstract_value_question");
  assert.equal(packet.process_trace.generation.generation_status, "fallback");
  assert.equal(packet.process_trace.generation.fallback_reason, "worker_unavailable");
  assert.match(packet.final_answer, /生不是纯粹的开始|有限时间/);
});
