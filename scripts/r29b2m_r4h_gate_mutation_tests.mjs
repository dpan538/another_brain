#!/usr/bin/env node

import assert from "node:assert/strict";
import { constants as fsConstants } from "node:fs";
import { copyFile, mkdir, mkdtemp, open, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { evaluateHybridIsolation } from "./check_hybrid_lab_isolation.mjs";
import { classifyTrackedModelWeights } from "./model_weight_gate_policy.mjs";
import { APPROVAL_PATH, R28M1_ASSET_ROOT, validateR28M1ExactCompatibility } from "./r28m1_exact_legacy_approval.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const approval = JSON.parse(await readFile(resolve(ROOT, APPROVAL_PATH), "utf8"));
const exact = approval.exact_compatibility;
const exactFiles = [
  ...exact.shards,
  exact.runtime_tokenizer,
  exact.tokenizer_metadata,
  exact.model_config,
  exact.quantization_manifest,
  exact.checksum_manifest,
  exact.admitted_manifest,
];
const exactShardPaths = exact.shards.map((entry) => entry.path);

async function fixtureRoot() {
  const root = await mkdtemp(join(tmpdir(), "r29b2m-r4h-r28m1-"));
  await mkdir(resolve(root, dirname(APPROVAL_PATH)), { recursive: true });
  await copyFile(resolve(ROOT, APPROVAL_PATH), resolve(root, APPROVAL_PATH));
  for (const entry of exactFiles) {
    const target = resolve(root, entry.path);
    await mkdir(dirname(target), { recursive: true });
    await symlink(resolve(ROOT, entry.path), target);
  }
  return root;
}

function basePolicy() {
  return {
    profile: "hybrid_lab",
    production: false,
    listener_host: "127.0.0.1",
    public_fixture_path: "evals/r29b2m_hybrid_product_v1/cases.jsonl",
    maximum_total_requests: 90,
    maximum_input_tokens: 300000,
    maximum_output_tokens: 30000,
    maximum_estimated_cost_cny: 5,
    concurrency: 1,
    allow_private_user_messages: false,
    allow_arbitrary_manual_prompt: false,
    allow_dynamic_internet_input: false,
    allow_production_route: false,
    allow_production_import: false,
    allow_production_build_copy: false,
    allow_browser_key: false,
    allow_deployment: false,
  };
}

function labEntries(proxyHost = "127.0.0.1") {
  return [
    { path: "package.json", text: JSON.stringify({ scripts: { build: "node build.mjs", "build:vercel": "node build.mjs" } }) },
    { path: "scripts/r29b2m_r4h_local_proxy.mjs", text: `const HOST='${proxyHost}'; const fixtureMap=new Map(); throw new Error('public_fixture_id_required'); server.listen(PORT, HOST);` },
    { path: "src/hybrid_runtime/live_deepseek_adapter.ts", text: "if (typeof window !== 'undefined') throw new Error(); const key=process.env.DEEPSEEK_API_KEY;" },
  ];
}

const results = [];
async function check(name, task) {
  await task();
  results.push({ name, passed: true });
}

await check("exact_current_r28m1_passes", async () => {
  const report = await validateR28M1ExactCompatibility({ root: ROOT, trackedModelLikeFiles: exactShardPaths });
  assert.equal(report.ok, true, JSON.stringify(report.failures));
});

await check("one_byte_weight_mutation_fails", async () => {
  const root = await fixtureRoot();
  try {
    const path = resolve(root, exact.shards[0].path);
    await rm(path);
    await copyFile(resolve(ROOT, exact.shards[0].path), path, fsConstants.COPYFILE_FICLONE);
    const handle = await open(path, "r+");
    try {
      const byte = Buffer.alloc(1);
      await handle.read(byte, 0, 1, 0);
      byte[0] ^= 1;
      await handle.write(byte, 0, 1, 0);
    } finally {
      await handle.close();
    }
    const report = await validateR28M1ExactCompatibility({ root, trackedModelLikeFiles: exactShardPaths });
    assert.equal(report.ok, false);
    assert.ok(report.failures.some((failure) => failure.code === "exact_sha256_mismatch"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

await check("sixth_shard_fails", async () => {
  const root = await fixtureRoot();
  try {
    const sixth = `${R28M1_ASSET_ROOT}shards/model-q4-00006.bin`;
    await writeFile(resolve(root, sixth), Buffer.from([0]));
    const report = await validateR28M1ExactCompatibility({ root, trackedModelLikeFiles: [...exactShardPaths, sixth] });
    assert.equal(report.ok, false);
    assert.ok(report.failures.some((failure) => failure.code === "unexpected_or_missing_r28m1_shard"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const admitted = new Set(exactShardPaths);
const exactSet = new Set(exactShardPaths);
for (const [name, path] of [
  ["new_model_path_fails", "web/another_brain/model_assets/new/model.bin"],
  ["r3_safetensors_staged_fails", "artifacts/r29b2m_r3/checkpoints/stage_a_080k/model.safetensors"],
  ["future_q4v2_fails", "web/another_brain/model_assets/r29b2m_q4v2/shards/model-q4-00001.bin"],
]) {
  await check(name, async () => {
    const failures = classifyTrackedModelWeights({
      trackedModelLikeFiles: [...exactShardPaths, path],
      admittedAssetPaths: admitted,
      exactLegacyPaths: exactSet,
      r28m1ExactApproved: true,
      generalApprovalPresent: false,
    });
    assert.ok(failures.some((failure) => failure.path === path));
  });
}

await check("production_deepseek_route_fails", async () => {
  const report = evaluateHybridIsolation([...labEntries(), { path: "api/deepseek.ts", text: "const serverKey = DEEPSEEK_API_KEY; export async function POST() {}" }], basePolicy());
  assert.equal(report.ok, false);
  assert.ok(report.failures.some((failure) => failure.code === "production_surface_imports_or_exposes_hybrid_lab"));
});

await check("browser_side_secret_fails", async () => {
  const report = evaluateHybridIsolation([...labEntries(), { path: "web/app.js", text: "const key = DEEPSEEK_API_KEY;" }], basePolicy());
  assert.equal(report.ok, false);
  assert.ok(report.failures.some((failure) => failure.code === "browser_side_secret"));
});

await check("production_import_of_lab_adapter_fails", async () => {
  const report = evaluateHybridIsolation([...labEntries(), { path: "web/app.js", text: "import x from '../src/hybrid_runtime/live_deepseek_adapter.ts';" }], basePolicy());
  assert.equal(report.ok, false);
  assert.ok(report.failures.some((failure) => failure.code === "production_surface_imports_or_exposes_hybrid_lab"));
});

await check("loopback_lab_passes", async () => {
  assert.equal(evaluateHybridIsolation(labEntries(), basePolicy()).ok, true);
});

await check("public_listener_fails", async () => {
  const report = evaluateHybridIsolation(labEntries("0.0.0.0"), basePolicy());
  assert.equal(report.ok, false);
  assert.ok(report.failures.some((failure) => failure.code === "hybrid_lab_public_listener"));
});

await check("missing_spending_guard_fails", async () => {
  const policy = basePolicy();
  delete policy.maximum_estimated_cost_cny;
  const report = evaluateHybridIsolation(labEntries(), policy);
  assert.equal(report.ok, false);
  assert.ok(report.failures.some((failure) => failure.code === "hybrid_policy_mismatch:maximum_estimated_cost_cny"));
});

await check("missing_request_cap_fails", async () => {
  const policy = basePolicy();
  delete policy.maximum_total_requests;
  const report = evaluateHybridIsolation(labEntries(), policy);
  assert.equal(report.ok, false);
  assert.ok(report.failures.some((failure) => failure.code === "hybrid_policy_mismatch:maximum_total_requests"));
});

console.log(JSON.stringify({ passed: results.length === 13, case_count: results.length, results }, null, 2));
