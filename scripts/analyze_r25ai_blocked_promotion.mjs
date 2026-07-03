#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OLD_CANDIDATES = "artifacts/training_os/corpus_expansion/r25ah/r25ah_repo_derived_candidate_rows.jsonl";
const R25AI_REPORT = "artifacts/training_os/corpus_expansion/r25ai/r25ai_promotion_report.json";
const OUT = "artifacts/training_os/corpus_expansion/r25aj/r25aj_blocked_promotion_diagnostic.json";
const SUMMARY = "docs/R25AJ_R25AI_BLOCKED_PROMOTION_DIAGNOSTIC.md";

function abs(path) {
  return resolve(ROOT, path);
}

async function readJson(path) {
  return JSON.parse(await readFile(abs(path), "utf8"));
}

async function readJsonIfPresent(path) {
  return existsSync(abs(path)) ? readJson(path) : null;
}

async function readJsonl(path) {
  const text = await readFile(abs(path), "utf8");
  return text.split(/\r?\n/).filter((line) => line.trim()).map(JSON.parse);
}

function normalizeTarget(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[，。！？；：、]/g, " ")
    .replace(/[,.!?;:()[\]{}<>《》「」『』"']/g, " ")
    .replace(/\br25a[hij]_[a-z0-9_:-]+\b/gi, " ")
    .replace(/\br25ah_repo_(?:source|derived)_\d+\b/gi, " ")
    .replace(/\b(?:source|sample|row|id)\s*[:#-]?\s*\d+\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countBy(rows, fn) {
  const out = {};
  for (const row of rows) {
    const key = fn(row);
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function clusterTargets(rows) {
  const clusters = new Map();
  for (const row of rows) {
    const key = normalizeTarget(row.target_answer);
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(row);
  }
  return [...clusters.entries()]
    .map(([target, items]) => ({
      normalized_target_hash: target.slice(0, 24),
      count: items.length,
      split_suggestions: countBy(items, (row) => row.split_suggestion),
      transformation_types: countBy(items, (row) => row.transformation_type),
      source_categories: countBy(items, (row) => row.source_category)
    }))
    .sort((a, b) => b.count - a.count);
}

function uniqueBySplit(rows) {
  const out = {};
  for (const split of ["train", "dev", "heldout_candidate"]) {
    out[split] = new Set(rows.filter((row) => row.split_suggestion === split).map((row) => normalizeTarget(row.target_answer))).size;
  }
  return out;
}

async function main() {
  const rows = await readJsonl(OLD_CANDIDATES);
  const r25aiReport = await readJsonIfPresent(R25AI_REPORT);
  const clusters = clusterTargets(rows);
  const duplicateClusters = clusters.filter((cluster) => cluster.count > 1);
  const report = {
    ok: true,
    report_id: "r25aj_blocked_promotion_diagnostic",
    generated_at: new Date().toISOString(),
    source_candidate_file: OLD_CANDIDATES,
    r25ai_blocked_attempt_report_present: Boolean(r25aiReport),
    r25ai_blocked_attempt: r25aiReport ? {
      ok: r25aiReport.ok === true,
      promoted_total: r25aiReport.promoted_total ?? null,
      training_ran: r25aiReport.training_ran === true,
      phase4_approved: r25aiReport.phase4_approved === true,
      error: r25aiReport.error || ""
    } : null,
    total_candidates: rows.length,
    raw_unique_target_count: new Set(rows.map((row) => String(row.target_answer || ""))).size,
    normalized_unique_target_count: clusters.length,
    unique_target_count_by_split_suggestion: uniqueBySplit(rows),
    duplicate_cluster_count: duplicateClusters.length,
    largest_duplicate_clusters: duplicateClusters.slice(0, 12),
    transformation_counts: countBy(rows, (row) => row.transformation_type),
    source_category_counts: countBy(rows, (row) => row.source_category),
    duplicate_rows_by_transformation: countBy(rows.filter((row) => {
      const key = normalizeTarget(row.target_answer);
      return clusters.find((cluster) => cluster.normalized_target_hash === key.slice(0, 24) && cluster.count > 1);
    }), (row) => row.transformation_type),
    root_cause_classification: {
      duplicate_target_templates: true,
      source_selection_collapse: false,
      minor_variation_only: false,
      target_generator_template_collapse: true,
      reason: "R25AH generated many rows by varying source ids and categories while reusing a small set of target-answer templates. Promotion correctly failed because unique target capacity was far below 320."
    },
    training_ran: false,
    promotion_ran_in_r25aj: false,
    training_llm_corpus_modified: false
  };

  await mkdir(dirname(abs(OUT)), { recursive: true });
  await writeFile(abs(OUT), `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const splitUnique = report.unique_target_count_by_split_suggestion;
  const lines = [
    "# R25AJ R25AI Blocked Promotion Diagnostic",
    "",
    "R25AI blocked before promotion because R25AH candidate targets collapsed to too few unique answers. R25AJ records the blocker and repairs candidate generation under ignored artifacts only. It does not train, does not promote rows, and does not modify `training/llm_corpus`.",
    "",
    "## Aggregate Findings",
    "",
    `- Old R25AH candidates: ${report.total_candidates}`,
    `- Raw unique target answers: ${report.raw_unique_target_count}`,
    `- Normalized unique target answers: ${report.normalized_unique_target_count}`,
    `- Unique train/dev/heldout-candidate targets: ${splitUnique.train}/${splitUnique.dev}/${splitUnique.heldout_candidate}`,
    `- Duplicate clusters: ${report.duplicate_cluster_count}`,
    `- Failed R25AI report present: ${report.r25ai_blocked_attempt_report_present ? "yes" : "no"}`,
    `- Failed R25AI promoted rows: ${r25aiReport?.promoted_total ?? 0}`,
    "",
    "## Root Cause",
    "",
    "The blocker is target-generator template collapse: rows varied metadata and source references, but the actual `target_answer` text repeated across many rows. The source catalog itself was broad enough; the answer generator did not bind enough source-specific context, task framing, or response obligation into each target.",
    "",
    "R25AJ therefore adds a review rubric, a normalized uniqueness check, and a repaired deterministic generator that creates context-specific target answers without appending meaningless IDs."
  ];
  await writeFile(abs(SUMMARY), `${lines.join("\n")}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
