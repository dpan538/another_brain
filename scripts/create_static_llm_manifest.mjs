#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ROOT,
  validateStaticLlmManifestObject
} from "./static_llm_manifest_utils.mjs";
import {
  STATIC_LLM_POLICY,
  isExternalUrl,
  isValidSha256,
  normalizeRepoPath,
  profileBudgetBytes
} from "./static_llm_policy.mjs";

const DEFAULT_OUT = "static_llm/manifests/tiny_decoder_fixture.fixture.json";
const FIXTURE_FILES = [
  { path: "static_llm/fixtures/tiny_decoder_fixture/config.json", role: "config", required: true },
  { path: "static_llm/fixtures/tiny_decoder_fixture/tokenizer.json", role: "tokenizer", required: true },
  { path: "static_llm/fixtures/tiny_decoder_fixture/model-000.fixture", role: "weights", required: true }
];

function parseArgs(argv) {
  const args = { fixture: false, dryRun: false, out: DEFAULT_OUT };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--fixture") args.fixture = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--out") args.out = argv[++index];
  }
  return args;
}

async function fileEntry(item) {
  if (isExternalUrl(item.path)) throw new Error(`External URL rejected: ${item.path}`);
  const abs = resolve(ROOT, item.path);
  const [info, bytes] = await Promise.all([stat(abs), readFile(abs)]);
  return {
    path: normalizeRepoPath(item.path),
    bytes: info.size,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    role: item.role,
    required: item.required
  };
}

async function buildFixtureManifest() {
  const files = [];
  for (const file of FIXTURE_FILES) files.push(await fileEntry(file));
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  return {
    schema_version: 1,
    model_id: "tiny-decoder-fixture-do-not-admit",
    model_family: "r25b_static_decoder_fixture",
    architecture: "decoder_only",
    parameter_count: 1,
    quantization: "fixture-only",
    context_length: 16,
    tokenizer: "tiny-decoder-fixture-tokenizer",
    runtime_backend: "wasm",
    license: "PROJECT_AUTHORED_FIXTURE",
    license_url: "",
    source_url: "project-authored-fixture",
    converted_by: "not-converted-fixture",
    conversion_tool: "scripts/create_static_llm_manifest.mjs --fixture",
    provenance: "R25B local fixture for static asset loader tests only. Not a real model and not admitted.",
    review_status: "fixture",
    contains_private_data: false,
    total_bytes: totalBytes,
    profile: "hobby_static_llm_lite",
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

function productionPreflight(manifest) {
  const failures = [];
  if (manifest.external_urls_allowed !== false) failures.push({ code: "external_urls_must_be_false" });
  if (manifest.same_origin_only !== true) failures.push({ code: "same_origin_only_must_be_true" });
  if (manifest.backend_required !== false) failures.push({ code: "backend_required_must_be_false" });
  if (manifest.total_bytes > profileBudgetBytes(manifest.profile)) failures.push({ code: "profile_budget_exceeded" });
  for (const file of manifest.files || []) {
    if (isExternalUrl(file.path)) failures.push({ code: "external_file_url_rejected", path: file.path });
    if (!isValidSha256(file.sha256)) failures.push({ code: "production_hash_must_be_real_sha256", path: file.path });
    if (file.bytes > STATIC_LLM_POLICY.maxShardFileBytes) failures.push({ code: "file_exceeds_hard_shard_max", path: file.path });
  }
  return failures;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.fixture) {
    console.error("Only --fixture manifest generation is supported in R25B. Real model manifests belong to R25C admission.");
    process.exit(2);
  }

  const manifest = await buildFixtureManifest();
  const validation = await validateStaticLlmManifestObject(manifest, { root: ROOT });
  const admittedValidation = await validateStaticLlmManifestObject(manifest, { root: ROOT, admit: true });
  const productionFailures = productionPreflight(manifest);
  const ok = validation.ok && !admittedValidation.ok && productionFailures.length === 0;

  let wrote = false;
  if (ok && !args.dryRun) {
    const out = resolve(ROOT, args.out);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, JSON.stringify(manifest, null, 2) + "\n", "utf8");
    wrote = true;
  }

  const report = {
    ok,
    fixture: true,
    dry_run: args.dryRun,
    wrote,
    out: normalizeRepoPath(args.out),
    manifest_id: manifest.model_id,
    total_bytes: manifest.total_bytes,
    normal_validation_ok: validation.ok,
    admitted_validation_ok: admittedValidation.ok,
    admitted_rejection_codes: admittedValidation.failures.map((failure) => failure.code),
    production_preflight_failures: productionFailures,
    manifest: args.dryRun ? manifest : undefined
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
