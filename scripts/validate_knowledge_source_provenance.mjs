#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { ROOT } from "./r18_utils.mjs";

const SOURCE_ROOT = resolve(ROOT, "knowledge_sources");
const REGISTRY = resolve(SOURCE_ROOT, "registry.json");
const SCHEMA = resolve(SOURCE_ROOT, "schema.json");
const FORBIDDEN_KEYS = new Set([
  "chain_of_thought",
  "chain-of-thought",
  "hidden_prompt",
  "system_prompt",
  "private_memory",
  "raw_private_data"
]);
const SECRET_RE = /(sk-[A-Za-z0-9_-]{20,}|BEGIN (RSA|OPENSSH|PRIVATE) KEY|API_KEY|SECRET_KEY|PRIVATE_KEY|VERCEL_TOKEN)/;
const LOCAL_PATH_RE = /\/Users\/|\/private\/var\/|\/Volumes\//;
const MODEL_WEIGHT_RE = /\.(safetensors|gguf|bin|pt|pth|onnx|mlmodel|mlpackage|ckpt)(\b|$)/i;

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

function findForbiddenKeys(value, path = "") {
  const out = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => out.push(...findForbiddenKeys(item, `${path}[${index}]`)));
    return out;
  }
  if (!value || typeof value !== "object") return out;
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_KEYS.has(String(key).toLowerCase())) out.push(childPath);
    out.push(...findForbiddenKeys(child, childPath));
  }
  return out;
}

function scanStrings(value, label, failures) {
  if (typeof value === "string") {
    if (LOCAL_PATH_RE.test(value)) failures.push(`${label}:local_path`);
    if (SECRET_RE.test(value)) failures.push(`${label}:secret_like`);
    if (MODEL_WEIGHT_RE.test(value)) failures.push(`${label}:model_weight_reference`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanStrings(item, `${label}[${index}]`, failures));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) scanStrings(child, `${label}.${key}`, failures);
}

function validateRow(row, label, failures) {
  for (const key of [
    "source_id",
    "order",
    "domain",
    "label",
    "aliases",
    "answers",
    "source_type",
    "provenance",
    "review_status",
    "contains_private_data",
    "license_or_permission"
  ]) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) failures.push(`${label}:missing_${key}`);
  }
  if (row.contains_private_data !== false) failures.push(`${label}:contains_private_data_not_false`);
  if (!row.review_status) failures.push(`${label}:missing_review_status`);
  if (!row.license_or_permission) failures.push(`${label}:missing_license_or_permission`);
  if (!row.provenance || typeof row.provenance !== "object") failures.push(`${label}:missing_provenance`);
  if (row.source_type === "synthetic_llm" && !row.provenance?.generator_model) {
    failures.push(`${label}:synthetic_llm_missing_generator_model`);
  }
  for (const forbidden of findForbiddenKeys(row)) failures.push(`${label}:forbidden_key:${forbidden}`);
  scanStrings(row, label, failures);
}

async function main() {
  const failures = [];
  if (!(await exists(REGISTRY))) failures.push("missing_registry");
  if (!(await exists(SCHEMA))) failures.push("missing_schema");
  const registry = parseJson((await exists(REGISTRY)) ? await readFile(REGISTRY, "utf8") : "{}", "registry", failures);
  parseJson((await exists(SCHEMA)) ? await readFile(SCHEMA, "utf8") : "{}", "schema", failures);

  const listed = new Set((registry.sources || []).map((source) => `knowledge_sources/${source.path}`));
  const actual = new Set(
    (await walk(resolve(SOURCE_ROOT, "cards")))
      .map((path) => relative(ROOT, path))
      .filter((rel) => /cards_\d+\.jsonl$/.test(rel))
  );
  for (const rel of listed) {
    if (!actual.has(rel)) failures.push(`listed_source_missing:${rel}`);
  }
  for (const rel of actual) {
    if (!listed.has(rel)) failures.push(`source_file_not_listed:${rel}`);
  }

  const seenIds = new Set();
  let rows = 0;
  for (const source of registry.sources || []) {
    const rel = `knowledge_sources/${source.path}`;
    if (!source.provenance) failures.push(`chunk_missing_provenance:${rel}`);
    if (!source.review_status) failures.push(`chunk_missing_review_status:${rel}`);
    if (source.contains_private_data !== false) failures.push(`chunk_private_data_not_false:${rel}`);
    if (!source.license_or_permission) failures.push(`chunk_missing_license:${rel}`);
    scanStrings(source, rel, failures);
    const path = resolve(ROOT, rel);
    const text = (await exists(path)) ? await readFile(path, "utf8") : "";
    for (const [index, line] of text.split(/\r?\n/).entries()) {
      if (!line.trim()) continue;
      const label = `${rel}:${index + 1}`;
      const row = parseJson(line, label, failures);
      validateRow(row, label, failures);
      if (seenIds.has(row.source_id)) failures.push(`${label}:duplicate_source_id:${row.source_id}`);
      seenIds.add(row.source_id);
      rows += 1;
    }
  }

  const report = {
    ok: failures.length === 0,
    registry: "knowledge_sources/registry.json",
    schema: "knowledge_sources/schema.json",
    source_files: listed.size,
    rows,
    failures
  };
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
