#!/usr/bin/env node
import { createHash, webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  ROOT,
  discoverStaticLlmManifestPaths,
  readStaticLlmManifest,
  validateStaticLlmManifestFile
} from "./static_llm_manifest_utils.mjs";
import { manifestAssetPathToRepoCandidates, normalizeRepoPath } from "./static_llm_policy.mjs";
import { exists } from "./static_llm_artifact_utils.mjs";
import {
  loadModelShardHeaders,
  loadStaticLlmAssets,
  loadTokenizerAndConfig,
  validateSameOriginAssetUrl
} from "../web/static_llm_runtime.js";
import { createStaticLlmBackend } from "../web/static_llm_backend.js";
import {
  loadTokenizerFromManifest,
  tokenizeForStaticLlm,
  validateTokenizerConfig
} from "../web/static_llm_tokenizer.js";

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto });
}

function arrayBufferFromBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

async function readRepoAsset(path) {
  const candidates = manifestAssetPathToRepoCandidates(path);
  for (const candidate of candidates) {
    const abs = resolve(ROOT, candidate);
    if (await exists(abs)) {
      const buffer = await readFile(abs);
      return { ok: true, abs, rel: normalizeRepoPath(candidate), buffer };
    }
  }
  return { ok: false, reason: "asset_missing", path };
}

function createFileBackedScope() {
  return {
    location: { origin: "https://r25d-static-llm.test" },
    fetch: async (url) => {
      const value = String(url || "");
      const parsed = value.startsWith("http") ? new URL(value).pathname : value;
      const rel = parsed.replace(/^\/+/, "");
      const asset = await readRepoAsset(rel);
      if (!asset.ok) return new Response("", { status: 404 });
      return new Response(asset.buffer, {
        status: 200,
        headers: {
          "content-length": String(asset.buffer.byteLength),
          "x-r25d-file": asset.rel
        }
      });
    }
  };
}

function createFileBackedTokenizerFetcher() {
  return async (file) => {
    const asset = await readRepoAsset(file.path);
    if (!asset.ok) return asset;
    const text = asset.buffer.toString("utf8");
    return {
      ok: true,
      path: asset.rel,
      text,
      json: JSON.parse(text),
      arrayBuffer: arrayBufferFromBuffer(asset.buffer)
    };
  };
}

async function findManifests() {
  const reports = [];
  for (const manifestPath of await discoverStaticLlmManifestPaths(ROOT)) {
    const manifest = await readStaticLlmManifest(manifestPath);
    const validation = await validateStaticLlmManifestFile(manifestPath, { root: ROOT });
    const admittedValidation = await validateStaticLlmManifestFile(manifestPath, { root: ROOT, admit: true });
    reports.push({
      path: manifestPath,
      rel: normalizeRepoPath(relative(ROOT, manifestPath)),
      manifest,
      validation,
      admitted: admittedValidation.ok && admittedValidation.admitted,
      fixture: validation.fixture
    });
  }
  return reports;
}

function outputHasForbiddenTrace(value = "") {
  return /chain[-_ ]?of[-_ ]?thought|hidden_prompt|system_prompt|private_memory|raw_private_data/i.test(String(value || ""));
}

