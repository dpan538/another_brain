#!/usr/bin/env node
import { createHash, webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import {
  ROOT,
  discoverStaticLlmManifestPaths,
  readStaticLlmManifest,
  validateStaticLlmManifestFile
} from "./static_llm_manifest_utils.mjs";
import { manifestAssetPathToRepoCandidates, normalizeRepoPath } from "./static_llm_policy.mjs";
import {
  createStaticLlmDraftGenerator,
  validateSameOriginAssetUrl,
  verifyAssetSha256
} from "../web/static_llm_runtime.js";
import { exists } from "./static_llm_artifact_utils.mjs";

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto });
}

async function verifyExistingAsset(file) {
  const candidates = manifestAssetPathToRepoCandidates(file.path);
  for (const candidate of candidates) {
    const abs = resolve(ROOT, candidate);
    if (!(await exists(abs))) continue;
    const buffer = await readFile(abs);
    const nodeSha = createHash("sha256").update(buffer).digest("hex");
    const runtimeShaOk = await verifyAssetSha256(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), file.sha256);
    return {
      path: normalizeRepoPath(candidate),
      exists: true,
      bytes: buffer.byteLength,
      node_sha256_ok: nodeSha === file.sha256,
      runtime_sha256_ok: runtimeShaOk
    };
  }
  return {
    path: normalizeRepoPath(file.path),
    exists: false,
    bytes: 0,
    node_sha256_ok: false,
    runtime_sha256_ok: false
  };
}

async function main() {
  const failures = [];
  const manifestReports = [];
  for (const manifestPath of await discoverStaticLlmManifestPaths(ROOT)) {
    const manifestRel = normalizeRepoPath(relative(ROOT, manifestPath));
    const manifest = await readStaticLlmManifest(manifestPath);
    const validation = await validateStaticLlmManifestFile(manifestPath, { root: ROOT });
    const admittedValidation = await validateStaticLlmManifestFile(manifestPath, { root: ROOT, admit: true });
    const assetResults = [];
    for (const file of manifest.files || []) {
      const sameOrigin = validateSameOriginAssetUrl(file.path, { location: { origin: "https://example.test" } });
      const asset = await verifyExistingAsset(file);
      assetResults.push({ manifest_path: file.path, same_origin_ok: sameOrigin.ok, ...asset });
    }
    const generator = createStaticLlmDraftGenerator({ backend: manifest.model_id || "static_llm_candidate" });
    const draft = await generator.generateDraft("fixture or candidate loader smoke");
    const isAdmitted = validation.admitted && validation.ok;
    const isCandidate = manifest.review_status === "candidate" || manifest.admission_status === "not_admitted";

    if (!validation.ok) failures.push({ code: "manifest_validation_failed", manifest: manifestRel, failures: validation.failures });
    for (const result of assetResults) {
      if (!result.same_origin_ok) failures.push({ code: "manifest_asset_not_same_origin", manifest: manifestRel, path: result.manifest_path });
      if ((validation.fixture || isAdmitted) && (!result.exists || !result.node_sha256_ok || !result.runtime_sha256_ok)) {
        failures.push({ code: "required_manifest_asset_hash_failed", manifest: manifestRel, result });
      }
    }
    if ((validation.fixture || isCandidate) && (draft.ok || draft.usedBackend || generator.available)) {
      failures.push({ code: "unadmitted_manifest_enabled_draft_generation", manifest: manifestRel });
    }
    if (isCandidate && admittedValidation.ok) failures.push({ code: "candidate_manifest_was_admitted", manifest: manifestRel });

    manifestReports.push({
      file: manifestRel,
      model_id: manifest.model_id,
      review_status: manifest.review_status,
      admission_status: manifest.admission_status || "",
      validation_ok: validation.ok,
      admitted_validation_ok: admittedValidation.ok,
      admitted: isAdmitted,
      candidate_or_fixture: validation.fixture || isCandidate,
      asset_results: assetResults,
      draft_generator_available: generator.available,
      draft_result: draft
    });
  }

  const report = {
    ok: failures.length === 0,
    manifest_count: manifestReports.length,
    admitted_manifest_count: manifestReports.filter((item) => item.admitted).length,
    candidate_manifest_count: manifestReports.filter((item) => item.admission_status === "not_admitted").length,
    fixture_manifest_count: manifestReports.filter((item) => item.review_status === "fixture").length,
    real_inference_attempted: false,
    manifests: manifestReports,
    failures
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
