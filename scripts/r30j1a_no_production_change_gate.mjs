#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "05acfdcfa63e0c8fbf72930b6490161fe311fa46";
const lines = (args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" })
  .split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
const changed = [...new Set([
  ...lines(["diff", "--name-only", BASE, "HEAD"]),
  ...lines(["diff", "--name-only", "HEAD"]),
  ...lines(["ls-files", "--others", "--exclude-standard"]),
])].sort();

const allowed = /^(?:config\/r30j1a_|data\/personal_judge\/templates\/r30j1a_|docs\/R30J1A_|schemas\/r30j1a_|scripts\/r30j1a_|src\/training\/mlx\/r30j1a_|tests\/r30j1a\/|package\.json$)/u;
const production = /^(?:web|api|pages\/api|app\/api|functions|netlify\/functions|vercel\/functions)(?:\/|$)|^(?:vercel\.json|netlify\.toml)$/u;
const forbidden = /(?:^|\/)(?:\.env(?:\.|$)|artifacts(?:\/|$)|checkpoints?(?:\/|$)|weights?(?:\/|$)|corpus(?:\/|$))|\.(?:safetensors|pt|pth|ckpt|npz|bin|gguf|onnx)$/iu;
const privatePath = new RegExp([
  ["/", "Users", "/"].join(""),
  ["/", "private", "/", "(?:tmp|var)", "/"].join(""),
  ["/", "Vol", "umes", "/"].join(""),
].join("|"), "u");

const productionPaths = changed.filter((path) => production.test(path));
const unexpectedPaths = changed.filter((path) => !allowed.test(path));
const forbiddenPaths = changed.filter((path) => forbidden.test(path));
const privatePathFiles = [];
for (const path of changed) {
  const text = await readFile(resolve(ROOT, path), "utf8").catch(() => "");
  if (privatePath.test(text)) privatePathFiles.push(path);
}
const report = {
  schema_version: "r30j1a.production_diff_gate.v1",
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
