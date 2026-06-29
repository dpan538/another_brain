import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { execFile } from "node:child_process";
import { access, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";

import {
  MODEL_WEIGHT_EXTENSIONS,
  STATIC_LLM_POLICY,
  isExternalUrl,
  isModelWeightPath,
  normalizeRepoPath,
  pathInApprovedStaticLlmAssetDir,
  profileBudgetBytes,
  repoRelativePath,
  resolveInsideRoot
} from "./static_llm_policy.mjs";
import { ROOT } from "./static_llm_manifest_utils.mjs";

const execFileAsync = promisify(execFile);

export const ARTIFACT_METADATA_FILENAME = "artifact_metadata.json";
export const APPROVAL_MARKER_PATH = "static_llm/WEIGHT_COMMIT_APPROVAL.json";
export const APPROVED_INBOX_PATHS = Object.freeze([
  "static_llm/inbox/",
  "static_llm/models_staging/"
]);

const REQUIRED_METADATA_FIELDS = Object.freeze([
  "model_id",
  "model_family",
  "architecture",
  "parameter_count",
  "quantization",
  "context_length",
  "tokenizer_type",
  "source_url",
  "source_commit_or_revision",
  "license",
  "license_url",
  "converted_by",
  "conversion_tool",
  "conversion_command",
  "conversion_date",
  "contains_private_data",
  "review_status",
  "reviewer",
  "target_profile",
  "expected_total_bytes",
  "expected_shard_count",
  "notes"
]);

const FORBIDDEN_METADATA_FIELDS = Object.freeze([
  "chain_of_thought",
  "chain-of-thought",
  "hidden_prompt",
  "system_prompt",
  "raw_private_data",
  "private_memory",
  "secret",
  "api_key",
  "local_user_path"
]);

const TEXT_EXTS = new Set([".json", ".md", ".txt", ".model", ".vocab", ".merges", ".yml", ".yaml"]);

export async function exists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function gitLsFiles(args) {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: ROOT, maxBuffer: 20 * 1024 * 1024 });
    return stdout.split(/\r?\n/).map(normalizeRepoPath).filter(Boolean);
  } catch {
    return [];
  }
}

export function pathInApprovedInbox(path = "") {
  const normalized = normalizeRepoPath(path);
  return APPROVED_INBOX_PATHS.some((prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix));
}

export function safeModelSlug(value = "") {
  return String(value || "local-static-decoder-candidate")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "local-static-decoder-candidate";
}

export async function walkFiles(dir) {
  if (!(await exists(dir))) return [];
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkFiles(path)));
    else out.push(path);
  }
  return out.sort();
}

export async function sha256File(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

export function roleForPath(path = "") {
  const rel = normalizeRepoPath(path).toLowerCase();
  const name = basename(rel);
  if (name === ARTIFACT_METADATA_FILENAME || /metadata|license|notice|readme/.test(name)) return "metadata";
  if (/config.*\.json$/.test(name)) return "config";
  if (/tokenizer|vocab|merges/.test(name)) return "tokenizer";
  if (name.endsWith(".wasm")) return "wasm_runtime";
  if (isModelWeightPath(name) || /(^|\/)(model|weights?|shard)[^/]*\./.test(rel)) return "weights";
  if (TEXT_EXTS.has(extname(name))) return "metadata";
  return "metadata";
}

export function isSecretLikeFileName(path = "") {
  return /(^|[._-])(secret|credential|api[_-]?key|private[_-]?key|local[_-]?export|env)([._-]|$)/i.test(basename(path));
}

function hasPrivateLocalPath(value = "") {
  return /\/Users\/|\/private\/var\/|\/Volumes\/|[A-Za-z]:\\Users\\/i.test(String(value || ""));
}

function hasForbiddenTextMarker(value = "") {
  return /chain[_ -]?of[_ -]?thought|hidden_prompt|system_prompt|raw_private_data|private_memory|api_key|BEGIN PRIVATE KEY/i.test(String(value || ""));
}

function hasDummyValue(value = "") {
  return /example|dummy|do[-_ ]?not[-_ ]?admit|placeholder|todo/i.test(String(value || ""));
}

function scanObjectStrings(value, visitor, path = []) {
  if (typeof value === "string") {
    visitor(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanObjectStrings(item, visitor, [...path, String(index)]));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) scanObjectStrings(item, visitor, [...path, key]);
  }
}

