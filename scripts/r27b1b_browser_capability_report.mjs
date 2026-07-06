#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);

async function read(rel) {
  return readFile(resolve(root, rel), "utf8");
}

const modelLoader = await read("src/browser_runtime/model_loader.ts");
const workerSource = await read("src/browser_runtime/runtime_worker.ts");
const webWorkerPresent = existsSync(resolve(root, "web/another_brain_chat/runtime_worker.js"));
const budget = spawnSync("python3", ["scripts/r27b0_static_asset_budget.py"], {
  cwd: root,
  encoding: "utf8"
});
const scanned = [
  modelLoader,
  workerSource,
  await read("web/another_brain_chat/browser_runtime.js"),
  await read("web/another_brain_chat/runtime_worker.js")
].join("\n");

const report = {
  webgpu_path_present: modelLoader.includes("onnx_webgpu_experimental"),
  wasm_path_present: modelLoader.includes("wasm_fallback_experimental") && scanned.includes("WebAssembly"),
  worker_path_present: workerSource.includes("handleRuntimeWorkerMessage") && webWorkerPresent,
  same_origin_loader: modelLoader.includes("loadStaticShardManifest") && modelLoader.includes("assertSameOriginPath"),
  external_llm_api: /api\.openai\.com|anthropic\.com|doubao|dashscope|volces/i.test(scanned),
  backend_inference: /FastAPI|Flask|app\.post|pages\/api|vercel\/functions/i.test(scanned),
  static_budget_pass: budget.status === 0
};

console.log(JSON.stringify(report, null, 2));
if (!report.worker_path_present || !report.same_origin_loader || report.external_llm_api || report.backend_inference) {
  process.exit(2);
}
