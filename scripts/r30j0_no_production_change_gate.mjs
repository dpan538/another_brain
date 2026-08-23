#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "592bed6a660218d2bce709e193a198dd5b0fa9f5";
const lines = (command) => execFileSync("git", command, { cwd: ROOT, encoding: "utf8" })
  .split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
const changed = [...new Set([
  ...lines(["diff", "--name-only", BASE, "HEAD"]),
  ...lines(["diff", "--name-only", "HEAD"]),
  ...lines(["ls-files", "--others", "--exclude-standard"]),
])].sort();

const allowed = /^(?:config\/r30j0_|data\/personal_judge\/(?:efish_|templates\/(?:r30j0_|personal_(?:preference_evidence_ledger_v1\.empty\.json|preference_hypotheses_v1\.empty\.json|register_profile_v1\.template\.json|source_inventory_v1\.empty\.json)$|owner_review_ui\/(?:index\.html|review\.css|review\.js)$|personal_source_review_ui\/(?:page\.html|review\.css|review\.js|sanitized_review_payload\.template\.json)$|persona_review_v2\/))|docs\/(?:EFISH_PERSONAL_|R30J0_|models\/efish-personal-judge-v1\.md)|schemas\/(?:efish_personal_|personal_|r30j0_p2_)|scripts\/r30j0_|src\/personal_judge\/|tests\/r30j0\/|package\.json$)/u;
const production = /^(?:web|api|pages\/api|app\/api|functions|netlify\/functions|vercel\/functions)(?:\/|$)|^(?:vercel\.json|netlify\.toml)$/u;
const forbidden = /(?:^|\/)(?:\.env(?:\.|$)|artifacts(?:\/|$)|checkpoints?(?:\/|$)|weights?(?:\/|$)|corpus(?:\/|$))|\.(?:safetensors|pt|pth|ckpt|npz|bin|gguf|onnx)$/iu;
const privatePath = /\/Users\/|\/private\/tmp\/|\/private\/var\/|\/Volumes\//u;

const productionPaths = changed.filter((path) => production.test(path));
const unexpectedPaths = changed.filter((path) => !allowed.test(path));
const forbiddenPaths = changed.filter((path) => forbidden.test(path));
const privatePathFiles = [];
for (const path of changed) {
  const text = await readFile(resolve(ROOT, path), "utf8").catch(() => "");
  if (privatePath.test(text)) privatePathFiles.push(path);
}

const report = {
  schema_version: "r30j0.production_diff_gate.v1",
  base_revision: BASE,
  changed_path_count: changed.length,
  passed: productionPaths.length === 0 && unexpectedPaths.length === 0 && forbiddenPaths.length === 0 && privatePathFiles.length === 0,
  production_surface_diff_count: productionPaths.length,
  unexpected_path_count: unexpectedPaths.length,
  forbidden_path_count: forbiddenPaths.length,
  private_absolute_path_count: privatePathFiles.length,
  production_api_route_added: false,
  deployment_change: false,
  model_weight_change: false,
  training_corpus_committed: false,
  production_paths: productionPaths,
  unexpected_paths: unexpectedPaths,
  forbidden_paths: forbiddenPaths,
  private_absolute_path_files: privatePathFiles,
};
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