export function validateArtifactMetadata(metadata = {}, options = {}) {
  const failures = [];
  const warnings = [];
  const production = options.production === true;

  for (const field of REQUIRED_METADATA_FIELDS) {
    if (!(field in metadata)) failures.push({ code: "metadata_missing_required_field", field });
  }
  for (const field of FORBIDDEN_METADATA_FIELDS) {
    if (field in metadata) failures.push({ code: "metadata_forbidden_field_present", field });
  }

  if (!["decoder_only", "encoder_decoder", "encoder_only"].includes(metadata.architecture)) {
    failures.push({ code: "metadata_invalid_architecture", value: metadata.architecture });
  }
  if (metadata.architecture === "encoder_only") {
    failures.push({ code: "encoder_only_artifact_cannot_be_final_product_target" });
  }
  if (metadata.contains_private_data !== false) failures.push({ code: "metadata_contains_private_data_must_be_false" });
  if (!STATIC_LLM_POLICY.profiles[metadata.target_profile]) failures.push({ code: "metadata_invalid_target_profile", value: metadata.target_profile });
  if (!Number.isInteger(metadata.parameter_count) || metadata.parameter_count <= 0) failures.push({ code: "metadata_invalid_parameter_count" });
  if (!Number.isInteger(metadata.context_length) || metadata.context_length <= 0) failures.push({ code: "metadata_invalid_context_length" });
  if (!Number.isInteger(metadata.expected_total_bytes) || metadata.expected_total_bytes <= 0) failures.push({ code: "metadata_invalid_expected_total_bytes" });
  if (!Number.isInteger(metadata.expected_shard_count) || metadata.expected_shard_count <= 0) failures.push({ code: "metadata_invalid_expected_shard_count" });

  for (const field of ["license", "license_url", "source_url", "source_commit_or_revision", "converted_by", "conversion_tool", "conversion_command"]) {
    if (typeof metadata[field] !== "string" || !metadata[field].trim()) failures.push({ code: "metadata_missing_provenance_field", field });
  }

  if (production) {
    if (!["reviewed", "approved"].includes(String(metadata.review_status || ""))) failures.push({ code: "production_metadata_not_reviewed_or_approved" });
    if (typeof metadata.reviewer !== "string" || !metadata.reviewer.trim()) failures.push({ code: "production_metadata_missing_reviewer" });
    for (const [field, value] of Object.entries(metadata)) {
      if (typeof value === "string" && hasDummyValue(value)) failures.push({ code: "production_metadata_uses_example_or_dummy_value", field });
    }
  } else if (!["candidate", "reviewed", "approved", "example", "rejected"].includes(String(metadata.review_status || ""))) {
    warnings.push({ code: "metadata_review_status_not_standard", value: metadata.review_status });
  }

  scanObjectStrings(metadata, (value, path) => {
    if (hasPrivateLocalPath(value)) failures.push({ code: "metadata_contains_local_private_path", field_path: path.join(".") });
    if (hasForbiddenTextMarker(value)) failures.push({ code: "metadata_contains_forbidden_training_marker", field_path: path.join(".") });
  });

  return { ok: failures.length === 0, failures, warnings };
}

export async function readArtifactMetadata(dir) {
  const metadataPath = resolve(dir, ARTIFACT_METADATA_FILENAME);
  if (!(await exists(metadataPath))) {
    return {
      ok: false,
      path: metadataPath,
      metadata: null,
      failures: [{ code: "artifact_metadata_missing", path: normalizeRepoPath(metadataPath) }]
    };
  }
  try {
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    return { ok: true, path: metadataPath, metadata, failures: [] };
  } catch (error) {
    return {
      ok: false,
      path: metadataPath,
      metadata: null,
      failures: [{ code: "artifact_metadata_json_parse_failed", message: error.message }]
    };
  }
}

