#!/usr/bin/env node
import { readdir } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  APPROVED_INBOX_PATHS,
  ARTIFACT_METADATA_FILENAME,
  exists,
  readArtifactMetadata,
  safeModelSlug
} from "./static_llm_artifact_utils.mjs";
import { ROOT } from "./static_llm_manifest_utils.mjs";
import { isModelWeightPath, normalizeRepoPath } from "./static_llm_policy.mjs";

async function listChildren(dir) {
  if (!(await exists(dir))) return [];
  return readdir(dir, { withFileTypes: true });
}

async function discoverCandidateDirs() {
  const candidates = [];
  for (const inboxPath of APPROVED_INBOX_PATHS) {
    const absInbox = resolve(ROOT, inboxPath);
    for (const entry of await listChildren(absInbox)) {
      if (!entry.isDirectory()) continue;
      const absDir = join(absInbox, entry.name);
      const relDir = normalizeRepoPath(relative(ROOT, absDir));
      const metadataPath = join(absDir, ARTIFACT_METADATA_FILENAME);
      const children = await listChildren(absDir);
      const fileNames = children.filter((child) => child.isFile()).map((child) => child.name).sort();
      const modelLikeFiles = fileNames.filter((name) => isModelWeightPath(name));
      const metadata = await readArtifactMetadata(absDir);
      candidates.push({
        candidate_id: safeModelSlug(metadata.metadata?.model_id || basename(absDir)),
        dir: relDir,
        approved_inbox_path: inboxPath,
        metadata_path: normalizeRepoPath(relative(ROOT, metadataPath)),
        metadata_present: metadata.ok,
        file_count: fileNames.length,
        model_like_file_count: modelLikeFiles.length,
        model_like_files: modelLikeFiles,
        review_status: metadata.metadata?.review_status || "",
        architecture: metadata.metadata?.architecture || "",
        target_profile: metadata.metadata?.target_profile || ""
      });
    }
  }
  return candidates.sort((a, b) => a.dir.localeCompare(b.dir));
}

export async function discoverStaticLlmArtifacts() {
  const candidates = await discoverCandidateDirs();
  return {
    ok: true,
    candidate_count: candidates.length,
    candidates,
    approved_paths_checked: APPROVED_INBOX_PATHS,
    blocked: candidates.length === 0,
    blocked_reason: candidates.length === 0 ? "no_local_decoder_artifact_found" : ""
  };
}

async function main() {
  const report = await discoverStaticLlmArtifacts();
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
