#!/usr/bin/env node
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";

import { checkStaticLlmAdmissionApproval } from "./check_static_llm_admission_approval.mjs";
import { discoverStaticLlmArtifacts } from "./discover_static_llm_artifacts.mjs";
import {
  buildStaticManifestFromInspection,
  inspectArtifactDirectory,
  safeModelSlug,
  writeJson
} from "./static_llm_artifact_utils.mjs";
import { ROOT, validateStaticLlmManifestObject } from "./static_llm_manifest_utils.mjs";
import { normalizeRepoPath } from "./static_llm_policy.mjs";

function parseArgs(argv) {
  const args = { dir: "", candidate: "", outRoot: "static_llm/assets", write: false, profile: "pro_static_llm_full" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dir") args.dir = argv[++index];
    else if (arg === "--candidate") args.candidate = argv[++index];
    else if (arg === "--out-root") args.outRoot = argv[++index];
    else if (arg === "--write") args.write = true;
    else if (arg === "--profile") args.profile = argv[++index];
  }
  return args;
}

async function resolveTarget(args) {
  if (args.dir) return { dir: normalizeRepoPath(args.dir), candidate_id: safeModelSlug(basename(args.dir)) };
  const discovery = await discoverStaticLlmArtifacts();
  if (!args.candidate && discovery.candidates.length === 1) return discovery.candidates[0];
  return discovery.candidates.find((candidate) => candidate.candidate_id === args.candidate || basename(candidate.dir) === args.candidate) || null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = await resolveTarget(args);
  if (!target) {
    const discovery = await discoverStaticLlmArtifacts();
    console.log(JSON.stringify({
      ok: true,
      dry_run: !args.write,
      blocked: true,
      blocked_reason: discovery.blocked_reason || "candidate_required",
      candidate_count: discovery.candidate_count,
      copied: false
    }, null, 2));
    return;
  }

  const approvalReport = await checkStaticLlmAdmissionApproval();
  const approval = approvalReport.candidates.find((candidate) => candidate.dir === target.dir) || null;
  const inspection = await inspectArtifactDirectory(target.dir);
  const slug = safeModelSlug(inspection.metadata?.model_id || target.candidate_id || basename(target.dir));
  const outDir = normalizeRepoPath(join(args.outRoot, slug));
  const mayCopy = Boolean(approval?.may_stage_assets || approval?.may_commit_assets);
  const copyAllowed = args.write && mayCopy;
  const stagedFiles = [];
  const checksumLines = [];

  for (const file of inspection.files || []) {
    const stagedPath = normalizeRepoPath(join(outDir, file.relative_path));
    stagedFiles.push({ source_path: file.path, staged_path: stagedPath, bytes: file.bytes, sha256: file.sha256, role: file.role });
    checksumLines.push(`${file.sha256}  ${file.relative_path}`);
    if (copyAllowed) {
      const absOut = resolve(ROOT, stagedPath);
      await mkdir(dirname(absOut), { recursive: true });
      await copyFile(resolve(ROOT, file.path), absOut);
    }
  }

  if (copyAllowed) {
    const checksumPath = resolve(ROOT, outDir, "checksums.sha256");
    await mkdir(dirname(checksumPath), { recursive: true });
    await writeFile(checksumPath, checksumLines.join("\n") + "\n", "utf8");
  }

  const manifest = buildStaticManifestFromInspection({
    ...inspection,
    files: (inspection.files || []).map((file) => ({
      ...file,
      path: normalizeRepoPath(join(outDir, file.relative_path))
    }))
  }, {
    profile: args.profile,
    admitProduction: Boolean(approval?.may_commit_assets && inspection.ok)
  });
  const validation = await validateStaticLlmManifestObject(manifest, { root: ROOT });
  const manifestOut = `static_llm/manifests/${slug}.${approval?.may_commit_assets ? "pro" : "candidate"}.json`;
  if (copyAllowed) await writeJson(resolve(ROOT, manifestOut), manifest);

  const report = {
    ok: inspection.ok && validation.ok,
    dry_run: !args.write,
    write_requested: args.write,
    copied: copyAllowed,
    blocked: args.write && !mayCopy,
    blocked_reason: args.write && !mayCopy ? "approval_marker_scope_must_be_stage_assets_or_commit_assets" : "",
    candidate_id: slug,
    candidate_dir: inspection.dir,
    approval_scope: approval?.approval_scope || "inspect_only",
    out_dir: outDir,
    manifest_out: manifestOut,
    manifest_written: copyAllowed,
    staged_files: stagedFiles,
    validation,
    notes: [
      "This command never stages files to git.",
      "Real model-like files still require commit_assets approval and green R25 gates before commit."
    ]
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
