#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { dirname, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import { isModelWeightPath, normalizeRepoPath } from "./static_llm_policy.mjs";

const execFileAsync = promisify(execFile);
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const APPROVAL_PATH = "data/training_registry/r28m1_static_asset_commit_approval.json";
export const R28M1_ASSET_ROOT = "web/another_brain/model_assets/r28m1/";

const REQUIRED_TRUE_SCOPE = Object.freeze([
  "a12_new_96m_q4_static_shards",
  "runtime_tokenizer_asset",
  "model_config",
  "quantization_manifest",
  "shard_checksum_manifest",
  "asset_manifest_metadata",
  "tests_docs_scripts",
]);

const REQUIRED_FALSE_SCOPE = Object.freeze([
  "raw_checkpoint",
  "unquantized_weights",
  "optimizer_state",
  "training_artifacts",
  "training_corpus",
  "future_models",
  "product_admission",
  "browser_admission",
  "release_checkpoint_admission",
  "phase_4",
]);

async function sha256File(path) {
  return new Promise((resolveHash, reject) => {
    const digest = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => digest.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolveHash(digest.digest("hex")));
  });
}

async function gitTrackedModelFiles(root) {
  try {
    const { stdout } = await execFileAsync("git", ["ls-files", "--cached"], { cwd: root, maxBuffer: 20 * 1024 * 1024 });
    return stdout.split(/\r?\n/).map(normalizeRepoPath).filter((path) => path && isModelWeightPath(path));
  } catch {
    return [];
  }
}

function fail(failures, code, details = {}) {
  failures.push({ code, ...details });
}

async function verifyFile(root, entry, failures, role) {
  if (!entry || typeof entry.path !== "string") {
    fail(failures, "exact_entry_missing", { role });
    return;
  }
  const path = resolve(root, entry.path);
  const rel = normalizeRepoPath(relative(root, path));
  if (rel !== normalizeRepoPath(entry.path) || rel.startsWith("..")) {
    fail(failures, "exact_path_outside_repository", { role, path: entry.path });
    return;
  }
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) {
    fail(failures, "exact_file_missing", { role, path: entry.path });
    return;
  }
  if (info.size !== entry.bytes) fail(failures, "exact_byte_count_mismatch", { role, path: entry.path, expected: entry.bytes, actual: info.size });
  const sha256 = await sha256File(path);
  if (sha256 !== entry.sha256) fail(failures, "exact_sha256_mismatch", { role, path: entry.path });
}

export async function validateR28M1ExactCompatibility(options = {}) {
  const root = resolve(options.root ?? ROOT);
  const failures = [];
  const approvalPath = resolve(root, options.approvalPath ?? APPROVAL_PATH);
  let approval;
  try {
    approval = JSON.parse(await readFile(approvalPath, "utf8"));
  } catch {
    fail(failures, "approval_marker_missing_or_invalid", { path: normalizeRepoPath(relative(root, approvalPath)) });
    approval = {};
  }

  if (approval.approval_marker !== "R28M1_STATIC_MODEL_ASSET_COMMIT_ALLOWED") fail(failures, "approval_marker_mismatch");
  if (approval.approved !== true) fail(failures, "approval_not_true");
  if (approval.approved_in_prompt !== true) fail(failures, "approved_in_prompt_not_true");
  if (approval.candidate_source !== "r27a12_new_96m") fail(failures, "candidate_source_mismatch");
  if (approval.commit_scope !== "one_time_static_q4_asset_commit") fail(failures, "commit_scope_mismatch");
  for (const field of REQUIRED_TRUE_SCOPE) if (approval.scope?.[field] !== true) fail(failures, "required_scope_not_true", { field });
  for (const field of REQUIRED_FALSE_SCOPE) {
    if (approval.scope?.[field] !== false) fail(failures, "forbidden_scope_not_false", { field });
    if (approval.exclusions?.[field] !== true) fail(failures, "required_exclusion_not_true", { field });
  }

  const exact = approval.exact_compatibility ?? {};
  if (exact.asset_root !== R28M1_ASSET_ROOT) fail(failures, "asset_root_mismatch");
  if (exact.shard_count !== 5) fail(failures, "exact_shard_count_not_five");
  if (exact.shard_total_bytes !== 48_267_968) fail(failures, "exact_shard_total_bytes_mismatch");
  const shards = Array.isArray(exact.shards) ? exact.shards : [];
  const shardPaths = shards.map((entry) => normalizeRepoPath(entry.path));
  const expectedPaths = [1, 2, 3, 4, 5].map((index) => `${R28M1_ASSET_ROOT}shards/model-q4-${String(index).padStart(5, "0")}.bin`);
  if (shards.length !== 5 || JSON.stringify(shardPaths) !== JSON.stringify(expectedPaths)) fail(failures, "exact_shard_paths_mismatch", { paths: shardPaths });

  const shardDir = resolve(root, R28M1_ASSET_ROOT, "shards");
  const filesystemShards = (await readdir(shardDir).catch(() => []))
    .filter((name) => isModelWeightPath(name))
    .map((name) => `${R28M1_ASSET_ROOT}shards/${name}`)
    .sort();
  if (JSON.stringify(filesystemShards) !== JSON.stringify([...expectedPaths].sort())) fail(failures, "unexpected_or_missing_r28m1_shard", { paths: filesystemShards });

  const trackedModelLikeFiles = options.trackedModelLikeFiles ?? await gitTrackedModelFiles(root);
  const trackedR28M1 = trackedModelLikeFiles.filter((path) => normalizeRepoPath(path).startsWith(R28M1_ASSET_ROOT)).sort();
  if (JSON.stringify(trackedR28M1) !== JSON.stringify([...expectedPaths].sort())) fail(failures, "tracked_r28m1_inventory_mismatch", { paths: trackedR28M1 });

  for (const entry of shards) await verifyFile(root, entry, failures, "q4_shard");
  for (const [role, entry] of Object.entries({
    runtime_tokenizer: exact.runtime_tokenizer,
    tokenizer_metadata: exact.tokenizer_metadata,
    model_config: exact.model_config,
    quantization_manifest: exact.quantization_manifest,
    checksum_manifest: exact.checksum_manifest,
    admitted_manifest: exact.admitted_manifest,
  })) await verifyFile(root, entry, failures, role);

  const assetCommitApproved = failures.length === 0;
  return {
    ok: assetCommitApproved,
    asset_commit_approved: assetCommitApproved,
    approval_marker: approval.approval_marker ?? null,
    approved: approval.approved === true,
    approved_in_prompt: approval.approved_in_prompt === true,
    candidate_source: approval.candidate_source ?? null,
    exact_scope: assetCommitApproved,
    exact_shard_count: shards.length,
    exact_shard_total_bytes: shards.reduce((sum, entry) => sum + Number(entry.bytes || 0), 0),
    product_admission: false,
    browser_admission: false,
    release_admission: false,
    future_model_approval: false,
    failures,
  };
}

async function main() {
  const report = await validateR28M1ExactCompatibility();
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error?.name || "exact_r28m1_validation_failed" }));
    process.exit(2);
  });
}
