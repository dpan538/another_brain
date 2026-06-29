#!/usr/bin/env node
import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { promisify } from "node:util";

import {
  ROOT,
  discoverStaticLlmManifestPaths,
  readStaticLlmManifest,
  validateStaticLlmManifestFile
} from "./static_llm_manifest_utils.mjs";
import {
  STATIC_LLM_POLICY,
  isModelWeightPath,
  manifestAssetPathToRepoCandidates,
  normalizeRepoPath,
  pathInApprovedStaticLlmAssetDir,
  profileBudgetBytes
} from "./static_llm_policy.mjs";

const execFileAsync = promisify(execFile);

async function exists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function gitLsFiles(args) {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: ROOT, maxBuffer: 20 * 1024 * 1024 });
    return stdout.split(/\r?\n/).map(normalizeRepoPath).filter(Boolean);
  } catch {
    return [];
  }
}

async function main() {
  const manifestPaths = await discoverStaticLlmManifestPaths(ROOT);
  const validations = [];
  const manifests = [];
  for (const path of manifestPaths) {
    const validation = await validateStaticLlmManifestFile(path, { root: ROOT });
    validations.push(validation);
    manifests.push({ path, manifest: await readStaticLlmManifest(path), validation });
  }

  const failures = validations.flatMap((result) =>
    result.failures.map((failure) => ({ file: result.file, ...failure }))
  );
  const admitted = manifests.filter((item) => item.validation.admitted && item.validation.ok);
  const dryRuns = manifests.filter((item) => item.validation.dry_run);
  const admittedAssetPaths = new Set();
  const profileTotals = {};
  const profileFileCounts = {};

  for (const item of admitted) {
    const profile = item.manifest.profile;
    profileTotals[profile] = (profileTotals[profile] || 0) + item.validation.total_bytes;
    profileFileCounts[profile] = (profileFileCounts[profile] || 0) + item.manifest.files.length;
    for (const file of item.manifest.files) {
      for (const candidate of manifestAssetPathToRepoCandidates(file.path)) {
        admittedAssetPaths.add(normalizeRepoPath(candidate));
      }
    }
  }

  for (const [profile, bytes] of Object.entries(profileTotals)) {
    const maxBytes = profileBudgetBytes(profile);
    if (bytes > maxBytes) failures.push({ code: "admitted_static_llm_profile_budget_exceeded", profile, bytes, max_bytes: maxBytes });
  }

  const visibleFiles = await gitLsFiles(["ls-files", "--cached", "--others", "--exclude-standard"]);
  const trackedFiles = await gitLsFiles(["ls-files", "--cached"]);
  const modelWeightFiles = visibleFiles.filter(isModelWeightPath);
  for (const path of modelWeightFiles) {
    if (!pathInApprovedStaticLlmAssetDir(path)) {
      failures.push({ code: "model_weight_outside_approved_static_llm_assets", path });
      continue;
    }
    if (!admittedAssetPaths.has(path)) {
      failures.push({ code: "model_weight_not_listed_by_admitted_manifest", path });
    }
  }

  for (const assetPath of admittedAssetPaths) {
    if (!(await exists(assetPath))) continue;
  }

  if (trackedFiles.length >= STATIC_LLM_POLICY.sourceFileCountTarget) {
    failures.push({
      code: "source_file_count_target_exceeded",
      tracked_files: trackedFiles.length,
      target: STATIC_LLM_POLICY.sourceFileCountTarget
    });
  }

  const report = {
    ok: failures.length === 0,
    policy: {
      profiles: STATIC_LLM_POLICY.profiles,
      source_file_count_target: STATIC_LLM_POLICY.sourceFileCountTarget,
      build_time_target_minutes: STATIC_LLM_POLICY.buildTimeTargetMinutes,
      target_shard_file_bytes: STATIC_LLM_POLICY.targetShardFileBytes,
      hard_max_shard_file_bytes: STATIC_LLM_POLICY.maxShardFileBytes,
      approved_asset_prefixes: STATIC_LLM_POLICY.approvedAssetPrefixes
    },
    manifest_count: validations.length,
    admitted_manifest_count: admitted.length,
    dry_run_manifest_count: dryRuns.length,
    profile_totals: profileTotals,
    profile_file_counts: profileFileCounts,
    tracked_source_file_count: trackedFiles.length,
    visible_model_weight_files: modelWeightFiles,
    failures
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
