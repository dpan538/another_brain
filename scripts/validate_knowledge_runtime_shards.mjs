#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { ROOT } from "./r18_utils.mjs";

const SHARD_DIR = resolve(ROOT, "web/knowledge_shards");
const BUILD_SOURCE_PATH = "build_sources/knowledge/knowledge_base.generated.js";
const SOURCE_OF_TRUTH_PATH = "knowledge_sources/registry.json";
const OLD_WEB_SOURCE_PATH = "web/knowledge_base.generated.js";
const MAX_KNOWLEDGE_SHARD_BYTES = 180_000;
const KNOWN_SMOKE_LABELS = ["毛巾", "白平衡", "GitHub"];
const NORMALIZE_PUNCTUATION = /[\s\-＿_—–~～`"'“”‘’.,，。!?！？:：;；、()[\]{}<>《》「」『』]/g;

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
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else out.push(path);
  }
  return out;
}

function parseJson(text, label, failures) {
  try {
    return JSON.parse(text);
  } catch (error) {
    failures.push(`${label}:invalid_json:${error.message}`);
    return {};
  }
}

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function normalize(text) {
  return String(text || "").toLowerCase().replace(NORMALIZE_PUNCTUATION, "").trim();
}

async function main() {
  const failures = [];
  const manifestPath = resolve(SHARD_DIR, "manifest.json");
  const routingPath = resolve(SHARD_DIR, "routing.json");

  if (!(await exists(manifestPath))) failures.push("missing_manifest");
  if (!(await exists(routingPath))) failures.push("missing_routing");

  const manifestText = (await exists(manifestPath)) ? await readFile(manifestPath, "utf8") : "{}";
  const routingText = (await exists(routingPath)) ? await readFile(routingPath, "utf8") : "{}";
  const manifest = parseJson(manifestText, "manifest", failures);
  const routing = parseJson(routingText, "routing", failures);
  const manifestShards = Array.isArray(manifest.shards) ? manifest.shards : [];
  const validIndexes = new Set(manifestShards.map((shard) => shard.index).filter((index) => Number.isInteger(index)));

  if (manifest.schema_version !== 1) failures.push("manifest_schema_version_invalid");
  if (routing.schema_version !== 1) failures.push("routing_schema_version_invalid");
  if (manifest.source?.path !== BUILD_SOURCE_PATH) failures.push(`manifest_source_path_not_build_source:${manifest.source?.path || ""}`);
  if (routing.source_path !== BUILD_SOURCE_PATH) failures.push(`routing_source_path_not_build_source:${routing.source_path || ""}`);
  if (manifest.source_of_truth?.path !== SOURCE_OF_TRUTH_PATH) {
    failures.push(`manifest_source_of_truth_path_invalid:${manifest.source_of_truth?.path || ""}`);
  }
  if (routing.source_of_truth?.path !== SOURCE_OF_TRUTH_PATH) {
    failures.push(`routing_source_of_truth_path_invalid:${routing.source_of_truth?.path || ""}`);
  }
  if (manifest.shard_count !== manifestShards.length) failures.push("manifest_shard_count_mismatch");
  if (routing.shard_count !== manifest.shard_count) failures.push("routing_shard_count_mismatch");
  if (await exists(resolve(ROOT, OLD_WEB_SOURCE_PATH))) failures.push("old_web_monolith_source_exists");

  if (/"(cards|answers|what|how|use|why)"\s*:/.test(routingText)) {
    failures.push("routing_contains_answer_or_card_fields");
  }

  let maxShardBytes = 0;
  for (const shard of manifestShards) {
    const shardPath = resolve(SHARD_DIR, shard.file || "");
    if (!(await exists(shardPath))) {
      failures.push(`missing_shard:${shard.file}`);
      continue;
    }
    const shardText = await readFile(shardPath, "utf8");
    const shardBytes = Buffer.byteLength(shardText, "utf8");
    maxShardBytes = Math.max(maxShardBytes, shardBytes);
    if (shardBytes > MAX_KNOWLEDGE_SHARD_BYTES) failures.push(`shard_too_large:${shard.file}:${shardBytes}`);
    if (shard.bytes !== shardBytes) failures.push(`shard_bytes_mismatch:${shard.file}`);
    if (shard.sha256 && shard.sha256 !== sha256(shardText)) failures.push(`shard_sha256_mismatch:${shard.file}`);
  }

  const routingShardFiles = new Map();
  for (const shard of routing.shards || []) {
    if (!validIndexes.has(shard.index)) failures.push(`routing_invalid_shard_index:${shard.index}`);
    routingShardFiles.set(shard.index, shard.file);
    for (const forbidden of ["cards", "answers", "what", "how", "use", "why"]) {
      if (Object.prototype.hasOwnProperty.call(shard, forbidden)) failures.push(`routing_shard_contains_answer_field:${forbidden}`);
    }
  }
  for (const shard of manifestShards) {
    if (routingShardFiles.get(shard.index) !== shard.file) failures.push(`routing_manifest_file_mismatch:${shard.index}`);
  }

  const routingTerms = new Map();
  for (const entry of routing.entries || []) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || !Array.isArray(entry[1])) {
      failures.push("routing_entry_shape_invalid");
      continue;
    }
    const term = entry[0];
    const indexes = entry[1];
    if (!term) failures.push("routing_entry_empty_term");
    if (indexes.some((index) => !validIndexes.has(index))) failures.push(`routing_entry_invalid_index:${term}`);
    routingTerms.set(term, indexes);
  }

  const publicRuntimeFiles = (await walk(resolve(ROOT, "web"))).filter((file) => {
    return extname(file) === ".js";
  });
  for (const file of publicRuntimeFiles) {
    const rel = relative(ROOT, file);
    const text = await readFile(file, "utf8");
    if (/knowledge_base\.generated\.js/.test(text)) failures.push(`public_runtime_imports_monolith:${rel}`);
  }

  const dialogRulesText = await readFile(resolve(ROOT, "web/dialog_rules.js"), "utf8");
  if (/knowledge_base\.generated\.js/.test(dialogRulesText)) failures.push("dialog_rules_imports_monolith");

  for (const label of KNOWN_SMOKE_LABELS) {
    const normalized = normalize(label);
    const indexes = routingTerms.get(normalized);
    if (!indexes?.length) failures.push(`smoke_label_not_routed:${label}`);
  }

  const report = {
    ok: failures.length === 0,
    failures,
    shard_count: manifest.shard_count || 0,
    routing_entries: Array.isArray(routing.entries) ? routing.entries.length : 0,
    max_shard_bytes: maxShardBytes,
    smoke_labels: KNOWN_SMOKE_LABELS
  };
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
