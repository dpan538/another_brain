#!/usr/bin/env node
import { resolve } from "node:path";

import {
  APPROVAL_MARKER_PATH,
  exists,
  gitLsFiles
} from "./static_llm_artifact_utils.mjs";
import {
  ROOT,
  discoverStaticLlmManifestPaths,
  readStaticLlmManifest,
  validateStaticLlmManifestFile
} from "./static_llm_manifest_utils.mjs";
import {
  isModelWeightPath,
  manifestAssetPathToRepoCandidates,
  normalizeRepoPath,
  pathInApprovedStaticLlmAssetDir,
  pathInApprovedStaticLlmFixtureDir
} from "./static_llm_policy.mjs";

async function main() {
  const failures = [];
  const trackedFiles = await gitLsFiles(["ls-files", "--cached"]);
  const trackedModelLikeFiles = trackedFiles.filter(isModelWeightPath);
  const approvalMarkerPresent = await exists(resolve(ROOT, APPROVAL_MARKER_PATH));

  const admittedAssetPaths = new Set();
  for (const manifestPath of await discoverStaticLlmManifestPaths(ROOT)) {
    const validation = await validateStaticLlmManifestFile(manifestPath, { root: ROOT, admit: true });
    if (!validation.ok || !validation.admitted) continue;
    const manifest = await readStaticLlmManifest(manifestPath);
    for (const file of manifest.files || []) {
      for (const candidate of manifestAssetPathToRepoCandidates(file.path)) {
        admittedAssetPaths.add(normalizeRepoPath(candidate));
      }
    }
  }

  for (const path of trackedModelLikeFiles) {
    if (pathInApprovedStaticLlmFixtureDir(path)) continue;
    if (!pathInApprovedStaticLlmAssetDir(path)) {
      failures.push({ code: "tracked_model_weight_outside_approved_static_llm_assets", path });
      continue;
    }
    if (!admittedAssetPaths.has(path)) failures.push({ code: "tracked_model_weight_not_backed_by_admitted_manifest", path });
    if (!approvalMarkerPresent) failures.push({ code: "tracked_model_weight_missing_explicit_approval_marker", path, approval_marker: APPROVAL_MARKER_PATH });
  }

  const report = {
    ok: failures.length === 0,
    tracked_model_like_files: trackedModelLikeFiles,
    approval_marker_present: approvalMarkerPresent,
    admitted_asset_count: admittedAssetPaths.size,
    fixture_files_allowed: true,
    failures
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
