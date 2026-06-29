#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { ROOT } from "./static_llm_manifest_utils.mjs";
import { STATIC_LLM_POLICY } from "./static_llm_policy.mjs";

const SCENARIOS_PATH = "static_llm/capacity_profiles/scenarios.json";

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

function riskForBytes(totalBytes) {
  if (totalBytes <= 95_000_000) return "low";
  if (totalBytes <= 300_000_000) return "medium";
  if (totalBytes <= 600_000_000) return "high";
  return "very_high";
}

function webgpuRequired(totalBytes) {
  return totalBytes > STATIC_LLM_POLICY.profiles.hobby_static_llm_lite.maxTotalBytes;
}

async function main() {
  const scenarios = (await readJson(SCENARIOS_PATH)).scenarios || [];
  const memoryRisk = {};
  const storageRisk = {};
  const webgpuRequiredByScenario = {};
  const mobileSafariRisk = {};
  const scenarioReports = scenarios.map((scenario) => {
    const estimatedRuntimeBytes = Math.ceil(scenario.total_bytes * 1.35);
    const cacheBytes = scenario.total_bytes;
    const memory_risk = riskForBytes(estimatedRuntimeBytes);
    const storage_risk = riskForBytes(cacheBytes);
    const webgpu_required = webgpuRequired(scenario.total_bytes);
    const mobile_risk = scenario.total_bytes <= 95_000_000 ? "possible" : scenario.total_bytes <= 300_000_000 ? "constrained" : "high_or_unsupported";
    memoryRisk[scenario.scenario_id] = memory_risk;
    storageRisk[scenario.scenario_id] = storage_risk;
    webgpuRequiredByScenario[scenario.scenario_id] = webgpu_required;
    mobileSafariRisk[scenario.scenario_id] = mobile_risk;
    return {
      scenario_id: scenario.scenario_id,
      total_bytes: scenario.total_bytes,
      estimated_runtime_bytes: estimatedRuntimeBytes,
      browser_cache_bytes: cacheBytes,
      memory_risk,
      storage_risk,
      webgpu_required,
      wasm_fallback_status: scenario.total_bytes > 100_000_000 ? "degraded_or_unsupported_for_large_decoder" : "fixture_or_small_only",
      mobile_safari_risk: mobile_risk,
      real_performance_claimed: false
    };
  });
  const report = {
    ok: true,
    scenarios: scenarioReports,
    memory_risk_by_scenario: memoryRisk,
    storage_risk_by_scenario: storageRisk,
    webgpu_required_by_scenario: webgpuRequiredByScenario,
    mobile_safari_risk: mobileSafariRisk,
    notes: [
      "R25H memory envelope uses conservative static estimates only.",
      "No browser benchmark or real first-token performance is claimed.",
      "Larger decoder envelopes should be treated as WebGPU-required unless a reviewed backend proves otherwise.",
      "WASM fallback is degraded or possibly unsupported for large decoders."
    ]
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
