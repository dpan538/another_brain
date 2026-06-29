#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { ROOT } from "./r18_utils.mjs";

const BUILD_SOURCE = resolve(ROOT, "build_sources/knowledge/knowledge_base.generated.js");
const REGISTRY = resolve(ROOT, "knowledge_sources/registry.json");
const SOURCE_ROOT = resolve(ROOT, "knowledge_sources");
const ROUTING = resolve(ROOT, "web/knowledge_shards/routing.json");
const MANIFEST = resolve(ROOT, "web/knowledge_shards/manifest.json");

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

async function fileBytes(path) {
  return (await exists(path)) ? (await stat(path)).size : 0;
}

async function main() {
  const registry = (await exists(REGISTRY)) ? JSON.parse(await readFile(REGISTRY, "utf8")) : {};
  const sourceFiles = (await exists(SOURCE_ROOT)) ? await walk(SOURCE_ROOT) : [];
  let sourceTotal = 0;
  let largestSource = 0;
  for (const file of sourceFiles) {
    const bytes = await fileBytes(file);
    sourceTotal += bytes;
    largestSource = Math.max(largestSource, bytes);
  }
  const manifest = (await exists(MANIFEST)) ? JSON.parse(await readFile(MANIFEST, "utf8")) : {};
  const shardBytes = (manifest.shards || []).map((shard) => Number(shard.bytes || 0));
  const monolithBytes = await fileBytes(BUILD_SOURCE);
  const report = {
    monolithic_build_source_bytes: monolithBytes,
    knowledge_source_total_bytes: sourceTotal,
    source_file_count: sourceFiles.length,
    source_chunk_count: Array.isArray(registry.sources) ? registry.sources.length : 0,
    largest_source_file_bytes: largestSource,
    routing_json_bytes: await fileBytes(ROUTING),
    shard_count: Number(manifest.shard_count || 0),
    largest_shard_bytes: shardBytes.length ? Math.max(...shardBytes) : 0,
    reviewability_notes: [
      `Largest reviewed source file is ${largestSource} bytes versus ${monolithBytes} bytes for the generated build source.`,
      "Source chunks preserve row order and provenance; total source bytes can exceed the generated monolith because each row carries review metadata.",
      "The generated build source remains outside deployable web/ and public runtime continues to load shards lazily."
    ]
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