export async function inspectArtifactDirectory(dir, options = {}) {
  const root = options.root || ROOT;
  const resolved = resolveInsideRoot(root, dir);
  const failures = [];
  const warnings = [];
  if (!resolved) failures.push({ code: "artifact_dir_must_stay_inside_repo", dir });
  const relDir = resolved ? repoRelativePath(root, resolved) : normalizeRepoPath(dir);
  if (resolved && !pathInApprovedInbox(relDir)) failures.push({ code: "artifact_dir_outside_approved_inbox", dir: relDir });
  if (resolved && !(await exists(resolved))) failures.push({ code: "artifact_dir_missing", dir: relDir });
  if (failures.length) {
    return { ok: false, dir: relDir, metadata: null, files: [], failures, warnings };
  }

  const metadataResult = await readArtifactMetadata(resolved);
  if (!metadataResult.ok) failures.push(...metadataResult.failures);
  const metadata = metadataResult.metadata || {};
  const metadataValidation = metadataResult.ok ? validateArtifactMetadata(metadata, { production: options.production }) : { ok: false, failures: [], warnings: [] };
  failures.push(...metadataValidation.failures);
  warnings.push(...metadataValidation.warnings);

  const absFiles = (await walkFiles(resolved)).filter((path) => basename(path) !== ".DS_Store");
  const files = [];
  for (const path of absFiles) {
    const info = await stat(path);
    const rel = repoRelativePath(root, path);
    const relativeToArtifact = normalizeRepoPath(relative(resolved, path));
    const role = roleForPath(relativeToArtifact);
    const sha256 = await sha256File(path);
    const entry = { path: rel, relative_path: relativeToArtifact, bytes: info.size, sha256, role, required: role !== "metadata" };
    files.push(entry);
    if (isExternalUrl(relativeToArtifact) || isExternalUrl(rel)) failures.push({ code: "artifact_file_path_must_not_be_external_url", path: rel });
    if (isSecretLikeFileName(relativeToArtifact)) failures.push({ code: "artifact_file_name_suggests_secret_or_local_export", path: rel });
    if (TEXT_EXTS.has(extname(path).toLowerCase()) && info.size <= 1_000_000) {
      const text = await readFile(path, "utf8").catch(() => "");
      if (hasPrivateLocalPath(text)) failures.push({ code: "artifact_text_contains_local_private_path", path: rel });
      if (hasForbiddenTextMarker(text)) failures.push({ code: "artifact_text_contains_forbidden_training_marker", path: rel });
    }
  }

  const roles = new Set(files.map((file) => file.role));
  if (!roles.has("config")) failures.push({ code: "artifact_missing_config_file" });
  if (!roles.has("tokenizer")) failures.push({ code: "artifact_missing_tokenizer_file" });
  if (!roles.has("weights")) failures.push({ code: "artifact_missing_weight_file" });

  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  const maxFileBytes = files.reduce((max, file) => Math.max(max, file.bytes), 0);
  const profileFit = Object.fromEntries(
    Object.keys(STATIC_LLM_POLICY.profiles).map((profile) => {
      const maxTotalBytes = profileBudgetBytes(profile);
      return [profile, {
        fits: totalBytes <= maxTotalBytes && maxFileBytes <= STATIC_LLM_POLICY.maxShardFileBytes,
        max_total_bytes: maxTotalBytes,
        total_bytes: totalBytes,
        max_file_bytes: maxFileBytes
      }];
    })
  );

  return {
    ok: failures.length === 0,
    dir: relDir,
    metadata_path: metadataResult.ok ? repoRelativePath(root, metadataResult.path) : "",
    metadata,
    metadata_validation: metadataValidation,
    total_bytes: totalBytes,
    max_file_bytes: maxFileBytes,
    shard_count: files.filter((file) => file.role === "weights").length,
    profile_fit: profileFit,
    files,
    failures,
    warnings
  };
}

export function buildStaticManifestFromInspection(inspection, options = {}) {
  const metadata = inspection.metadata || {};
  const profile = options.profile || metadata.target_profile || "pro_static_llm_full";
  const production = options.admitProduction === true;
  const slug = safeModelSlug(metadata.model_id || basename(inspection.dir || "local-static-decoder-candidate"));
  const files = inspection.files.map((file) => ({
    path: pathInApprovedStaticLlmAssetDir(file.path)
      ? file.path
      : `static_llm/assets/${slug}/${file.relative_path}`,
    bytes: file.bytes,
    sha256: file.sha256,
    role: file.role,
    required: file.required
  }));
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  return {
    schema_version: 1,
    model_id: metadata.model_id || slug,
    model_family: metadata.model_family || "local_static_decoder_candidate",
    architecture: metadata.architecture || "decoder_only",
    parameter_count: metadata.parameter_count || 1,
    quantization: metadata.quantization || "unknown",
    context_length: metadata.context_length || 1,
    tokenizer: metadata.tokenizer_type || "unknown",
    runtime_backend: "webgpu",
    license: metadata.license || "",
    license_url: metadata.license_url || "",
    source_url: metadata.source_url || "",
    converted_by: metadata.converted_by || "",
    conversion_tool: metadata.conversion_tool || "",
    provenance: production
      ? `R25C reviewed local artifact. Source revision: ${metadata.source_commit_or_revision || "unknown"}. Reviewer: ${metadata.reviewer || "unknown"}.`
      : `R25C local artifact candidate only; not admitted. Source revision: ${metadata.source_commit_or_revision || "unknown"}.`,
    review_status: production ? "reviewed_admitted" : "candidate",
    admission_status: production ? "admitted" : "not_admitted",
    contains_private_data: false,
    total_bytes: totalBytes,
    profile,
    files,
    shard_policy: {
      max_file_bytes: STATIC_LLM_POLICY.maxShardFileBytes,
      target_file_bytes: STATIC_LLM_POLICY.targetShardFileBytes,
      shard_count: files.length
    },
    same_origin_only: true,
    external_urls_allowed: false,
    backend_required: false
  };
}

export async function writeJson(path, object) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(object, null, 2) + "\n", "utf8");
}

export function modelLikeExtensions() {
  return [...MODEL_WEIGHT_EXTENSIONS].sort();
}
