#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { checkHybridLabIsolation } from "./check_hybrid_lab_isolation.mjs";
import { checkStaticLocalProduct } from "./check_static_local_product_no_backend.mjs";
import { normalizeRepoPath } from "./static_llm_policy.mjs";

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LEGACY_GATE = "scripts/check_no_backend_llm_inference.mjs";

const ESTABLISHED_FINDINGS = new Set([
  "external_model_api_or_host_reference|docs/r27/R27A2_PUBLIC_CORPUS_METADATA_SUMMARY.md|e7eaa86ec9360ee0678c96cf4ad842ba0e028ce59f1841c8fb33f25c711a5b5c",
  "external_model_api_or_host_reference|docs/r27/R27A2_PUBLIC_CORPUS_METADATA_SUMMARY.md|cd30aa19a28a34959373298411e8ba12a979951c9b8030a9c3fce5a0ca23ec21",
  "external_model_api_or_host_reference|docs/r27/R27A2_PUBLIC_CORPUS_METADATA_SUMMARY.md|1cef5662f6cea16c889c7c2264abbe663e5e61226aad3fd058d82c0b09af065e",
  "external_model_api_or_host_reference|docs/r27/R27A2_PUBLIC_CORPUS_METADATA_SUMMARY.md|35052aefcd52d45e0913d47b8eeed73afbe72e78d2f1dcacb5ac5b46fad15fdb",
  "external_model_api_or_host_reference|docs/r27/R27A2_PUBLIC_CORPUS_METADATA_SUMMARY.md|10bc9a751f77f18b978aab99bac97ea5a53ac21edbc4ee25b676db6fdbcaba55",
  "external_storage_for_model_loading_reference|docs/r27/R27E0_48H_DEMO_RUNBOOK.md|ad0ad2654dbb94c905c649def1a1fa50de033315af809f2a9c05e29e0c955f51",
  "external_storage_for_model_loading_reference|docs/r28/R28P0B_CANDIDATE_BINDING.md|56a8cbb7d1d7af93db2a25479b007550c4d2d2d4ec2d5c9f3382ab0f35ad710d",
  "external_storage_for_model_loading_reference|docs/r28/R28RT1_MODEL_ARCHITECTURE.md|b193a87b9d1b7dfe5eb22239db928c76a69308368dd28d2b5ced5622f7f6e22e",
  "external_storage_for_model_loading_reference|docs/r28/R28SHIP2_BRANCH_RECONCILIATION.md|e4bae0cd703d7616df4ed228167b412b85d68d2be7a3b61bf673b77e1517e6a0",
  "external_storage_for_model_loading_reference|docs/r28/R28SURF5_WIDE_ANSWER_SURFACES.md|e160662fd030973ebb2fa46b1b550977707f2b635251e546d178116736f47380",
  "external_model_api_or_host_reference|tests/r28ux3/test_static_only_still_passes.ts|d76cf0f2174f5dfa63827fe9ab0f69ce098ce6b72aee0f28f45111e4b55aca23",
  "external_storage_for_model_loading_reference|web/another_brain_chat/q4_worker_runtime.js|f70fc11c8298d2ea138720f9e580f97735e4d5be070fc5d756f641f6564586db",
]);

function semanticHash(value) {
  return createHash("sha256").update(String(value || "").trim().replace(/\s+/g, " ").toLowerCase()).digest("hex");
}

async function runEstablishedGate() {
  let stdout = "";
  let exitCode = 0;
  try {
    ({ stdout } = await execFileAsync("node", [LEGACY_GATE], { cwd: ROOT, maxBuffer: 20 * 1024 * 1024 }));
  } catch (error) {
    stdout = String(error.stdout || "");
    exitCode = Number(error.code || 2);
  }
  const raw = JSON.parse(stdout);
  const findings = [];
  for (const item of raw.failures || []) {
    const path = normalizeRepoPath(item.path);
    const source = await readFile(resolve(ROOT, path), "utf8").catch(() => "");
    const line = item.line ? source.split(/\r?\n/)[item.line - 1] || "" : item.code;
    const identity = `${item.code}|${path}|${semanticHash(line)}`;
    findings.push({
      gate: "check:no-backend-llm:legacy-full-repository",
      code: item.code,
      normalized_path: path,
      semantic_source_line_hash: semanticHash(line),
      identity,
      classification: ESTABLISHED_FINDINGS.has(identity) ? "PRE_EXISTING_UNCHANGED" : "REAL_PRODUCTION_SURFACE_RISK",
    });
  }
  return { exit_code: exitCode, raw, findings };
}

const legacy = await runEstablishedGate();
const staticProduct = await checkStaticLocalProduct();
const hybridLab = await checkHybridLabIsolation();
const current = new Set(legacy.findings.map((item) => item.identity));
const unexpected = legacy.findings.filter((item) => !ESTABLISHED_FINDINGS.has(item.identity));
const resolved = [...ESTABLISHED_FINDINGS].filter((identity) => !current.has(identity));
const passed = unexpected.length === 0 && staticProduct.ok && hybridLab.ok;
const report = {
  ok: passed,
  profile: "static_local_product_with_explicit_hybrid_lab",
  established_full_repository_gate_replayed: true,
  legacy_gate_exit_code: legacy.exit_code,
  legacy_failure_count: legacy.findings.length,
  pre_existing_unchanged_count: legacy.findings.length - unexpected.length,
  resolved_by_r4h_count: resolved.length,
  introduced_or_changed_failure_count: unexpected.length,
  legacy_findings: legacy.findings,
  resolved_identities: resolved,
  introduced_or_changed_findings: unexpected,
  static_local_product: staticProduct,
  hybrid_lab: hybridLab,
};
console.log(JSON.stringify(report, null, 2));
if (!passed) process.exitCode = 2;
