#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { ROOT } from "./static_llm_manifest_utils.mjs";
import { STATIC_LLM_POLICY } from "./static_llm_policy.mjs";

const SCENARIOS_PATH = "static_llm/capacity_profiles/scenarios.json";
const OUT_DIR = "static_llm/manifests/dryrun";

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

function exampleHash(index) {
  return `example_dry_run_only_do_not_admit_${String(index).padStart(3, "0")}`;
}

function runtimeBackend(format) {
  if (format === "wasm_runtime_candidate") return "wasm";
  if (format === "webnn_candidate") return "webnn_candidate";
  return "webgpu";
}

function profileForScenario(totalBytes) {
  if (totalBytes <= STATIC_LLM_POLICY.profiles.hobby_static_llm_lite.maxTotalBytes) return "hobby_static_llm_lite";
  return "pro_static_llm_full";
}

function weightFilesForScenario(scenario, startIndex) {
  const files = [];
  let remaining = scenario.weight_bytes;
  let shard = 0;
  while (remaining > 0) {
    const bytes = Math.min(remaining, STATIC_LLM_POLICY.targetShardFileBytes);
    files.push({
      path: `static_llm/assets/dryrun/${scenario.scenario_id}/model-${String(shard).padStart(3, "0")}.dryrun`,
      bytes,
      sha256: exampleHash(startIndex + shard),
      role: "weights",
      required: true
    });
    remaining -= bytes;
    shard += 1;
  }
  return files;
}

function manifestForScenario(scenario) {
  const files = [
    {
      path: `static_llm/assets/dryrun/${scenario.scenario_id}/config.json`,
      bytes: scenario.config_bytes,
      sha256: exampleHash(0),
      role: "config",
      required: true
    },
    {
      path: `static_llm/assets/dryrun/${scenario.scenario_id}/tokenizer.json`,
      bytes: scenario.tokenizer_bytes,
      sha256: exampleHash(1),
      role: "tokenizer",
      required: true
    },
    ...weightFilesForScenario(scenario, 2)
  ];
  return {
    schema_version: 1,
    model_id: scenario.scenario_id,
    model_family: "r25h_model_agnostic_capacity_envelope",
    architecture: scenario.architecture,
    parameter_count: 1,
    quantization: scenario.estimated_quantization,
    context_length: scenario.estimated_context_length,
    tokenizer: "dry_run_tokenizer_plan_only",
    runtime_backend: runtimeBackend(scenario.expected_backend_format),
    license: "PROJECT_AUTHORED_DRY_RUN",
    license_url: "",
    source_url: "project-authored-capacity-scenario",
    converted_by: "not_converted_dry_run",
    conversion_tool: "scripts/generate_static_llm_dryrun_manifests.mjs",
    provenance: "R25H metadata-only capacity envelope. No real model, no weights, and not admitted.",
    review_status: "dry_run",
    admission_status: "dry_run_not_admitted",
    contains_private_data: false,
    total_bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    profile: profileForScenario(scenario.total_bytes),
    scenario_id: scenario.scenario_id,
    synthetic_asset_plan: true,
    placeholder_hash_policy: "dry_run_only_do_not_admit",
    files,
    shard_policy: {
      max_file_bytes: STATIC_LLM_POLICY.maxShardFileBytes,
      target_file_bytes: STATIC_LLM_POLICY.targetShardFileBytes,
      shard_count: files.length
    },
    same_origin_only: true,
    external_urls_allowed: false,
    backend_required: false
  };
}

async function main() {
  const scenariosDoc = await readJson(SCENARIOS_PATH);
  const scenarios = scenariosDoc.scenarios || [];
  await mkdir(resolve(ROOT, OUT_DIR), { recursive: true });
  const written = [];
  for (const scenario of scenarios) {
    const manifest = manifestForScenario(scenario);
    const out = `${OUT_DIR}/${scenario.scenario_id}.dryrun.json`;
    await writeFile(resolve(ROOT, out), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    written.push(out);
  }
  const report = {
    ok: true,
    dry_run_only: true,
    admitted: false,
    wrote: written,
    scenario_count: scenarios.length,
    notes: [
      "Dry-run manifests contain synthetic asset plans only.",
      "No asset files or model weights were created.",
      "Production admission must reject dry_run_not_admitted manifests."
    ]
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
