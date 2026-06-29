#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { ROOT } from "./static_llm_manifest_utils.mjs";
import { STATIC_LLM_POLICY, normalizeRepoPath } from "./static_llm_policy.mjs";

const SCENARIOS_PATH = "static_llm/capacity_profiles/scenarios.json";

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(dir, predicate = () => true) {
  if (!(await exists(dir))) return [];
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkFiles(path, predicate)));
    else if (predicate(path)) out.push(path);
  }
  return out;
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

async function currentDeployableFiles() {
  const webFiles = await walkFiles(resolve(ROOT, "web"));
  const staticLlmFiles = await walkFiles(resolve(ROOT, "static_llm"), (path) => {
    const rel = normalizeRepoPath(relative(ROOT, path));
    if (/^static_llm\/(inbox|models_staging|assets)\//.test(rel)) return false;
    return true;
  });
  return [...webFiles, ...staticLlmFiles];
}

async function summarizeFiles(files) {
  let bytes = 0;
  for (const file of files) bytes += (await stat(file)).size;
  return { bytes, count: files.length };
}

function fit(totalBytes, profileId) {
  const maxBytes = STATIC_LLM_POLICY.profiles[profileId].maxTotalBytes;
  return {
    fits: totalBytes <= maxBytes,
    max_bytes: maxBytes,
    headroom_bytes: maxBytes - totalBytes
  };
}

async function main() {
  const failures = [];
  const warnings = [];
  const scenarios = (await readJson(SCENARIOS_PATH)).scenarios || [];
  const baseFiles = await currentDeployableFiles();
  const base = await summarizeFiles(baseFiles);
  if (base.count >= STATIC_LLM_POLICY.sourceFileCountTarget) {
    failures.push({ code: "base_file_count_exceeds_policy", file_count: base.count });
  }
  const scenarioResults = scenarios.map((scenario) => {
    const simulatedFileCount = base.count + Math.ceil(scenario.weight_bytes / STATIC_LLM_POLICY.targetShardFileBytes) + 2;
    const simulatedBytes = base.bytes + scenario.total_bytes;
    const profileFit = {
      hobby_static_llm_lite: fit(scenario.total_bytes, "hobby_static_llm_lite"),
      pro_static_llm_full: fit(scenario.total_bytes, "pro_static_llm_full")
    };
    const deployProfileFit = {
      hobby_static_llm_lite: fit(simulatedBytes, "hobby_static_llm_lite"),
      pro_static_llm_full: fit(simulatedBytes, "pro_static_llm_full")
    };
    const risks = [];
    if (!profileFit.hobby_static_llm_lite.fits) risks.push("hobby_llm_asset_budget_rejects");
    if (!profileFit.pro_static_llm_full.fits) risks.push("pro_llm_asset_budget_rejects");
    if (simulatedFileCount > STATIC_LLM_POLICY.sourceFileCountTarget * 0.8) risks.push("source_file_count_near_policy_cap");
    return {
      scenario_id: scenario.scenario_id,
      base_deployable_bytes: base.bytes,
      added_llm_scenario_bytes: scenario.total_bytes,
      total_simulated_deployable_bytes: simulatedBytes,
      file_count: simulatedFileCount,
      llm_profile_fit: profileFit,
      simulated_payload_fit: deployProfileFit,
      top_risks: risks
    };
  });

  const byId = Object.fromEntries(scenarioResults.map((result) => [result.scenario_id, result]));
  if (byId.small_decoder_100mb?.llm_profile_fit.hobby_static_llm_lite.fits) failures.push({ code: "small_100mb_incorrectly_passed_hobby" });
  if (!byId.small_decoder_100mb?.llm_profile_fit.pro_static_llm_full.fits) failures.push({ code: "small_100mb_incorrectly_failed_pro" });
  if (!byId.upper_pro_decoder_900mb?.llm_profile_fit.pro_static_llm_full.fits) failures.push({ code: "upper_900mb_incorrectly_failed_pro_llm_budget" });
  if (byId.over_budget_decoder_1100mb?.llm_profile_fit.pro_static_llm_full.fits) failures.push({ code: "over_1100mb_incorrectly_passed_pro" });

  const report = {
    ok: failures.length === 0,
    base_deployable_bytes: base.bytes,
    base_deployable_file_count: base.count,
    source_file_count_target: STATIC_LLM_POLICY.sourceFileCountTarget,
    scenario_results: scenarioResults,
    warnings,
    failures,
    notes: [
      "Simulation is metadata-only and does not create large files.",
      "Profile fit is evaluated for LLM assets and simulated deployable payload separately.",
      "Dry-run manifests remain non-production."
    ]
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
