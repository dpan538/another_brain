#!/usr/bin/env node
import { createHash, webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  ROOT,
  readStaticLlmManifest,
  validateStaticLlmManifestFile
} from "./static_llm_manifest_utils.mjs";
import { normalizeRepoPath } from "./static_llm_policy.mjs";
import {
  createStaticLlmDraftGenerator,
  validateSameOriginAssetUrl,
  verifyAssetSha256
} from "../web/static_llm_runtime.js";

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto });
}

const MANIFEST = resolve(ROOT, "static_llm/manifests/tiny_decoder_fixture.fixture.json");

async function main() {
  const manifest = await readStaticLlmManifest(MANIFEST);
  const validation = await validateStaticLlmManifestFile(MANIFEST, { root: ROOT });
  const admittedValidation = await validateStaticLlmManifestFile(MANIFEST, { root: ROOT, admit: true });
  const assetResults = [];

  for (const file of manifest.files) {
    const path = resolve(ROOT, file.path);
    const buffer = await readFile(path);
    const nodeSha = createHash("sha256").update(buffer).digest("hex");
    const runtimeShaOk = await verifyAssetSha256(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), file.sha256);
    const urlCheck = validateSameOriginAssetUrl(file.path, { location: { origin: "https://example.test" } });
    assetResults.push({
      path: normalizeRepoPath(file.path),
      bytes: buffer.byteLength,
      expected_sha256: file.sha256,
      node_sha256_ok: nodeSha === file.sha256,
      runtime_sha256_ok: runtimeShaOk,
      same_origin_url_ok: urlCheck.ok
    });
  }

  const generator = createStaticLlmDraftGenerator({ backend: "fixture_smoke" });
  const draft = await generator.generateDraft("hello");
  const failures = [];
  if (!validation.ok) failures.push({ code: "fixture_manifest_validation_failed", failures: validation.failures });
  if (admittedValidation.ok) failures.push({ code: "fixture_manifest_was_admitted" });
  for (const result of assetResults) {
    if (!result.node_sha256_ok || !result.runtime_sha256_ok || !result.same_origin_url_ok) {
      failures.push({ code: "fixture_asset_loader_failure", result });
    }
  }
  if (draft.ok || draft.usedBackend) failures.push({ code: "fixture_enabled_draft_generation_unexpectedly" });

  const report = {
    ok: failures.length === 0,
    manifest: "static_llm/manifests/tiny_decoder_fixture.fixture.json",
    fixture_review_status: manifest.review_status,
    normal_validation_ok: validation.ok,
    admitted_validation_ok: admittedValidation.ok,
    asset_results: assetResults,
    draft_generator_available: generator.available,
    draft_result: draft,
    failures
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
