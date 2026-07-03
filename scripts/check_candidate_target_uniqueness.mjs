#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_FILE = "artifacts/training_os/corpus_expansion/r25aj/r25aj_repo_derived_candidate_rows.jsonl";
const FALLBACK_FILE = "artifacts/training_os/corpus_expansion/r25ah/r25ah_repo_derived_candidate_rows.jsonl";
const OUT = "artifacts/training_os/corpus_expansion/r25aj/r25aj_target_uniqueness_report.json";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function abs(path) {
  return resolve(ROOT, path);
}

export function normalizeCandidateTarget(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[，。！？；：、]/g, " ")
    .replace(/[,.!?;:()[\]{}<>《》「」『』"']/g, " ")
    .replace(/\br25a[hijk]_[a-z0-9_:-]+\b/gi, " ")
    .replace(/\br25ah_repo_(?:source|derived)_\d+\b/gi, " ")
    .replace(/\bsource[_ -]?\d+\b/gi, " ")
    .replace(/\bsample[_ -]?\d+\b/gi, " ")
    .replace(/(?:^|\s)(?:第)?\d+(?:条|项|段|行)(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function readJsonl(path) {
  const text = await readFile(abs(path), "utf8");
  return text.split(/\r?\n/).filter((line) => line.trim()).map(JSON.parse);
}

function countBy(rows, fn) {
  const out = {};
  for (const row of rows) {
    const key = fn(row);
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function uniqueCount(rows) {
  return new Set(rows.map((row) => normalizeCandidateTarget(row.target_answer))).size;
}

function duplicateGroups(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = normalizeCandidateTarget(row.target_answer);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([key, items]) => ({
      normalized_target_hash: key.slice(0, 24),
      count: items.length,
      transformations: countBy(items, (row) => row.transformation_type || "unknown"),
      split_suggestions: countBy(items, (row) => row.split_suggestion || "unknown")
    }))
    .sort((a, b) => b.count - a.count);
}

async function main() {
  const explicitFile = argValue("--file");
  const file = explicitFile || (existsSync(abs(DEFAULT_FILE)) ? DEFAULT_FILE : FALLBACK_FILE);
  const diagnosticMode = !explicitFile && file === FALLBACK_FILE;
  const rows = await readJsonl(file);
  const splitMap = {
    train: rows.filter((row) => row.split_suggestion === "train"),
    dev: rows.filter((row) => row.split_suggestion === "dev"),
    heldout: rows.filter((row) => row.split_suggestion === "heldout_candidate" || row.split_suggestion === "heldout")
  };
  const duplicate_groups = duplicateGroups(rows);
  const report = {
    ok: false,
    report_id: "r25aj_candidate_target_uniqueness",
    generated_at: new Date().toISOString(),
    file,
    diagnostic_mode: diagnosticMode,
    total_rows: rows.length,
    raw_unique_target_count: new Set(rows.map((row) => String(row.target_answer || ""))).size,
    normalized_unique_target_count: uniqueCount(rows),
    promotion_capacity_unique_train: uniqueCount(splitMap.train),
    promotion_capacity_unique_dev: uniqueCount(splitMap.dev),
    promotion_capacity_unique_heldout: uniqueCount(splitMap.heldout),
    duplicate_group_count: duplicate_groups.length,
    duplicate_groups: duplicate_groups.slice(0, 50),
    duplicate_groups_by_transformation: countBy(rows.filter((row) => {
      const key = normalizeCandidateTarget(row.target_answer);
      return duplicate_groups.some((group) => group.normalized_target_hash === key.slice(0, 24));
    }), (row) => row.transformation_type || "unknown")
  };
  report.ok = report.normalized_unique_target_count >= 400 &&
    report.promotion_capacity_unique_train >= 280 &&
    report.promotion_capacity_unique_dev >= 40 &&
    report.promotion_capacity_unique_heldout >= 40;

  await mkdir(dirname(abs(OUT)), { recursive: true });
  await writeFile(abs(OUT), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok && !diagnosticMode) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
