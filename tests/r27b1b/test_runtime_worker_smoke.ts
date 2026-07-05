import test from "node:test";
import assert from "node:assert/strict";
import { handleRuntimeWorkerMessage } from "../../src/browser_runtime/runtime_worker.ts";

test("worker handler streams tokens and final draft", async () => {
  const events = [];
  const result = await handleRuntimeWorkerMessage(
    { type: "generate", prompt: "hello", maxTokens: 4 },
    { postMessage: (event) => events.push(event) }
  );
  assert.equal(result.type, "final");
  assert.ok(result.draft.includes("Static"));
  assert.ok(events.some((event) => event.type === "token"));
});
