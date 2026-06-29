#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { ROOT } from "./r18_utils.mjs";

const BUILD_SOURCE = "build_sources/knowledge/knowledge_base.generated.js";
const SOURCE_ROOT = "knowledge_sources";
const REGISTRY = "knowledge_sources/registry.json";
const OLD_WEB_SOURCE = "web/knowledge_base.generated.js";

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

async function readJson(rel) {
  try {
    return JSON.parse(await readFile(resolve(ROOT, rel), "utf8"));
  } catch {
    return {};
  }
}

function inReleaseFileSet(rel) {
  const result = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", rel], {
    cwd: ROOT,
    encoding: "utf8"
  });
  return result.status === 0 && result.stdout.split(/\r?\n/).includes(rel);
}

async function runtimeImportsMonolith() {
  const files = (await walk(resolve(ROOT, "web"))).filter((file) => file.endsWith(".js"));
  const matches = [];
  for (const file of files) {
    const rel = relative(ROOT, file);
    const text = await readFile(file, "utf8");
    if (/knowledge_base\.generated\.js/.test(text)) matches.push(rel);
  }
  return matches;
}

async function main() {
  const risks = [];
  const buildSourcePath = resolve(ROOT, BUILD_SOURCE);
  const registry = await readJson(REGISTRY);
  const buildScript = await readFile(resolve(ROOT, "scripts/build_knowledge_base.py"), "utf8");
  const sourceFiles = (registry.sources || []).map((source) => `knowledge_sources/${source.path}`);
  let reviewableBytes = 0;
  let largestSourceBytes = 0;
  for (const rel of [REGISTRY, "knowledge_sources/schema.json", ...sourceFiles]) {
    if (!(await exists(resolve(ROOT, rel)))) {
      risks.push(`missing_reviewable_source:${rel}`);
      continue;
    }
    const bytes = (await stat(resolve(ROOT, rel))).size;
    reviewableBytes += bytes;
    largestSourceBytes = Math.max(largestSourceBytes, bytes);
  }

  const buildSourceExists = await exists(buildSourcePath);
  const build_source_bytes = buildSourceExists ? (await stat(buildSourcePath)).size : 0;
  const runtimeImportFiles = await runtimeImportsMonolith();
  const reviewable_sources_exist = sourceFiles.length > 0 && risks.length === 0;
  const build_source_generated_by_script =
    /DEFAULT_SOURCE_REGISTRY/.test(buildScript) &&
    /build_cards_from_sources/.test(buildScript) &&
    /DEFAULT_BUILD_SOURCE_OUT/.test(buildScript);
  const build_source_is_source_of_truth = !reviewable_sources_exist || !build_source_generated_by_script;
  const clean_checkout_supported = reviewable_sources_exist && inReleaseFileSet(REGISTRY) && build_source_generated_by_script;
  const can_remove_tracked_monolith = clean_checkout_supported && !build_source_is_source_of_truth;

  if (!buildSourceExists) risks.push(`missing_build_source:${BUILD_SOURCE}`);
  if (!build_source_generated_by_script) risks.push("build source is not clearly generated from knowledge_sources");
  if (runtimeImportFiles.length) risks.push(`public runtime imports monolith: ${runtimeImportFiles.join(", ")}`);
  if (await exists(resolve(ROOT, OLD_WEB_SOURCE))) risks.push(`old web source exists: ${OLD_WEB_SOURCE}`);
  if (!clean_checkout_supported) risks.push("clean checkout support is not established from reviewed sources");

  const report = {
    ok: risks.length === 0,
    current_build_source: BUILD_SOURCE,
    build_source_bytes,
    current_build_source_tracked: inReleaseFileSet(BUILD_SOURCE),
    build_source_generated_by_script,
    build_source_is_source_of_truth,
    reviewable_sources_exist,
    reviewable_source_paths: [REGISTRY, "knowledge_sources/schema.json", ...sourceFiles],
    reviewable_source_total_bytes: reviewableBytes,
    largest_reviewable_source_bytes: largestSourceBytes,
    clean_checkout_supported,
    can_remove_tracked_monolith,
    source_of_truth: REGISTRY,
    generated_build_source: BUILD_SOURCE,
    public_runtime_imports_monolith: runtimeImportFiles.length > 0,
    web_monolith_exists: await exists(resolve(ROOT, OLD_WEB_SOURCE)),
    risks,
    recommended_next_step: can_remove_tracked_monolith
      ? "Keep the generated build source tracked for R24G review, then consider generated-only removal in R24H."
      : "Keep the generated build source tracked until roundtrip and clean checkout checks are green."
  };
  console.log(JSON.stringify(report, null, 2));
  if (risks.length) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
