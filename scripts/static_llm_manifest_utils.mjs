import { access, readdir, readFile, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  STATIC_LLM_POLICY,
  isExampleSha256,
  isExternalUrl,
  isValidSha256,
  manifestAssetPathToRepoCandidates,
  normalizeRepoPath,
  pathInApprovedStaticLlmAssetDir,
  pathInApprovedStaticLlmFixtureDir,
  profileBudgetBytes,
  resolveInsideRoot
} from "./static_llm_policy.mjs";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED_FIELDS = [
  "schema_version",
  "model_id",
  "model_family",
  "architecture",
  "parameter_count",
  "quantization",
  "context_length",
  "tokenizer",
  "runtime_backend",
  "license",
  "license_url",
  "source_url",
  "converted_by",
  "conversion_tool",
  "provenance",
  "review_status",
  "contains_private_data",
  "total_bytes",
  "profile",
  "files",
  "shard_policy",
  "same_origin_only",
  "external_urls_allowed",
  "backend_required"
];

const FILE_ROLES = new Set(["weights", "tokenizer", "config", "wasm_runtime", "metadata"]);
const ARCHITECTURES = new Set(["decoder_only", "encoder_decoder"]);
const RUNTIME_BACKENDS = new Set(["webgpu", "wasm", "webnn_candidate"]);
const EXAMPLE_REVIEW_STATUSES = new Set(["example", "example_only"]);
const FIXTURE_REVIEW_STATUSES = new Set(["fixture", "fixture_only"]);
const ADMITTED_REVIEW_STATUSES = new Set(["admitted", "reviewed_admitted"]);

async function exists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function walkJson(dir) {
  if (!(await exists(dir))) return [];
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkJson(path)));
    else if (extname(entry.name) === ".json") out.push(path);
  }
  return out;
}

export async function discoverStaticLlmManifestPaths(root = ROOT) {
  const candidates = new Set();
  for (const path of [
    "static_llm/example_manifest.hobby.json",
    "static_llm/example_manifest.pro.json"
  ]) {
    const abs = resolve(root, path);
    if (await exists(abs)) candidates.add(abs);
  }
  for (const dir of ["static_llm", "static_llm/manifests", "web/static_llm"]) {
    for (const abs of await walkJson(resolve(root, dir))) {
      const rel = normalizeRepoPath(relative(root, abs));
      if (rel.endsWith("llm_manifest.schema.json")) continue;
      if (/example_manifest\.(hobby|pro)\.json$/.test(rel)) {
        candidates.add(abs);
        continue;
      }
      if (/^static_llm\/manifests\/.+\.json$/.test(rel) || /^web\/static_llm\/manifests\/.+\.json$/.test(rel)) {
        candidates.add(abs);
        continue;
      }
      if (/(^|\/)(manifest|llm_manifest|static_llm_manifest)[^/]*\.json$/.test(rel)) candidates.add(abs);
    }
  }
  return [...candidates].sort();
}

export async function readStaticLlmManifest(path) {
  const text = await readFile(path, "utf8");
  return JSON.parse(text);
}

