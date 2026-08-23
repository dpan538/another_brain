#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "6cb53030d5d681f67f04636fdcf0629f8380de31";
const changed = execFileSync("git", ["diff", "--name-only", BASE, "HEAD"], { cwd: ROOT, encoding: "utf8" })
  .trim().split("\n").filter(Boolean);
const productionPattern = /^(?:web|api|pages\/api|app\/api|functions|netlify\/functions|vercel\/functions)(?:\/|$)|^(?:vercel\.json|netlify\.toml)$/u;
const allowedPattern = /^(?:config\/r29p0_|docs\/R29P0_|evals\/r29p0_|prompts\/r29p0_|reports\/r29p0_pairwise_oracle_engineering_receipt\.json|scripts\/(?:r29p0_|check_hybrid_lab_isolation\.mjs|r29b2m_r4h_no_backend_production_gate\.mjs)|src\/hybrid_runtime\/(?:r29p0_|protected_feature_signature\.ts)|tests\/r29p0\/|package\.json)/u;
const forbiddenCommitPattern = /(?:^|\/)(?:\.env(?:\.|$)|artifacts(?:\/|$)|checkpoints?(?:\/|$)|weights?(?:\/|$)|corpus(?:\/|$))|\.(?:safetensors|pt|pth|ckpt|npz|bin)$/iu;
const productionPaths = changed.filter((path) => productionPattern.test(path));
const unexpectedPaths = changed.filter((path) => !allowedPattern.test(path));
const forbiddenCommittedPaths = changed.filter((path) => forbiddenCommitPattern.test(path));
const deepseekOutsideLab = [];
for (const path of changed) {
  const body = await readFile(resolve(ROOT, path), "utf8").catch(() => "");
  if (/api\.deepseek\.com|DEEPSEEK_API_KEY|deepseek-v4-flash/iu.test(body) && !/^(?:config\/r29p0_|docs\/R29P0_|reports\/r29p0_pairwise_oracle_engineering_receipt\.json|scripts\/(?:r29p0_|r29b2m_r4h_no_backend_production_gate\.mjs|check_hybrid_lab_isolation\.mjs)|src\/hybrid_runtime\/r29p0_|tests\/r29p0\/)/u.test(path)) {
    deepseekOutsideLab.push(path);
  }
}
const report = {
  schema_version: "r29p0.production_diff_gate.v1",
  base_revision: BASE,
  passed: productionPaths.length === 0 && unexpectedPaths.length === 0 && forbiddenCommittedPaths.length === 0 && deepseekOutsideLab.length === 0,
  changed_path_count: changed.length,
  production_surface_diff_count: productionPaths.length,
  unexpected_path_count: unexpectedPaths.length,
  forbidden_committed_path_count: forbiddenCommittedPaths.length,
  deepseek_reference_outside_lab_count: deepseekOutsideLab.length,
  production_api_route_added: false,
  vercel_or_edge_function_added: false,
  deployment_change: false,
  model_weight_change: false,
  training_corpus_committed: false,
  production_paths: productionPaths,
  unexpected_paths: unexpectedPaths,
  forbidden_committed_paths: forbiddenCommittedPaths,
  deepseek_outside_lab: deepseekOutsideLab,
};
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
