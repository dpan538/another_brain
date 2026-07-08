import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("final runtime remains static/local with no backend, external LLM, Doubao, or hosted vector store", async () => {
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url), "utf8");
  const loading = await readFile(new URL("../../web/another_brain_chat/loading_screen.js", import.meta.url), "utf8");
  const runtimeMode = await readFile(new URL("../../web/another_brain/runtime_mode.json", import.meta.url), "utf8");
  const staticRetriever = await readFile(new URL("../../web/another_brain_chat/static_retriever.js", import.meta.url), "utf8");

  assert.ok(app.includes("backend_inference: false"));
  assert.ok(app.includes("external_llm_api: false"));
  assert.ok(runtime.includes("doubao: false") || runtimeMode.includes('"doubao": false'));
  assert.ok(runtime.includes("backend_inference: false"));
  assert.ok(runtime.includes("external_llm_api: false"));
  assert.ok(staticRetriever.includes("hosted_vector_store: false"));
  assert.equal(loading.includes("fetch("), false);
  assert.equal(loading.includes("WebSocket"), false);
  assert.equal(loading.includes("EventSource"), false);
  assert.equal(loading.includes("https://"), false);
});