function push(failures, code, detail = {}) {
  failures.push({ code, ...detail });
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isExampleManifest(manifest = {}) {
  return EXAMPLE_REVIEW_STATUSES.has(String(manifest.review_status || ""));
}

function isFixtureManifest(manifest = {}) {
  return FIXTURE_REVIEW_STATUSES.has(String(manifest.review_status || ""));
}

function isAdmittedManifest(manifest = {}) {
  return ADMITTED_REVIEW_STATUSES.has(String(manifest.review_status || ""));
}

async function validateAssetExists(root, file, failures) {
  const candidates = manifestAssetPathToRepoCandidates(file.path)
    .map((candidate) => resolveInsideRoot(root, candidate))
    .filter(Boolean);
  const existing = [];
  for (const candidate of candidates) {
    if (await exists(candidate)) existing.push(candidate);
  }
  if (!existing.length) {
    push(failures, "admitted_asset_missing", { path: file.path });
    return;
  }
  const expectedBytes = Number(file.bytes || 0);
  for (const path of existing) {
    const info = await stat(path);
    if (info.size !== expectedBytes) {
      push(failures, "admitted_asset_size_mismatch", {
        path: normalizeRepoPath(relative(root, path)),
        expected_bytes: expectedBytes,
        actual_bytes: info.size
      });
    }
  }
}

export async function validateStaticLlmManifestObject(manifest, options = {}) {
  const root = options.root || ROOT;
  const filePath = options.filePath || "";
  const failures = [];
  const warnings = [];
  const example = isExampleManifest(manifest);
  const fixture = isFixtureManifest(manifest);
  const admitted = isAdmittedManifest(manifest);
  const admitMode = Boolean(options.admit || admitted);

  for (const field of REQUIRED_FIELDS) {
    if (!(field in manifest)) push(failures, "missing_required_field", { field });
  }

  if (manifest.schema_version !== 1) push(failures, "invalid_schema_version", { value: manifest.schema_version });
  if (!nonEmptyString(manifest.model_id)) push(failures, "missing_model_id");
  if (!nonEmptyString(manifest.model_family)) push(failures, "missing_model_family");
  if (!ARCHITECTURES.has(manifest.architecture)) push(failures, "invalid_architecture", { value: manifest.architecture });
  if (!Number.isInteger(manifest.parameter_count) || manifest.parameter_count <= 0) {
    push(failures, "invalid_parameter_count", { value: manifest.parameter_count });
  }
  if (!Number.isInteger(manifest.context_length) || manifest.context_length <= 0) {
    push(failures, "invalid_context_length", { value: manifest.context_length });
  }
  if (!RUNTIME_BACKENDS.has(manifest.runtime_backend)) {
    push(failures, "invalid_runtime_backend", { value: manifest.runtime_backend });
  }
  if (manifest.contains_private_data !== false) push(failures, "contains_private_data_must_be_false");
  if (manifest.same_origin_only !== true) push(failures, "same_origin_only_must_be_true");
  if (manifest.external_urls_allowed !== false) push(failures, "external_urls_allowed_must_be_false");
  if (manifest.backend_required !== false) push(failures, "backend_required_must_be_false");
  if (!STATIC_LLM_POLICY.profiles[manifest.profile]) push(failures, "invalid_profile", { value: manifest.profile });

  if (admitMode) {
    if (example) push(failures, "example_manifest_cannot_be_admitted");
    if (fixture) push(failures, "fixture_manifest_cannot_be_admitted");
    for (const field of ["license", "license_url", "provenance", "converted_by", "conversion_tool"]) {
      if (!nonEmptyString(manifest[field])) push(failures, "admitted_manifest_missing_review_metadata", { field });
    }
    if (!/reviewed|admitted/i.test(String(manifest.provenance || ""))) {
      warnings.push({ code: "admitted_manifest_provenance_should_name_review", field: "provenance" });
    }
  }

  const files = Array.isArray(manifest.files) ? manifest.files : [];
  if (!Array.isArray(manifest.files) || files.length === 0) push(failures, "files_must_be_nonempty_array");

  let totalBytes = 0;
  const seen = new Set();
  for (const [index, file] of files.entries()) {
    const prefix = { index, path: file?.path || "" };
    if (!file || typeof file !== "object") {
      push(failures, "invalid_file_entry", { index });
      continue;
    }
    if (!nonEmptyString(file.path)) push(failures, "file_missing_path", { index });
    if (file.path && isExternalUrl(file.path)) push(failures, "file_path_must_not_be_external_url", prefix);
    if (file.path && /(^|\/)\.\.(\/|$)/.test(normalizeRepoPath(file.path))) {
      push(failures, "file_path_must_not_escape_static_llm", prefix);
    }
    if (file.path && !pathInApprovedStaticLlmAssetDir(file.path) && !(fixture && pathInApprovedStaticLlmFixtureDir(file.path))) {
      push(failures, "file_path_outside_approved_static_llm_assets", prefix);
    }
    if (file.path && seen.has(file.path)) push(failures, "duplicate_file_path", prefix);
    seen.add(file.path);

    if (!Number.isInteger(file.bytes) || file.bytes <= 0) push(failures, "file_invalid_bytes", prefix);
    else totalBytes += file.bytes;
    if (!FILE_ROLES.has(file.role)) push(failures, "file_invalid_role", { ...prefix, role: file.role });
    if (typeof file.required !== "boolean") push(failures, "file_required_must_be_boolean", prefix);

    if (!nonEmptyString(file.sha256)) {
      push(failures, "file_missing_sha256", prefix);
    } else if (admitMode) {
      if (!isValidSha256(file.sha256)) push(failures, "admitted_file_sha256_must_be_real_hex", prefix);
      if (isExampleSha256(file.sha256)) push(failures, "admitted_file_uses_example_sha256", prefix);
    } else if (!isValidSha256(file.sha256) && !isExampleSha256(file.sha256)) {
      push(failures, "file_sha256_must_be_real_or_example_marker", prefix);
    }
  }

  if (manifest.total_bytes !== totalBytes) {
    push(failures, "total_bytes_must_equal_file_sum", { total_bytes: manifest.total_bytes, file_sum: totalBytes });
  }
  const budget = profileBudgetBytes(manifest.profile);
  if (budget > 0 && totalBytes > budget) {
    push(failures, "profile_budget_exceeded", { profile: manifest.profile, total_bytes: totalBytes, max_bytes: budget });
  }

  const shardPolicy = manifest.shard_policy || {};
  if (!Number.isInteger(shardPolicy.max_file_bytes) || shardPolicy.max_file_bytes <= 0) {
    push(failures, "invalid_shard_policy_max_file_bytes");
  } else if (shardPolicy.max_file_bytes > STATIC_LLM_POLICY.maxShardFileBytes) {
    push(failures, "shard_policy_max_exceeds_project_hard_max", {
      max_file_bytes: shardPolicy.max_file_bytes,
      project_max_file_bytes: STATIC_LLM_POLICY.maxShardFileBytes
    });
  }
  if (!Number.isInteger(shardPolicy.target_file_bytes) || shardPolicy.target_file_bytes <= 0) {
    push(failures, "invalid_shard_policy_target_file_bytes");
  } else if (shardPolicy.target_file_bytes > STATIC_LLM_POLICY.targetShardFileBytes) {
    push(failures, "shard_policy_target_exceeds_project_target", {
      target_file_bytes: shardPolicy.target_file_bytes,
      project_target_file_bytes: STATIC_LLM_POLICY.targetShardFileBytes
    });
  }
  if (!Number.isInteger(shardPolicy.shard_count) || shardPolicy.shard_count !== files.length) {
    push(failures, "shard_policy_shard_count_must_match_files", {
      shard_count: shardPolicy.shard_count,
      files: files.length
    });
  }
  for (const file of files) {
    if (Number.isInteger(file?.bytes) && Number.isInteger(shardPolicy.max_file_bytes) && file.bytes > shardPolicy.max_file_bytes) {
      push(failures, "file_exceeds_manifest_shard_max", {
        path: file.path,
        bytes: file.bytes,
        max_file_bytes: shardPolicy.max_file_bytes
      });
    }
  }

  if (admitMode) {
    for (const file of files) await validateAssetExists(root, file, failures);
  }

  return {
    ok: failures.length === 0,
    file: filePath ? normalizeRepoPath(relative(root, filePath)) : "",
    model_id: manifest.model_id || "",
    profile: manifest.profile || "",
    review_status: manifest.review_status || "",
    example,
    fixture,
    admitted,
    total_bytes: totalBytes,
    budget_bytes: budget,
    failures,
    warnings
  };
}

export async function validateStaticLlmManifestFile(path, options = {}) {
  const manifest = await readStaticLlmManifest(path);
  return validateStaticLlmManifestObject(manifest, { ...options, filePath: path });
}
