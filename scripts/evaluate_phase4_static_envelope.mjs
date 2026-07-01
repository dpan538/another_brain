#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const ENVELOPE_PATH = "training/from_scratch/phase4_scaled_architecture_envelope.r25aa.json";
const PROFILES_PATH = "static_llm/capacity_profiles/profiles.json";
const OUTPUT_PATH = "artifacts/training_os/phase4_readiness/r25aa_static_envelope_report.json";

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

async function writeJson(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function shardEstimate(bytes, targetBytes, hardMaxBytes) {
  const targetShards = Math.max(1, Math.ceil(bytes / targetBytes));
  const hardShards = Math.max(1, Math.ceil(bytes / hardMaxBytes));
  return {
    target_shard_bytes: targetBytes,
    hard_max_shard_bytes: hardMaxBytes,
    estimated_shards_at_target: targetShards,
    minimum_shards_at_hard_max: hardShards,
    largest_shard_estimate: Math.min(bytes, targetBytes)
  };
}

function profileFit(q4Bytes, profile) {
  return q4Bytes <= Number(profile.max_total_llm_asset_bytes || 0);
}

async function main() {
  const envelope = await readJson(ENVELOPE_PATH);
  const profilesDoc = await readJson(PROFILES_PATH);
  const profiles = profilesDoc.profiles || {};
  const shared = profilesDoc.shared_constraints || {};
  const targetShardBytes = Number(shared.target_shard_bytes || 32000000);
  const hardMaxShardBytes = Number(shared.hard_max_shard_bytes || 64000000);
  const failures = [];

  if (envelope.phase4_scaled_training_approved !== false) failures.push("envelope_must_not_approve_phase4");
  if (envelope.architecture_selected !== false) failures.push("envelope_must_not_select_architecture");

  const candidates = (envelope.candidate_envelopes || []).map((candidate) => {
    const q4Max = Number(candidate.expected_q4_bytes?.[1] || 0);
    const fits = Object.fromEntries(Object.entries(profiles).map(([name, profile]) => [
      name,
      {
        fits_q4_max: profileFit(q4Max, profile),
        max_total_llm_asset_bytes: profile.max_total_llm_asset_bytes,
        utilization_q4_max: Number(profile.max_total_llm_asset_bytes || 0)
          ? q4Max / Number(profile.max_total_llm_asset_bytes)
          : null
      }
    ]));
    if (candidate.product_model !== false) failures.push(`${candidate.architecture_id}_product_model_must_be_false`);
    if (candidate.phase4_scaled_training_approved !== false) failures.push(`${candidate.architecture_id}_phase4_must_not_be_approved`);
    if (candidate.training_allowed_by_default !== false) failures.push(`${candidate.architecture_id}_training_must_not_be_default`);
    if (candidate.requires_fresh_approval !== true) failures.push(`${candidate.architecture_id}_fresh_approval_required`);
    return {
      architecture_id: candidate.architecture_id,
      product_model: candidate.product_model,
      phase4_scaled_training_approved: candidate.phase4_scaled_training_approved,
      training_allowed_by_default: candidate.training_allowed_by_default,
      requires_fresh_approval: candidate.requires_fresh_approval,
      expected_parameter_range: candidate.expected_parameter_range,
      expected_q4_bytes: candidate.expected_q4_bytes,
      shard_estimate_q4_max: shardEstimate(q4Max, targetShardBytes, hardMaxShardBytes),
      profile_fit: fits,
      memory_risk: candidate.memory_risk,
      browser_release_risk: candidate.browser_release_risk,
      blocking_requirements_before_run: candidate.blocking_requirements_before_run || []
    };
  });

  const report = {
    ok: failures.length === 0,
    phase4_training_will_run: false,
    phase4_approved: false,
    profiles: profilesDoc,
    candidate_envelopes: candidates,
    recommendation: "capacity_review_only",
    failures,
    notes: [
      "R25AA evaluates static capacity envelopes only.",
      "No phase_4 architecture is selected, no training command is added, and no browser performance is claimed.",
      "Every future phase_4 design still requires fresh reviewer approval and separate release admission review."
    ]
  };
  await writeJson(OUTPUT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
