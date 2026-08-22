#!/usr/bin/env node
import { resolve } from "node:path";

import {
  APPROVAL_MARKER_PATH,
  exists,
  gitLsFiles
} from "./static_llm_artifact_utils.mjs";
import { checkStaticLlmAdmissionApproval } from "./check_static_llm_admission_approval.mjs";
import {
  ROOT,
  discoverStaticLlmManifestPaths,
  readStaticLlmManifest,
  validateStaticLlmManifestFile
} from "./static_llm_manifest_utils.mjs";
import {
  isModelWeightPath,
  manifestAssetPathToRepoCandidates,
  normalizeRepoPath
} from "./static_llm_policy.mjs";
import { validateR28M1ExactCompatibility } from "./r28m1_exact_legacy_approval.mjs";
import { classifyTrackedModelWeights } from "./model_weight_gate_policy.mjs";

async function main() {
  const failures = [];
  const trackedFiles = await gitLsFiles(["ls-files", "--cached"]);
  const trackedModelLikeFiles = trackedFiles.filter(isModelWeightPath);
  const r28m1Approval = await validateR28M1ExactCompatibility({ trackedModelLikeFiles });
  const exactLegacyPaths = new Set(
    r28m1Approval.ok
      ? trackedModelLikeFiles.filter((path) => normalizeRepoPath(path).startsWith("web/another_brain/model_assets/r28m1/"))
      : []
  );
  const legacyApprovalMarkerPresent = await exists(resolve(ROOT, APPROVAL_MARKER_PATH));
  const candidateApproval = await checkStaticLlmAdmissionApproval();
  const commitApprovalCandidates = candidateApproval.candidates.filter((candidate) => candidate.may_commit_assets);
  const approvalMarkerPresent = legacyApprovalMarkerPresent || commitApprovalCandidates.length > 0 || r28m1Approval.ok;

  if (!r28m1Approval.ok) {
    failures.push({
      code: "r28m1_exact_legacy_approval_failed",
      failure_codes: r28m1Approval.failures.map((failure) => failure.code),
    });
  }

  const admittedAssetPaths = new Set();
  let dryRunManifestCount = 0;
  for (const manifestPath of await discoverStaticLlmManifestPaths(ROOT)) {
    const baseValidation = await validateStaticLlmManifestFile(manifestPath, { root: ROOT });
    if (baseValidation.dry_run) dryRunManifestCount += 1;
    const validation = await validateStaticLlmManifestFile(manifestPath, { root: ROOT, admit: true });
    if (!validation.ok || !validation.admitted) continue;
    const manifest = await readStaticLlmManifest(manifestPath);
    for (const file of manifest.files || []) {
      for (const candidate of manifestAssetPathToRepoCandidates(file.path)) {
        admittedAssetPaths.add(normalizeRepoPath(candidate));
      }
    }
  }

  failures.push(...classifyTrackedModelWeights({
    trackedModelLikeFiles,
    admittedAssetPaths,
    exactLegacyPaths,
    r28m1ExactApproved: r28m1Approval.ok,
    generalApprovalPresent: legacyApprovalMarkerPresent || commitApprovalCandidates.length > 0,
  }));

  const report = {
    ok: failures.length === 0,
    tracked_model_like_files: trackedModelLikeFiles,
    approval_marker_present: approvalMarkerPresent,
    legacy_approval_marker_present: legacyApprovalMarkerPresent,
    commit_approval_candidate_count: commitApprovalCandidates.length,
    admitted_asset_count: admittedAssetPaths.size,
    dry_run_manifests_ignored_for_weight_approval: dryRunManifestCount,
    r28m1_exact_legacy_approval: r28m1Approval,
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
