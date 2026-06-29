#!/usr/bin/env node
import { execFile } from "node:child_process";
import { access, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { relative, resolve } from "node:path";
import { promisify } from "node:util";

import {
  ROOT,
  discoverStaticLlmManifestPaths,
  readStaticLlmManifest,
  validateStaticLlmManifestFile
} from "./static_llm_manifest_utils.mjs";
import {
  STATIC_LLM_POLICY,
  isExternalUrl,
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
  const { stdout } = await execFileAsync("git", args, { cwd: ROOT, maxBuffer: 20 * 1024 * 1024 });
  return stdout.split(/\r?\n/).map(normalizeRepoPath).filter(Boolean);
}

async function main() {
  const failures = [];
  const warnings = [];
  const manifestReports = [];
  const admittedAssetPaths = new Set();
  const seenAssetPaths = new Map();
  const profileTotals = {};
  let admittedManifestCount = 0;
  let dryRunManifestCount = 0;

  for (const manifestPath of await discoverStaticLlmManifestPaths(ROOT)) {
    const relManifest = normalizeRepoPath(relative(ROOT, manifestPath));
    const manifest = await readStaticLlmManifest(manifestPath);
    const validation = await validateStaticLlmManifestFile(manifestPath, { root: ROOT });
    const admittedValidation = await validateStaticLlmManifestFile(manifestPath, { root: ROOT, admit: true });
    const isProduction = admittedValidation.ok && admittedValidation.admitted;
    if (isProduction) admittedManifestCount += 1;
    if (validation.dry_run) dryRunManifestCount += 1;
    if (validation.fixture && manifest.admission_status === "admitted") {
      failures.push({ code: "fixture_manifest_treated_as_production", manifest: relManifest });
    }
    if (validation.dry_run && manifest.admission_status !== "dry_run_not_admitted") {
      failures.push({ code: "dry_run_manifest_must_not_be_production", manifest: relManifest });
    }
    if (validation.dry_run && /[A-Za-z][A-Za-z0-9.-]{1,80}\/[A-Za-z0-9][A-Za-z0-9._-]{1,100}/.test(String(manifest.model_id || ""))) {
      failures.push({ code: "dry_run_manifest_must_not_use_named_model_id", manifest: relManifest, model_id: manifest.model_id });
    }
    for (const failure of validation.failures) failures.push({ code: "manifest_validation_failure", manifest: relManifest, failure });
    for (const file of manifest.files || []) {
      if (isExternalUrl(file.path)) failures.push({ code: "external_asset_url", manifest: relManifest, path: file.path });
      if (!file.sha256) {
        failures.push({ code: "missing_or_non_real_asset_hash", manifest: relManifest, path: file.path });
      } else if ((isProduction || validation.fixture) && !/^[a-f0-9]{64}$/i.test(String(file.sha256))) {
        failures.push({ code: "fixture_or_production_asset_hash_must_be_real", manifest: relManifest, path: file.path });
      }
      if (Number(file.bytes || 0) > STATIC_LLM_POLICY.maxShardFileBytes) {
        failures.push({ code: "asset_exceeds_hard_shard_max", manifest: relManifest, path: file.path, bytes: file.bytes });
      }
      if (isProduction) {
        profileTotals[manifest.profile] = (profileTotals[manifest.profile] || 0) + Number(file.bytes || 0);
        for (const candidate of manifestAssetPathToRepoCandidates(file.path)) {
          admittedAssetPaths.add(normalizeRepoPath(candidate));
        }
      }
      const seenKey = normalizeRepoPath(file.path);
      if (Number(file.bytes || 0) > 1_000_000 && seenAssetPaths.has(seenKey)) {
        failures.push({ code: "duplicate_large_manifest_asset_path", path: seenKey, manifests: [seenAssetPaths.get(seenKey), relManifest] });
      }
      if (Number(file.bytes || 0) > 1_000_000) seenAssetPaths.set(seenKey, relManifest);
    }
    manifestReports.push({
      manifest: relManifest,
      model_id: manifest.model_id || "",
      review_status: manifest.review_status || "",
      admission_status: manifest.admission_status || "",
      profile: manifest.profile || "",
      validation_ok: validation.ok,
      production_admitted: isProduction,
      total_bytes: validation.total_bytes
    });
  }

  for (const [profile, totalBytes] of Object.entries(profileTotals)) {
    const maxBytes = profileBudgetBytes(profile);
    if (totalBytes > maxBytes) failures.push({ code: "profile_budget_exceeded", profile, total_bytes: totalBytes, max_bytes: maxBytes });
  }

  const trackedFiles = await gitLsFiles(["ls-files", "--cached"]);
  const visibleFiles = await gitLsFiles(["ls-files", "--cached", "--others", "--exclude-standard"]);
  if (trackedFiles.length >= STATIC_LLM_POLICY.sourceFileCountTarget) {
    failures.push({ code: "source_file_count_target_exceeded", tracked_files: trackedFiles.length, target: STATIC_LLM_POLICY.sourceFileCountTarget });
  }

  const modelLikeFiles = visibleFiles.filter(isModelWeightPath);
  for (const path of modelLikeFiles) {
    if (!pathInApprovedStaticLlmAssetDir(path)) {
      failures.push({ code: "model_like_file_outside_approved_asset_path", path });
      continue;
    }
    if (!admittedAssetPaths.has(path)) failures.push({ code: "model_like_file_not_backed_by_admitted_manifest", path });
  }

  for (const assetPath of admittedAssetPaths) {
    const abs = resolve(ROOT, assetPath);
    if (!(await exists(abs))) {
      warnings.push({ code: "admitted_asset_path_not_present_in_worktree_candidate", path: assetPath });
      continue;
    }
    const info = await stat(abs);
    if (info.size > STATIC_LLM_POLICY.maxShardFileBytes) failures.push({ code: "admitted_asset_file_exceeds_hard_max", path: assetPath, bytes: info.size });
  }

  const report = {
    ok: failures.length === 0,
    admitted_manifest_count: admittedManifestCount,
    dry_run_manifest_count: dryRunManifestCount,
    manifest_count: manifestReports.length,
    manifest_reports: manifestReports,
    profile_totals: profileTotals,
    tracked_source_file_count: trackedFiles.length,
    source_file_count_target: STATIC_LLM_POLICY.sourceFileCountTarget,
    visible_model_like_files: modelLikeFiles,
    approved_asset_prefixes: STATIC_LLM_POLICY.approvedAssetPrefixes,
    max_shard_file_bytes: STATIC_LLM_POLICY.maxShardFileBytes,
    failures,
    warnings
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
