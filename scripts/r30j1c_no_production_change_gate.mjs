#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "76c1b3f44b7967bf1ae6ad7ca26c8e28ff1cd74e";

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
}

function lines(args) {
  return git(args)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
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
  const rows = [
    ...lines(["diff", "--name-status", BASE, "HEAD"]),
    ...lines(["diff", "--name-status", "HEAD"]),
    ...lines(["diff", "--cached", "--name-status", "HEAD"]),
  ];
  return rows.filter((row) => !/^[AM]\s/u.test(row));
}

const allowedPaths = new Set([
  "config/r30j1c_manual_owner_evidence_intake_v1.json",
  "data/personal_judge/templates/r30j1c_manual_owner_evidence_source_v1.empty.json",
  "data/personal_judge/templates/r30j1c_owner_correction_item_v1.empty.json",
  "docs/R30J1C_MANUAL_OWNER_EVIDENCE_METHOD.md",
  "package.json",
  "schemas/r30j1c_manual_owner_evidence_source_v1.schema.json",
  "schemas/r30j1c_owner_correction_item_v1.schema.json",
  "scripts/r30j1c_ingest_manual_owner_evidence.py",
  "scripts/r30j1c_no_production_change_gate.mjs",
  "src/personal_judge/r30j1c_manual_evidence_contract.py",
  "tests/r30j1c/__init__.py",
  "tests/r30j1c/test_contract.py",
  "tests/r30j1c/test_ingestion.py",
  "tests/r30j1c/test_integration_gate.py",
]);
const productionPath = /^(?:web|api|pages\/api|app\/api|functions|netlify\/functions|vercel\/functions)(?:\/|$)|^(?:vercel\.json|netlify\.toml)$/u;
const forbiddenPath = /(?:^|\/)(?:\.env(?:\.|$)|artifacts?|raw|screenshots?|images?|checkpoints?|weights?|corpus|telemetry|responses?|deployments?)(?:\/|$)|\.(?:png|jpe?g|gif|webp|heic|pdf|docx?|rtf|pages|csv|tsv|jsonl|safetensors|pt|pth|ckpt|npz|bin|gguf|onnx)$/iu;
const privateAbsolutePath = /(?:\/Users\/|\/private\/(?:tmp|var)\/|\/var\/folders\/|\/Volumes\/|file:\/\/)/u;
const secretMaterial = /(?:Authorization\s*:\s*(?:Bearer\s+)?\S+|Bearer\s+[A-Za-z0-9._~+\/-]{16,}|\bsk-[A-Za-z0-9_-]{12,}|(?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*["'][^"']{8,}["'])/iu;
const networkCall = /(?:\bfetch\s*\(|\baxios\.|\brequests\.(?:get|post|put|patch|delete|request)\s*\(|\burllib\.request\b|\burlopen\s*\(|\bhttp\.client\b|\bhttps?\.request\s*\(|\bsocket\.(?:create_connection|socket)\s*\()/u;
const nulByte = /\u0000/u;

function assertBaseIsAncestor() {
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

function parseBasePackage() {
  return JSON.parse(git(["show", `${BASE}:package.json`]));
}

function equalJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function packageContract(basePackage, currentPackage) {
  const baseWithoutScripts = { ...basePackage };
  const currentWithoutScripts = { ...currentPackage };
  delete baseWithoutScripts.scripts;
  delete currentWithoutScripts.scripts;

  const baseScripts = basePackage.scripts ?? {};
  const currentScripts = currentPackage.scripts ?? {};
  const changedExisting = Object.entries(baseScripts)
    .filter(([key, value]) => currentScripts[key] !== value)
    .map(([key]) => key);
  const removedExisting = Object.keys(baseScripts).filter((key) => !(key in currentScripts));
  const added = Object.keys(currentScripts).filter((key) => !(key in baseScripts)).sort();
  const allowedAdditions = {
    "r30j1c:intake-manual-owner-evidence": "python3 scripts/r30j1c_ingest_manual_owner_evidence.py --input artifacts/r30j1c/manual_owner_evidence/current/source_record.input.json --image-map artifacts/r30j1c/manual_owner_evidence/current/screenshot_source_map.json --output artifacts/r30j1c/manual_owner_evidence/current",
    "r30j1c:production-diff-gate": "node scripts/r30j1c_no_production_change_gate.mjs",
    "test:r30j1c": "python3 -m unittest discover -s tests/r30j1c -q",
  };
  const invalidAddedNames = added.filter((key) => !(key in allowedAdditions));
  const invalidAddedCommands = added.filter((key) => currentScripts[key] !== allowedAdditions[key]);
  const missingRequiredNames = Object.keys(allowedAdditions).filter((key) => currentScripts[key] !== allowedAdditions[key]);
  const dangerousCommand = /(?:https?:\/\/|curl\b|wget\b|git\s+push\b|vercel\b|deploy\b|nohup\b|tmux\b|cron\b|launchd\b|\.env\b|&)/iu;
  const dangerousAddedCommands = added.filter((key) => dangerousCommand.test(String(currentScripts[key])));

  return {
    passed: equalJson(baseWithoutScripts, currentWithoutScripts)
      && changedExisting.length === 0
      && removedExisting.length === 0
      && invalidAddedNames.length === 0
      && invalidAddedCommands.length === 0
      && missingRequiredNames.length === 0
      && dangerousAddedCommands.length === 0,
    added_script_count: added.length,
    changed_existing_script_count: changedExisting.length,
    removed_existing_script_count: removedExisting.length,
    invalid_added_script_name_count: invalidAddedNames.length,
    invalid_added_script_command_count: invalidAddedCommands.length,
    missing_required_script_count: missingRequiredNames.length,
    dangerous_added_script_command_count: dangerousAddedCommands.length,
    non_script_package_change: !equalJson(baseWithoutScripts, currentWithoutScripts),
  };
}

const changed = changedPaths();
const baseIsAncestor = assertBaseIsAncestor();
const unexpectedPaths = changed.filter((path) => !allowedPaths.has(path));
const productionPaths = changed.filter((path) => productionPath.test(path));
const forbiddenPaths = changed.filter((path) => forbiddenPath.test(path));
const unsafeStatuses = unsafeChangeStatuses();
const privatePathFiles = [];
const secretMaterialFiles = [];
const networkCallFiles = [];
const nonTextFiles = [];
const unsafeFileTypeFiles = [];
const oversizedFiles = [];

for (const path of changed) {
  if (!allowedPaths.has(path)) continue;
  const info = await lstat(resolve(ROOT, path)).catch(() => null);
  if (info === null || !info.isFile() || info.isSymbolicLink()) {
    unsafeFileTypeFiles.push(path);
    continue;
  }
  if (info.size > 2 * 1024 * 1024) {
    oversizedFiles.push(path);
    continue;
  }
  const content = await readFile(resolve(ROOT, path)).catch(() => null);
  if (content === null) {
    nonTextFiles.push(path);
    continue;
  }
  const text = content.toString("utf8");
  if (nulByte.test(text)) nonTextFiles.push(path);
  if (privateAbsolutePath.test(text)) privatePathFiles.push(path);
  if (secretMaterial.test(text)) secretMaterialFiles.push(path);
  if (networkCall.test(text)) networkCallFiles.push(path);
}

const packageCheck = packageContract(
  parseBasePackage(),
  JSON.parse(await readFile(resolve(ROOT, "package.json"), "utf8")),
);

const passed = baseIsAncestor
  && unexpectedPaths.length === 0
  && productionPaths.length === 0
  && forbiddenPaths.length === 0
  && unsafeStatuses.length === 0
  && privatePathFiles.length === 0
  && secretMaterialFiles.length === 0
  && networkCallFiles.length === 0
  && nonTextFiles.length === 0
  && unsafeFileTypeFiles.length === 0
  && oversizedFiles.length === 0
  && packageCheck.passed;

const rawArtifactDetected = forbiddenPaths.some((path) =>
  /(?:^|\/)(?:artifacts?|raw|screenshots?|images?|responses?)(?:\/|$)|\.(?:png|jpe?g|gif|webp|heic|pdf|docx?|rtf|pages|csv|tsv|jsonl)$/iu.test(path));
const modelWeightDetected = forbiddenPaths.some((path) =>
  /(?:^|\/)(?:checkpoints?|weights?)(?:\/|$)|\.(?:safetensors|pt|pth|ckpt|npz|bin|gguf|onnx)$/iu.test(path));
const corpusDetected = forbiddenPaths.some((path) => /(?:^|\/)corpus(?:\/|$)/iu.test(path));
const deploymentDetected = changed.some((path) =>
  /^(?:vercel\.json|netlify\.toml|vercel\/functions|netlify\/functions)(?:\/|$)/u.test(path));

const report = {
  schema_version: "r30j1c.production_diff_gate.v1",
  base_revision: BASE,
  base_is_ancestor: baseIsAncestor,
  passed,
  changed_path_count: changed.length,
  allowed_public_safe_path_count: changed.length - unexpectedPaths.length,
  unexpected_path_count: unexpectedPaths.length,
  production_surface_diff_count: productionPaths.length,
  forbidden_path_count: forbiddenPaths.length,
  unsafe_change_status_count: unsafeStatuses.length,
  private_absolute_path_count: privatePathFiles.length,
  secret_material_count: secretMaterialFiles.length,
  network_call_code_count: networkCallFiles.length,
  non_text_or_missing_allowed_file_count: nonTextFiles.length,
  unsafe_file_type_count: unsafeFileTypeFiles.length,
  oversized_public_contract_file_count: oversizedFiles.length,
  package_contract: packageCheck,
  raw_personal_artifact_committed: rawArtifactDetected,
  production_api_route_added: productionPaths.length > 0,
  deployment_change: deploymentDetected,
  model_weight_change: modelWeightDetected,
  training_corpus_committed: corpusDetected,
  changed_public_safe_paths: passed ? changed : [],
};

console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
