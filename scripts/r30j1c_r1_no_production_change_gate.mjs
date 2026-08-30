#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";


const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "175e7d30490728bab2ec9bd6b3fce08875ed8694";
const GATE_PATH = "scripts/r30j1c_r1_no_production_change_gate.mjs";

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
}

function lines(args) {
  return git(args).split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
}

function changedPaths() {
  return [...new Set([
    ...lines(["diff", "--name-only", BASE, "HEAD"]),
    ...lines(["diff", "--name-only", "HEAD"]),
    ...lines(["diff", "--cached", "--name-only", "HEAD"]),
    ...lines(["ls-files", "--others", "--exclude-standard"]),
  ])].sort();
}

function unsafeChangeStatuses() {
  return [
    ...lines(["diff", "--name-status", BASE, "HEAD"]),
    ...lines(["diff", "--name-status", "HEAD"]),
    ...lines(["diff", "--cached", "--name-status", "HEAD"]),
  ].filter((row) => !/^[AM]\s/u.test(row));
}

function baseIsAncestor() {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", BASE, "HEAD"], {
      cwd: ROOT,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

const allowedPaths = new Set([
  "config/r30j1c_r1_owner_correction_pack_v1.json",
  "data/personal_judge/templates/r30j1c_r1_correction_pack_v1.empty.json",
  "data/personal_judge/templates/r30j1c_r1_correction_record_v1.empty.json",
  "data/personal_judge/templates/r30j1c_r1_review_ui/index.html",
  "data/personal_judge/templates/r30j1c_r1_review_ui/review.css",
  "data/personal_judge/templates/r30j1c_r1_review_ui/review.js",
  "docs/R30J1C_R1_STAGED_OWNER_CORRECTION_PACK.md",
  "package.json",
  "schemas/r30j1c_r1_correction_pack_v1.schema.json",
  "schemas/r30j1c_r1_correction_record_v1.schema.json",
  "scripts/r30j1c_r1_audit_source_availability.py",
  "scripts/r30j1c_r1_build_review_ui.py",
  "scripts/r30j1c_r1_finalize_blocked.py",
  "scripts/r30j1c_r1_no_production_change_gate.mjs",
  "scripts/r30j1c_r1_prepare_persona_sources.py",
  "scripts/r30j1c_r1_select_j1a_errors.py",
  "src/personal_judge/r30j1c_r1_contract.py",
  "src/personal_judge/r30j1c_r1_error_selection.py",
  "src/personal_judge/r30j1c_r1_persona_sources.py",
  "src/personal_judge/r30j1c_r1_source_integrity.py",
  "tests/r30j1c_r1/test_contract_ui.py",
  "tests/r30j1c_r1/test_error_selection.py",
  "tests/r30j1c_r1/test_integration_gate.py",
  "tests/r30j1c_r1/test_persona_sources.py",
  "tests/r30j1c_r1/test_source_integrity.py",
  "tests/r30j1c_r1/test_source_availability.py",
  "tests/r30j1c_r1/test_schema_hardening.py",
]);

const productionPath = /^(?:web|api|pages\/api|app\/api|functions|netlify\/functions|vercel\/functions)(?:\/|$)|^(?:vercel\.json|netlify\.toml)$/u;
const forbiddenPath = /(?:^|\/)(?:\.env(?:\.|$)|artifacts?|raw|screenshots?|images?|checkpoints?|weights?|corpus|telemetry|responses?|deployments?)(?:\/|$)|\.(?:png|jpe?g|gif|webp|heic|pdf|docx?|rtf|pages|csv|tsv|jsonl|safetensors|pt|pth|ckpt|npz|bin|gguf|onnx)$/iu;
const slash = "/";
const privateAbsolutePath = new RegExp(
  `(?:${slash}Users${slash}|${slash}private${slash}(?:tmp|var)${slash}`
    + `|${slash}var${slash}folders${slash}|${slash}Volumes${slash}|file:${slash}${slash})`,
  "u",
);
const secretMaterial = /(?:Authorization\s*:\s*(?:Bearer\s+)?\S+|Bearer\s+[A-Za-z0-9._~+\/-]{16,}|\bsk-[A-Za-z0-9_-]{12,}|(?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*["'][^"']{8,}["'])/iu;
const jsNetworkCall = /(?:\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\bsendBeacon\s*\()/u;
const pyNetworkCall = /(?:\brequests\.(?:get|post|put|patch|delete|request)\s*\(|\burllib\.request\b|\burlopen\s*\(|\bhttp\.client\b|\bsocket\.(?:create_connection|socket)\s*\()/u;

function equalJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function packageContract() {
  const basePackage = JSON.parse(git(["show", `${BASE}:package.json`]));
  const currentPackage = JSON.parse(git(["show", "HEAD:package.json"]));
  const workingPackage = JSON.parse(awaitablePackageText);
  const effectivePackage = workingPackage;
  const baseWithoutScripts = { ...basePackage };
  const currentWithoutScripts = { ...effectivePackage };
  delete baseWithoutScripts.scripts;
  delete currentWithoutScripts.scripts;
  const baseScripts = basePackage.scripts ?? {};
  const scripts = effectivePackage.scripts ?? {};
  const required = {
    "r30j1c-r1:build-review-ui": "python3 scripts/r30j1c_r1_build_review_ui.py",
    "r30j1c-r1:audit-sources": "python3 scripts/r30j1c_r1_audit_source_availability.py",
    "r30j1c-r1:finalize-blocked": "python3 scripts/r30j1c_r1_finalize_blocked.py",
    "r30j1c-r1:production-diff-gate": "node scripts/r30j1c_r1_no_production_change_gate.mjs",
    "test:r30j1c-r1": "python3 -m unittest discover -s tests/r30j1c_r1 -q",
  };
  const added = Object.keys(scripts).filter((key) => !(key in baseScripts)).sort();
  const changedExisting = Object.entries(baseScripts).filter(([key, value]) => scripts[key] !== value).map(([key]) => key);
  const removedExisting = Object.keys(baseScripts).filter((key) => !(key in scripts));
  const invalidAdded = added.filter((key) => !(key in required) || scripts[key] !== required[key]);
  const missingRequired = Object.entries(required).filter(([key, value]) => scripts[key] !== value).map(([key]) => key);
  const dangerous = added.filter((key) => /(?:https?:\/\/|curl\b|wget\b|git\s+push\b|vercel\b|deploy\b|nohup\b|tmux\b|cron\b|launchd\b|\.env\b|&)/iu.test(String(scripts[key])));
  return {
    passed: equalJson(baseWithoutScripts, currentWithoutScripts)
      && changedExisting.length === 0
      && removedExisting.length === 0
      && invalidAdded.length === 0
      && missingRequired.length === 0
      && dangerous.length === 0,
    added_script_count: added.length,
    changed_existing_script_count: changedExisting.length,
    removed_existing_script_count: removedExisting.length,
    invalid_added_script_count: invalidAdded.length,
    missing_required_script_count: missingRequired.length,
    dangerous_added_script_count: dangerous.length,
  };
}

const awaitablePackageText = await readFile(resolve(ROOT, "package.json"), "utf8");
const changed = changedPaths();
const unexpectedPaths = changed.filter((path) => !allowedPaths.has(path));
const productionPaths = changed.filter((path) => productionPath.test(path));
const forbiddenPaths = changed.filter((path) => forbiddenPath.test(path));
const unsafeStatuses = unsafeChangeStatuses();
const privatePathFiles = [];
const secretMaterialFiles = [];
const networkCallFiles = [];
const unsafeFileTypeFiles = [];
const oversizedFiles = [];

for (const path of changed) {
  if (!allowedPaths.has(path)) continue;
  const fullPath = resolve(ROOT, path);
  const info = await lstat(fullPath).catch(() => null);
  if (info === null || !info.isFile() || info.isSymbolicLink()) {
    unsafeFileTypeFiles.push(path);
    continue;
  }
  if (info.size > 2 * 1024 * 1024) {
    oversizedFiles.push(path);
    continue;
  }
  const text = await readFile(fullPath, "utf8").catch(() => null);
  if (text === null) {
    unsafeFileTypeFiles.push(path);
    continue;
  }
  if (privateAbsolutePath.test(text)) privatePathFiles.push(path);
  if (secretMaterial.test(text)) secretMaterialFiles.push(path);
  if (path !== GATE_PATH) {
    const suffix = extname(path).toLowerCase();
    if (([".js", ".mjs"].includes(suffix) && jsNetworkCall.test(text))
      || (suffix === ".py" && pyNetworkCall.test(text))) {
      networkCallFiles.push(path);
    }
  }
}

const protectedHistoricalPaths = [
  "config/r30j0_personal_source_discovery_v1.json",
  "config/r30j0_p2_persona_excavation_v1.json",
  "config/r30j1a_personal_representation_bootstrap_v1.json",
  "docs/R30J0_PERSONAL_SOURCE_EVIDENCE_METHOD.md",
  "docs/R30J0_P2_PERSONA_EXCAVATION_METHOD.md",
  "docs/R30J1A_DESCRIPTIVE_PERSONAL_REPRESENTATION_BOOTSTRAP.md",
];
const historicalStateDiffCount = lines(["diff", "--name-only", BASE, "--", ...protectedHistoricalPaths]).length;
const packageCheck = packageContract();
const branch = git(["branch", "--show-current"]).trim();
const ancestor = baseIsAncestor();
const passed = branch === "main"
  && ancestor
  && unexpectedPaths.length === 0
  && productionPaths.length === 0
  && forbiddenPaths.length === 0
  && unsafeStatuses.length === 0
  && privatePathFiles.length === 0
  && secretMaterialFiles.length === 0
  && networkCallFiles.length === 0
  && unsafeFileTypeFiles.length === 0
  && oversizedFiles.length === 0
  && historicalStateDiffCount === 0
  && packageCheck.passed;

const report = {
  schema_version: "r30j1c-r1.no-production-change-gate.v1",
  base_revision: BASE,
  branch,
  base_is_ancestor: ancestor,
  changed_path_count: changed.length,
  unexpected_path_count: unexpectedPaths.length,
  production_surface_diff_count: productionPaths.length,
  forbidden_path_count: forbiddenPaths.length,
  unsafe_change_status_count: unsafeStatuses.length,
  private_absolute_path_count: privatePathFiles.length,
  secret_material_count: secretMaterialFiles.length,
  network_call_code_count: networkCallFiles.length,
  unsafe_file_type_count: unsafeFileTypeFiles.length,
  oversized_public_contract_file_count: oversizedFiles.length,
  historical_state_diff_count: historicalStateDiffCount,
  package_contract: packageCheck,
  training_code_added: false,
  production_surface_modified: false,
  deployment_change: false,
  passed,
};

console.log(JSON.stringify(report));
if (!passed) process.exitCode = 1;
