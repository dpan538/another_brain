#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { ROOT } from "./static_llm_manifest_utils.mjs";
import { STATIC_LLM_POLICY } from "./static_llm_policy.mjs";

const PROFILES_PATH = "static_llm/capacity_profiles/profiles.json";
const SCENARIOS_PATH = "static_llm/capacity_profiles/scenarios.json";

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

function profileResult(profile, scenario, policy) {
  const maxBytes = profile.max_total_llm_asset_bytes;
  const budgetHeadroom = maxBytes - scenario.total_bytes;
  return {
    fits: budgetHeadroom >= 0,
    budget_headroom_bytes: budgetHeadroom,
    budget_used_ratio: Number((scenario.total_bytes / maxBytes).toFixed(4)),
    role: profile.role,
    target_shard_count: Math.ceil(scenario.weight_bytes / policy.target_shard_bytes),
    hard_max_shard_count: Math.ceil(scenario.weight_bytes / policy.hard_max_shard_bytes)
  };
}

function evaluateScenario(scenario, profiles, policy) {
  const targetShardCount = Math.max(1, Math.ceil(scenario.weight_bytes / policy.target_shard_bytes));
  const hardMaxShardCount = Math.max(1, Math.ceil(scenario.weight_bytes / policy.hard_max_shard_bytes));
  const largestShardEstimate = Math.min(policy.target_shard_bytes, scenario.weight_bytes);
  const fileCount = targetShardCount + 2;
  return {
    scenario_id: scenario.scenario_id,
    architecture: scenario.architecture,
    total_bytes: scenario.total_bytes,
    tokenizer_bytes: scenario.tokenizer_bytes,
    config_bytes: scenario.config_bytes,
    weight_bytes: scenario.weight_bytes,
    target_shard_count: targetShardCount,
    hard_max_shard_count: hardMaxShardCount,
    declared_expected_shard_count: scenario.expected_shard_count,
    largest_shard_estimate: largestShardEstimate,
    deployable_file_count_contribution: fileCount,
    source_file_count_risk: fileCount > 1000 ? "high" : fileCount > 100 ? "medium" : "low",
    profile_fit: Object.fromEntries(
      Object.entries(profiles).map(([profileId, profile]) => [profileId, profileResult(profile, scenario, policy)])
    )
  };
}

async function main() {
  const failures = [];
  const notes = [];
  const profilesDoc = await readJson(PROFILES_PATH);
  const scenariosDoc = await readJson(SCENARIOS_PATH);
  const policy = profilesDoc.shared_constraints || {};
  const profiles = profilesDoc.profiles || {};

  if (profilesDoc.primary_profile !== "pro_static_llm_full") failures.push({ code: "primary_profile_must_be_pro_static_llm_full" });
  if (profiles.hobby_static_llm_lite?.max_total_llm_asset_bytes !== STATIC_LLM_POLICY.profiles.hobby_static_llm_lite.maxTotalBytes) {
    failures.push({ code: "hobby_profile_mismatch_with_shared_policy" });
  }
  if (profiles.pro_static_llm_full?.max_total_llm_asset_bytes !== STATIC_LLM_POLICY.profiles.pro_static_llm_full.maxTotalBytes) {
    failures.push({ code: "pro_profile_mismatch_with_shared_policy" });
  }
  if (policy.target_shard_bytes !== STATIC_LLM_POLICY.targetShardFileBytes) failures.push({ code: "target_shard_policy_mismatch" });
  if (policy.hard_max_shard_bytes !== STATIC_LLM_POLICY.maxShardFileBytes) failures.push({ code: "hard_max_shard_policy_mismatch" });
  if (policy.max_source_file_count !== STATIC_LLM_POLICY.sourceFileCountTarget) failures.push({ code: "file_count_policy_mismatch" });
  if (policy.build_time_target_minutes !== STATIC_LLM_POLICY.buildTimeTargetMinutes) failures.push({ code: "build_time_policy_mismatch" });
  for (const flag of ["same_origin_only", "external_urls_allowed", "backend_required", "external_storage_allowed"]) {
    if (flag === "same_origin_only" && policy[flag] !== true) failures.push({ code: "same_origin_policy_must_be_true" });
    if (flag !== "same_origin_only" && policy[flag] !== false) failures.push({ code: `${flag}_must_be_false` });
  }

  const scenarios = scenariosDoc.scenarios || [];
  const scenarioResults = scenarios.map((scenario) => evaluateScenario(scenario, profiles, policy));
  const byId = Object.fromEntries(scenarioResults.map((result) => [result.scenario_id, result]));
  if (byId.small_decoder_100mb?.profile_fit.hobby_static_llm_lite.fits !== false) failures.push({ code: "small_100mb_must_reject_hobby" });
  if (byId.small_decoder_100mb?.profile_fit.pro_static_llm_full.fits !== true) failures.push({ code: "small_100mb_must_fit_pro" });
  if (byId.medium_decoder_300mb?.profile_fit.pro_static_llm_full.fits !== true) failures.push({ code: "medium_300mb_must_fit_pro" });
  if (byId.large_decoder_600mb?.profile_fit.pro_static_llm_full.fits !== true) failures.push({ code: "large_600mb_must_fit_pro" });
  if (byId.upper_pro_decoder_900mb?.profile_fit.pro_static_llm_full.fits !== true) failures.push({ code: "upper_900mb_must_fit_pro" });
  if (byId.over_budget_decoder_1100mb?.profile_fit.pro_static_llm_full.fits !== false) failures.push({ code: "over_1100mb_must_reject_pro" });

  notes.push("R25H capacity evaluation is metadata-only and does not claim real model performance.");
  notes.push("Hobby is a constrained fallback/rejection profile; Pro remains the primary static decoder review profile.");
  notes.push("Dry-run scenarios do not admit production assets and do not create large files.");

  const profileResults = {};
  for (const profileId of Object.keys(profiles)) {
    const fitCount = scenarioResults.filter((scenario) => scenario.profile_fit[profileId]?.fits).length;
    profileResults[profileId] = {
      max_total_llm_asset_bytes: profiles[profileId].max_total_llm_asset_bytes,
      role: profiles[profileId].role,
      scenarios_fit: fitCount,
      scenarios_rejected: scenarioResults.length - fitCount
    };
  }

  const report = {
    ok: failures.length === 0,
    profile_results: profileResults,
    scenario_results: scenarioResults,
    primary_profile: "pro_static_llm_full",
    hobby_role: "constrained_or_reject",
    notes,
    failures
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
