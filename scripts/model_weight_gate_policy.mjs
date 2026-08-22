import {
  normalizeRepoPath,
  pathInApprovedStaticLlmAssetDir,
  pathInApprovedStaticLlmFixtureDir,
} from "./static_llm_policy.mjs";

export function classifyTrackedModelWeights(options) {
  const failures = [];
  const admittedAssetPaths = new Set([...options.admittedAssetPaths].map(normalizeRepoPath));
  const exactLegacyPaths = new Set([...options.exactLegacyPaths].map(normalizeRepoPath));
  for (const rawPath of options.trackedModelLikeFiles) {
    const path = normalizeRepoPath(rawPath);
    if (pathInApprovedStaticLlmFixtureDir(path)) continue;
    if (!pathInApprovedStaticLlmAssetDir(path)) {
      failures.push({ code: "tracked_model_weight_outside_approved_static_llm_assets", path });
      continue;
    }
    if (!admittedAssetPaths.has(path)) failures.push({ code: "tracked_model_weight_not_backed_by_admitted_manifest", path });
    if (options.r28m1ExactApproved && exactLegacyPaths.has(path)) continue;
    if (!options.generalApprovalPresent) {
      failures.push({
        code: "tracked_model_weight_missing_explicit_approval_marker",
        path,
        approval_marker: "static_llm/inbox/<candidate>/APPROVE_STATIC_LLM_PRODUCTION_ADMISSION.json with scope commit_assets",
      });
    }
  }
  return failures;
}
