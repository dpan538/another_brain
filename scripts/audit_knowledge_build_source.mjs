#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

import { ROOT } from "./r18_utils.mjs";

const SOURCE = "build_sources/knowledge/knowledge_base.generated.js";
const SOURCE_OF_TRUTH = "knowledge_sources/registry.json";
const OLD_WEB_SOURCE = "web/knowledge_base.generated.js";
const SHARD_MANIFEST = "web/knowledge_shards/manifest.json";
const SHARD_ROUTING = "web/knowledge_shards/routing.json";

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const child = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(child)));
    else out.push(child);
  }
  return out;
}

function inReleaseFileSet(rel) {
  const result = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", rel], {
    cwd: ROOT,
    encoding: "utf8"
  });
  return result.status === 0 && result.stdout.split(/\r?\n/).includes(rel);
}

function runRoundtripCheck() {
  const result = spawnSync("python3", ["scripts/validate_knowledge_source_roundtrip.py"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  });
  return result.status === 0;
}

function vercelExcludes(text, rel) {
  return text.split(/\r?\n/).some((line) => line.trim() === rel);
}

async function readJson(rel) {
  try {
    return JSON.parse(await readFile(resolve(ROOT, rel), "utf8"));
  } catch {
    return {};
  }
}

async function runtimeImportsMonolith() {
  const failures = [];
  const files = (await walk(resolve(ROOT, "web"))).filter((file) => extname(file) === ".js");
  for (const file of files) {
    const rel = relative(ROOT, file);
    const text = await readFile(file, "utf8");
    if (/knowledge_base\.generated\.js/.test(text)) failures.push(rel);
  }
  return failures;
}

async function main() {
  const sourceExists = await exists(resolve(ROOT, SOURCE));
  const sourceOfTruthExists = await exists(resolve(ROOT, SOURCE_OF_TRUTH));
  const oldWebSourceExists = await exists(resolve(ROOT, OLD_WEB_SOURCE));
  const source_is_tracked = sourceExists && inReleaseFileSet(SOURCE);
  const source_of_truth_tracked = sourceOfTruthExists && inReleaseFileSet(SOURCE_OF_TRUTH);
  const vercelIgnore = await readFile(resolve(ROOT, ".vercelignore"), "utf8");
  const vercelExcludesOld = vercelExcludes(vercelIgnore, OLD_WEB_SOURCE);
  const runtimeImportFiles = await runtimeImportsMonolith();
  const manifest = await readJson(SHARD_MANIFEST);
  const routing = await readJson(SHARD_ROUTING);
  const manifestSourceOk = manifest.source?.path === SOURCE;
  const routingSourceOk = routing.source_path === SOURCE;
  const sourceRoundtripOk = runRoundtripCheck();
  const risks = [];

  if (!sourceExists) risks.push("knowledge build source is missing");
  if (!sourceOfTruthExists) risks.push("knowledge source-of-truth registry is missing");
  if (!source_is_tracked) risks.push("knowledge build source is not in the git release file set");
  if (!source_of_truth_tracked) risks.push("knowledge source-of-truth registry is not in the git release file set");
  if (oldWebSourceExists) risks.push("old web/knowledge_base.generated.js still exists");
  if (runtimeImportFiles.length) risks.push(`public runtime imports monolith: ${runtimeImportFiles.join(", ")}`);
  if (!manifestSourceOk) risks.push(`manifest source path is stale: ${manifest.source?.path || ""}`);
  if (!routingSourceOk) risks.push(`routing source path is stale: ${routing.source_path || ""}`);
  if (!sourceRoundtripOk) risks.push("knowledge source roundtrip check failed");

  const report = {
    ok: risks.length === 0,
    current_source_path: SOURCE,
    source_of_truth: SOURCE_OF_TRUTH,
    generated_build_source: SOURCE,
    source_is_tracked,
    source_of_truth_tracked,
    generated_build_source_tracked: source_is_tracked,
    source_is_deployable: false,
    runtime_imports_monolith: runtimeImportFiles.length > 0,
    runtime_import_files: runtimeImportFiles,
    vercel_excludes_monolith: vercelExcludesOld || "not_needed",
    old_web_source_exists: oldWebSourceExists,
    migration_complete: sourceExists && source_is_tracked && source_of_truth_tracked && !oldWebSourceExists && manifestSourceOk && routingSourceOk,
    clean_checkout_supported: sourceOfTruthExists && source_of_truth_tracked,
    source_roundtrip_ok: sourceRoundtripOk,
    recommended_target_path: SOURCE,
    migration_safe_now: true,
    required_script_changes: [],
    risks
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
