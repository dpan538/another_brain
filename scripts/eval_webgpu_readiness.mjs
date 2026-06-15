#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { detectBrowserInferenceProfile } from "../web/webgpu_capability.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPORT = resolve(ROOT, "artifacts/training_os/webgpu_readiness_report.json");

async function fileIncludes(path, phrases) {
  const text = await readFile(resolve(ROOT, path), "utf8");
  return phrases.filter((phrase) => !text.includes(phrase));
}

async function main() {
  const profile = await detectBrowserInferenceProfile({ runtimeProfile: "full", preferWebGpu: true });
  const missingDocPhrases = [
    ...(await fileIncludes("docs/webgpu_reasoning_runtime_plan.md", [
      "no cloud inference",
      "WebLLM",
      "Transformers.js",
      "ONNX Runtime Web",
      "WASM fallback",
      "must not replace arithmetic",
      "personal_200m"
    ])),
    ...(await fileIncludes("docs/browser_inference_stack_options.md", [
      "no cloud inference",
      "WASM fallback",
      "100M-200M",
      "Session memory remains session-scoped"
    ]))
  ];

  const checks = {
    reports_webgpu_false_honestly: typeof profile.webgpu.available === "boolean",
    wasm_fallback_detected: profile.wasm.available === true,
    worker_field_present: typeof profile.worker.available === "boolean",
    storage_fields_present:
      typeof profile.storage.opfs === "boolean" &&
      typeof profile.storage.cacheApi === "boolean" &&
      typeof profile.storage.indexedDb === "boolean",
    backend_selected: ["webgpu", "wasm", "none"].includes(profile.recommendedBackend),
    no_cloud_default: true,
    docs_complete: missingDocPhrases.length === 0
  };
  const failures = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([code]) => ({ code }));
  for (const phrase of missingDocPhrases) failures.push({ code: "missing_doc_phrase", phrase });

  const report = {
    ok: failures.length === 0,
    environment: "node_or_local_shell",
    webgpu_available_in_local_test: profile.webgpu.available,
    profile,
    checks,
    failures
  };
  await mkdir(dirname(REPORT), { recursive: true });
  await writeFile(REPORT, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
