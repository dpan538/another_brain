#!/usr/bin/env node
import { readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import {
  APPROVAL_MARKER_PATH,
  APPROVED_INBOX_PATHS,
  exists,
  gitLsFiles,
  modelLikeExtensions
} from "./static_llm_artifact_utils.mjs";
import { ROOT } from "./static_llm_manifest_utils.mjs";
import { isModelWeightPath, normalizeRepoPath } from "./static_llm_policy.mjs";

async function walkEntries(dir) {
  if (!(await exists(dir))) return [];
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    out.push(path);
    if (entry.isDirectory()) out.push(...(await walkEntries(path)));
  }
  return out.sort();
}

async function main() {
  const candidateFiles = [];
  const modelLikeFiles = [];
  for (const inboxPath of APPROVED_INBOX_PATHS) {
    const abs = resolve(ROOT, inboxPath);
    for (const file of await walkEntries(abs)) {
      const rel = normalizeRepoPath(relative(ROOT, file));
      candidateFiles.push(rel);
      if (isModelWeightPath(rel)) modelLikeFiles.push(rel);
    }
  }

  const tracked = new Set(await gitLsFiles(["ls-files", "--cached"]));
  const trackedModelLikeFiles = modelLikeFiles.filter((file) => tracked.has(file));
  const unstagedModelLikeFiles = modelLikeFiles.filter((file) => !tracked.has(file));
  const approvalMarkerPresent = await exists(resolve(ROOT, APPROVAL_MARKER_PATH));
  const notes = [
    "Real model-like files in static_llm/inbox and static_llm/models_staging are ignored and must remain unstaged by default.",
    `Recognized model extensions: ${modelLikeExtensions().join(", ")}.`
  ];
  if (!modelLikeFiles.length) notes.push("No local model artifact files found in approved inbox paths.");
  if (unstagedModelLikeFiles.length) notes.push("Local model-like files are present but not tracked; keep them unstaged until explicit admission approval.");

  const report = {
    ok: trackedModelLikeFiles.length === 0,
    inbox_paths: APPROVED_INBOX_PATHS,
    candidate_files: candidateFiles.sort(),
    model_like_files: modelLikeFiles.sort(),
    tracked_model_like_files: trackedModelLikeFiles.sort(),
    unstaged_model_like_files: unstagedModelLikeFiles.sort(),
    approval_marker_present: approvalMarkerPresent,
    safe_to_stage_weights: false,
    notes
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