export async function runStaticLlmFirstTokenSmoke() {
  const failures = [];
  const scope = createFileBackedScope();
  const manifests = await findManifests();
  const fixture = manifests.find((item) => item.fixture);
  const admitted = manifests.find((item) => item.admitted);

  const fixtureReport = {
    ok: false,
    first_token: "",
    backend: "fixture",
    model_id: "",
    tokenizer_ok: false,
    assets_verified: false
  };

  if (!fixture) {
    failures.push({ code: "fixture_manifest_missing" });
  } else {
    fixtureReport.model_id = fixture.manifest.model_id || "";
    const assets = await loadStaticLlmAssets(fixture.manifest, {
      scope,
      includeWeights: true,
      roles: ["tokenizer", "config", "weights"]
    });
    const tokenizerConfig = await loadTokenizerAndConfig(fixture.manifest, { scope });
    const tokenizerViaFetcher = await loadTokenizerFromManifest(fixture.manifest, createFileBackedTokenizerFetcher());
    const tokenizerValidation = validateTokenizerConfig(tokenizerConfig.tokenizer, tokenizerConfig.config);
    const tokenized = tokenizeForStaticLlm("browser static llm", tokenizerConfig.tokenizer || {});
    const backend = createStaticLlmBackend({
      manifest: fixture.manifest,
      capabilities: { wasm: { available: true }, webgpu: { available: false } }
    });
    const init = await backend.init({
      manifest: fixture.manifest,
      assets: assets.assets || [],
      tokenizer: tokenizerConfig.tokenizer,
      config: tokenizerConfig.config
    });
    const generated = await backend.generateFirstToken({ prompt: "browser static llm" });
    fixtureReport.ok = Boolean(
      assets.ok &&
        tokenizerConfig.ok &&
        tokenizerViaFetcher.ok &&
        tokenizerValidation.ok &&
        tokenized.ok &&
        init.ok &&
        generated.ok &&
        generated.token
    );
    fixtureReport.first_token = generated.token || "";
    fixtureReport.backend = generated.backend || "fixture";
    fixtureReport.tokenizer_ok = Boolean(tokenizerConfig.ok && tokenizerViaFetcher.ok && tokenized.ok);
    fixtureReport.assets_verified = Boolean(assets.ok);
    fixtureReport.metrics = backend.metrics();
    if (!fixtureReport.ok) {
      failures.push({
        code: "fixture_first_token_failed",
        assets_ok: assets.ok,
        tokenizer_config_ok: tokenizerConfig.ok,
        tokenizer_fetcher_ok: tokenizerViaFetcher.ok,
        init_ok: init.ok,
        generated
      });
    }
    if (outputHasForbiddenTrace(generated.text || generated.token || "")) {
      failures.push({ code: "fixture_output_contains_forbidden_trace_marker" });
    }
  }

  const productionReport = {
    attempted: false,
    skipped: true,
    reason: "no_admitted_static_llm_manifest",
    backend: "unavailable",
    model_id: "",
    first_token_ms: 0,
    first_token_observed: false
  };

  if (admitted) {
    productionReport.attempted = true;
    productionReport.skipped = false;
    productionReport.reason = "";
    productionReport.model_id = admitted.manifest.model_id || "";
    const headers = loadModelShardHeaders(admitted.manifest);
    const tokenizerConfig = await loadTokenizerAndConfig(admitted.manifest, { scope });
    const backend = createStaticLlmBackend({
      manifest: admitted.manifest,
      capabilities: { wasm: { available: true }, webgpu: { available: false } }
    });
    const init = await backend.init({
      manifest: admitted.manifest,
      assets: [],
      tokenizer: tokenizerConfig.tokenizer,
      config: tokenizerConfig.config
    });
    const generated = await backend.generateFirstToken({ prompt: "first token smoke" });
    productionReport.backend = generated.backend || backend.metrics().backend;
    productionReport.first_token_ms = Number(generated.firstTokenMs || backend.metrics().firstTokenMs || 0);
    productionReport.first_token_observed = Boolean(generated.ok && generated.token);
    productionReport.shard_headers_ok = headers.ok;
    productionReport.tokenizer_config_ok = tokenizerConfig.ok;
    productionReport.init_ok = init.ok;
    if (!headers.ok || !tokenizerConfig.ok || !init.ok || !productionReport.first_token_observed) {
      failures.push({
        code: "admitted_production_first_token_failed",
        headers_ok: headers.ok,
        tokenizer_config_ok: tokenizerConfig.ok,
        init_ok: init.ok,
        generated
      });
    }
  }

  for (const manifest of manifests) {
    for (const file of manifest.manifest.files || []) {
      const sameOrigin = validateSameOriginAssetUrl(file.path, scope);
      if (!sameOrigin.ok) failures.push({ code: "manifest_asset_not_same_origin", manifest: manifest.rel, path: file.path });
      if (/^(https?:)?\/\//i.test(String(file.path || ""))) failures.push({ code: "external_asset_url", manifest: manifest.rel, path: file.path });
    }
  }

  const report = {
    ok: failures.length === 0,
    fixture: fixtureReport,
    production: productionReport,
    policy: {
      same_origin_only: true,
      no_backend: true,
      no_external_storage: true
    },
    manifest_count: manifests.length,
    admitted_manifest_count: manifests.filter((item) => item.admitted).length,
    failures
  };
  return report;
}

async function main() {
  const report = await runStaticLlmFirstTokenSmoke();
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
