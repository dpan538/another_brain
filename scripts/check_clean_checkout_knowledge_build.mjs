#!/usr/bin/env node
import { mkdtemp, readdir, readFile, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { extname, join, relative, resolve } from "node:path";

import { ROOT } from "./r18_utils.mjs";

const SOURCE = "build_sources/knowledge/knowledge_base.generated.js";
const SOURCE_OF_TRUTH = "knowledge_sources/registry.json";
const OLD_WEB_SOURCE = "web/knowledge_base.generated.js";
const MANIFEST = "web/knowledge_shards/manifest.json";
const ROUTING = "web/knowledge_shards/routing.json";
const MAX_SHARD_BYTES = 180_000;
const ALLOWED_OLD_REFERENCE_SCRIPTS = new Set([
  "scripts/audit_knowledge_build_source.mjs",
  "scripts/audit_knowledge_source_derivation.mjs",
  "scripts/check_clean_checkout_knowledge_build.mjs",
  "scripts/check_vercel_static_build.mjs",
  "scripts/check_release.sh",
  "scripts/validate_knowledge_runtime_shards.mjs",
  "scripts/eval_seo_metadata.mjs"
]);

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

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    ...options
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

async function readJson(relOrAbs) {
  try {
    return JSON.parse(await readFile(relOrAbs.startsWith("/") ? relOrAbs : resolve(ROOT, relOrAbs), "utf8"));
  } catch {
    return {};
  }
}

async function runtimeImportFailures() {
  const failures = [];
  const files = (await walk(resolve(ROOT, "web"))).filter((file) => extname(file) === ".js");
  for (const file of files) {
    const rel = relative(ROOT, file);
    const text = await readFile(file, "utf8");
    if (/knowledge_base\.generated\.js/.test(text)) failures.push(rel);
  }
  return failures;
}

async function staleScriptReferences() {
  const failures = [];
  for (const dir of ["scripts"]) {
    const files = await walk(resolve(ROOT, dir));
    for (const file of files) {
      const rel = relative(ROOT, file);
      if (![".js", ".mjs", ".py", ".sh"].includes(extname(file))) continue;
      if (ALLOWED_OLD_REFERENCE_SCRIPTS.has(rel)) continue;
      const text = await readFile(file, "utf8");
      if (text.includes(OLD_WEB_SOURCE)) failures.push(rel);
    }
  }
  const packageText = await readFile(resolve(ROOT, "package.json"), "utf8");
  if (packageText.includes(OLD_WEB_SOURCE)) failures.push("package.json");
  return failures;
}

async function main() {
  const failures = [];
  const sourcePath = resolve(ROOT, SOURCE);
  const tempDir = await mkdtemp(join(tmpdir(), "another-brain-knowledge-clean-"));

  try {
    if (!(await exists(sourcePath))) failures.push(`missing_source:${SOURCE}`);
    if (!inReleaseFileSet(SOURCE)) failures.push(`source_not_in_release_file_set:${SOURCE}`);
    if (!(await exists(resolve(ROOT, SOURCE_OF_TRUTH)))) failures.push(`missing_source_of_truth:${SOURCE_OF_TRUTH}`);
    if (!inReleaseFileSet(SOURCE_OF_TRUTH)) failures.push(`source_of_truth_not_in_release_file_set:${SOURCE_OF_TRUTH}`);
    if (await exists(resolve(ROOT, OLD_WEB_SOURCE))) failures.push(`old_web_source_exists:${OLD_WEB_SOURCE}`);

    const runtimeImports = await runtimeImportFailures();
    for (const rel of runtimeImports) failures.push(`public_runtime_imports_monolith:${rel}`);

    const staleReferences = await staleScriptReferences();
    for (const rel of staleReferences) failures.push(`stale_script_reference:${rel}`);

    const manifest = await readJson(MANIFEST);
    const routing = await readJson(ROUTING);
    if (manifest.source?.path !== SOURCE) failures.push(`manifest_source_path_mismatch:${manifest.source?.path || ""}`);
    if (routing.source_path !== SOURCE) failures.push(`routing_source_path_mismatch:${routing.source_path || ""}`);

    const buildScript = await readFile(resolve(ROOT, "scripts/build_knowledge_base.py"), "utf8");
    const shardScript = await readFile(resolve(ROOT, "scripts/build_knowledge_shards.py"), "utf8");
    const validateScript = await readFile(resolve(ROOT, "scripts/validate_knowledge_shards.py"), "utf8");
    if (!/build_sources["']?\s*\/\s*["']knowledge/.test(buildScript)) failures.push("build_knowledge_base_default_not_new_source");
    if (!/knowledge_sources["']?\s*\/\s*["']registry\.json/.test(buildScript)) {
      failures.push("build_knowledge_base_default_not_source_of_truth");
    }
    if (!/build_sources["']?\s*\/\s*["']knowledge/.test(shardScript)) failures.push("build_knowledge_shards_default_not_new_source");
    if (!validateScript.includes("DEFAULT_SOURCE")) failures.push("validate_knowledge_shards_not_using_shared_default");

    const tempBuildSource = join(tempDir, "knowledge_base.generated.js");
    const tempBuildJson = join(tempDir, "knowledge_base.generated.json");
    const tempShardDir = join(tempDir, "knowledge_shards");
    const builtSource = run("python3", [
      "scripts/build_knowledge_base.py",
      "--registry",
      SOURCE_OF_TRUTH,
      "--build-source-out",
      tempBuildSource,
      "--json-out",
      tempBuildJson
    ]);
    if (!builtSource.ok) failures.push(`temp_build_source_failed:${builtSource.status}`);

    const generated = builtSource.ok ? run("python3", [
      "scripts/build_knowledge_shards.py",
      "--source",
      tempBuildSource,
      "--out-dir",
      tempShardDir,
      "--max-bytes",
      String(MAX_SHARD_BYTES)
    ]) : { ok: false, status: "skipped" };
    if (!generated.ok) {
      failures.push(`temp_shard_build_failed:${generated.status}`);
    } else {
      const tempManifest = await readJson(join(tempShardDir, "manifest.json"));
      const tempRouting = await readJson(join(tempShardDir, "routing.json"));
      const resolvedTempBuildSource = await realpath(tempBuildSource);
      if (tempManifest.source?.path !== resolvedTempBuildSource) failures.push("temp_manifest_source_path_mismatch");
      if (tempRouting.source_path !== resolvedTempBuildSource) failures.push("temp_routing_source_path_mismatch");
      if (!Array.isArray(tempManifest.shards) || tempManifest.shards.length === 0) failures.push("temp_manifest_has_no_shards");
      if (!Array.isArray(tempRouting.entries) || tempRouting.entries.length === 0) failures.push("temp_routing_has_no_entries");
      for (const shard of tempManifest.shards || []) {
        if (Number(shard.bytes || 0) > MAX_SHARD_BYTES) failures.push(`temp_shard_too_large:${shard.file}:${shard.bytes}`);
      }
    }

    const report = {
      ok: failures.length === 0,
      source_path: SOURCE,
      source_of_truth: SOURCE_OF_TRUTH,
      old_web_source_exists: await exists(resolve(ROOT, OLD_WEB_SOURCE)),
      source_in_release_file_set: inReleaseFileSet(SOURCE),
      source_of_truth_in_release_file_set: inReleaseFileSet(SOURCE_OF_TRUTH),
      temp_out_dir: tempDir,
      manifest_source_path: manifest.source?.path || "",
      routing_source_path: routing.source_path || "",
      failures
    };
    console.log(JSON.stringify(report, null, 2));
    if (failures.length) process.exit(2);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
