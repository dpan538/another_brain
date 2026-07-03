#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "artifacts/training_os/corpus_expansion/r25ah");
const CANDIDATE_PATH = path.join(OUT_DIR, "r25ah_repo_derived_candidate_rows.jsonl");
const VALIDATION_PATH = path.join(OUT_DIR, "r25ah_validation_report.json");
const REVIEW_PACK_PATH = path.join(OUT_DIR, "r25ah_review_pack.json");
const SUMMARY_PATH = path.join(ROOT, "docs/R25AH_REPO_DERIVED_CANDIDATE_SUMMARY.md");

function rel(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonl(filePath) {
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function countBy(items, fn) {
  const counts = {};
  for (const item of items) {
    const key = fn(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

if (!fs.existsSync(CANDIDATE_PATH)) {
  throw new Error(`Missing R25AH candidate rows: ${rel(CANDIDATE_PATH)}`);
}
if (!fs.existsSync(VALIDATION_PATH)) {
  throw new Error(`Missing R25AH validation report: ${rel(VALIDATION_PATH)}`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const rows = readJsonl(CANDIDATE_PATH);
const validation = readJson(VALIDATION_PATH);
const summary = {
  row_count: rows.length,
  rows_by_language: countBy(rows, (row) => row.language),
  rows_by_transformation_type: countBy(rows, (row) => row.transformation_type),
  rows_by_source_category: countBy(rows, (row) => row.source_category),
  personal_target_coverage: countBy(rows.flatMap((row) => row.personal_color_targets || []), (target) => target),
  split_suggestions: countBy(rows, (row) => row.split_suggestion),
  validation_ok: validation.ok === true,
  warning_count: validation.summary?.warning_count ?? 0
};

const reviewPack = {
  report_id: "r25ah_review_pack",
  ok: validation.ok === true,
  generated_at: new Date().toISOString(),
  safety: {
    training_ran: false,
    corpus_rows_promoted: false,
    training_llm_corpus_modified: false,
    raw_private_text_included: false,
    external_api_used: false,
    phase_4_scaled_training_approved: false,
    tracked_summary_aggregate_only: true
  },
  summary,
  review_instructions: [
    "Inspect ignored candidate rows before any promotion.",
    "Promote only rows with safe provenance, Chinese-first value, and no eval contamination.",
    "R25AI blocked on uniqueness; use R25AJ repaired candidates and a future R25AK approval for any promotion."
  ],
  candidate_sample_ids: rows.map((row) => row.sample_id)
};

fs.writeFileSync(REVIEW_PACK_PATH, `${JSON.stringify(reviewPack, null, 2)}\n`);

const lines = [];
lines.push("# R25AH Repo-Derived Candidate Summary");
lines.push("");
lines.push("R25AH generated ignored repo-derived candidate rows from selected tracked repository text. It did not train, did not promote rows, did not modify `training/llm_corpus`, did not read `private_sources`, did not parse root PDF, DOC, or DOCX files, and did not parse `data/public_ingestion`.");
lines.push("");
lines.push("## Candidate Counts");
lines.push("");
lines.push(`- Candidate rows: ${summary.row_count}`);
lines.push(`- Validation: ${summary.validation_ok ? "passed" : "needs_review"}`);
lines.push(`- Warning count: ${summary.warning_count}`);
lines.push("");
lines.push("## Language Distribution");
lines.push("");
for (const [language, count] of Object.entries(summary.rows_by_language)) {
  lines.push(`- ${language}: ${count}`);
}
lines.push("");
lines.push("## Transformation Types");
lines.push("");
for (const [type, count] of Object.entries(summary.rows_by_transformation_type)) {
  lines.push(`- ${type}: ${count}`);
}
lines.push("");
lines.push("## Source Categories");
lines.push("");
for (const [category, count] of Object.entries(summary.rows_by_source_category)) {
  lines.push(`- ${category}: ${count}`);
}
lines.push("");
lines.push("## Personal Target Coverage");
lines.push("");
for (const [target, count] of Object.entries(summary.personal_target_coverage)) {
  lines.push(`- ${target}: ${count}`);
}
lines.push("");
lines.push("The candidate rows remain ignored artifacts and are still `candidate_unreviewed`, `training_allowed:false`, and `public_commit_allowed:false`.");
lines.push("");
lines.push("## R25AJ Follow-Up");
lines.push("");
lines.push("R25AI blocked before promotion because this candidate pool did not provide enough unique `target_answer` values for a 256/32/32 split. R25AJ records the blocker and regenerates unique repo-derived candidates under ignored artifacts only. It does not train, does not promote rows, and does not modify `training/llm_corpus`. R25AK is required before any reviewed rows may be promoted, and later training needs another approval.");
lines.push("");
fs.writeFileSync(SUMMARY_PATH, `${lines.join("\n")}\n`);

console.log(JSON.stringify({
  ok: true,
  review_pack: rel(REVIEW_PACK_PATH),
  summary: rel(SUMMARY_PATH),
  row_count: summary.row_count,
  validation_ok: summary.validation_ok
}, null, 2));
