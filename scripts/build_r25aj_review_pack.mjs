#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "artifacts/training_os/corpus_expansion/r25aj");
const CANDIDATE_PATH = path.join(OUT_DIR, "r25aj_repo_derived_candidate_rows.jsonl");
const GENERATION_REPORT_PATH = path.join(OUT_DIR, "r25aj_generation_report.json");
const VALIDATION_REPORT_PATH = path.join(OUT_DIR, "r25aj_validation_report.json");
const UNIQUENESS_REPORT_PATH = path.join(OUT_DIR, "r25aj_target_uniqueness_report.json");
const REVIEW_PACK_PATH = path.join(OUT_DIR, "r25aj_review_pack.json");
const SUMMARY_PATH = path.join(ROOT, "docs/R25AJ_UNIQUE_CANDIDATE_SUMMARY.md");

function rel(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonIfPresent(filePath) {
  return fs.existsSync(filePath) ? readJson(filePath) : null;
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

function markdownCounts(counts) {
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n") || "- none: 0";
}

if (!fs.existsSync(CANDIDATE_PATH)) {
  throw new Error(`Missing R25AJ candidate rows: ${rel(CANDIDATE_PATH)}`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const rows = readJsonl(CANDIDATE_PATH);
const generationReport = readJsonIfPresent(GENERATION_REPORT_PATH);
const validationReport = readJsonIfPresent(VALIDATION_REPORT_PATH);
const uniquenessReport = readJsonIfPresent(UNIQUENESS_REPORT_PATH);
const rowsByLanguage = countBy(rows, (row) => row.language);
const rowsByTransformation = countBy(rows, (row) => row.transformation_type);
const rowsBySourceCategory = countBy(rows, (row) => row.source_category);
const personalTargetCoverage = countBy(rows.flatMap((row) => row.personal_color_targets || []), (target) => target);
const rowsBySplit = countBy(rows, (row) => row.split_suggestion);
const rubricStateCounts = countBy(rows, (row) => row.review_rubric?.promotion_ready_by_default === false ? "inert_rubric" : "needs_attention");

const reviewPack = {
  report_id: "r25aj_review_pack",
  ok: Boolean(validationReport?.ok && uniquenessReport?.ok),
  generated_at: new Date().toISOString(),
  candidate_file: rel(CANDIDATE_PATH),
  generation_report: rel(GENERATION_REPORT_PATH),
  validation_report: rel(VALIDATION_REPORT_PATH),
  uniqueness_report: rel(UNIQUENESS_REPORT_PATH),
  row_count: rows.length,
  normalized_unique_target_answer_count: uniquenessReport?.normalized_unique_target_count ?? validationReport?.summary?.normalized_unique_target_answer_count ?? null,
  promotion_capable_unique_candidate_count: validationReport?.summary?.promotion_capable_unique_candidate_count ?? null,
  rows_by_language: rowsByLanguage,
  rows_by_split_suggestion: rowsBySplit,
  rows_by_transformation_type: rowsByTransformation,
  rows_by_source_category: rowsBySourceCategory,
  personal_target_coverage: personalTargetCoverage,
  review_rubric_state_counts: rubricStateCounts,
  warnings: {
    generation_warnings: generationReport?.warnings || [],
    validation_warning_count: validationReport?.summary?.warning_count ?? null,
    uniqueness_duplicate_group_count: uniquenessReport?.duplicate_group_count ?? null
  },
  safety: {
    training_ran: false,
    promotion_ran: false,
    training_llm_corpus_modified: false,
    raw_private_data_committed: false,
    candidate_rows_committed: false,
    artifacts_committed: false,
    phase_4_scaled_training_approved: false
  },
  reviewer_note: "Ignored review pack only. R25AK would need fresh explicit approval before any selected row can be promoted to tracked corpus."
};

fs.writeFileSync(REVIEW_PACK_PATH, `${JSON.stringify(reviewPack, null, 2)}\n`);

const languageTotal = rows.length || 1;
const lines = [
  "# R25AJ Unique Candidate Summary",
  "",
  "R25AJ regenerated repo-derived Chinese-personal candidate rows under ignored artifacts only. It did not train, did not promote rows, did not modify `training/llm_corpus`, did not read `private_sources`, did not parse root PDF, DOC, or DOCX files, and did not parse `data/public_ingestion`.",
  "",
  "## Candidate Counts",
  "",
  `- Candidate rows: ${rows.length}`,
  `- Normalized unique target answers: ${reviewPack.normalized_unique_target_answer_count}`,
  `- Future-promotion-capable unique candidates: ${reviewPack.promotion_capable_unique_candidate_count}`,
  `- Validation: ${validationReport?.ok ? "passed" : "not passed"}`,
  `- Warning count: ${validationReport?.summary?.warning_count ?? "unknown"}`,
  "",
  "## Language Distribution",
  "",
  `- zh: ${rowsByLanguage.zh || 0} (${(((rowsByLanguage.zh || 0) / languageTotal) * 100).toFixed(1)}%)`,
  `- mixed: ${rowsByLanguage.mixed || 0} (${(((rowsByLanguage.mixed || 0) / languageTotal) * 100).toFixed(1)}%)`,
  `- en: ${rowsByLanguage.en || 0} (${(((rowsByLanguage.en || 0) / languageTotal) * 100).toFixed(1)}%)`,
  "",
  "## Split Suggestions",
  "",
  markdownCounts(rowsBySplit),
  "",
  "## Transformation Types",
  "",
  markdownCounts(rowsByTransformation),
  "",
  "## Personal Target Coverage",
  "",
  markdownCounts(personalTargetCoverage),
  "",
  "## Source Categories",
  "",
  markdownCounts(rowsBySourceCategory),
  "",
  "R25AJ rows remain ignored artifacts with `review_status:candidate_unreviewed`, `training_allowed:false`, and `public_commit_allowed:false`. R25AK is required before any reviewed subset may be promoted, and later training still needs a separate approval."
];

fs.writeFileSync(SUMMARY_PATH, `${lines.join("\n")}\n`);
console.log(JSON.stringify({
  ok: reviewPack.ok,
  review_pack: rel(REVIEW_PACK_PATH),
  summary: rel(SUMMARY_PATH),
  row_count: rows.length,
  normalized_unique_target_answer_count: reviewPack.normalized_unique_target_answer_count
}, null, 2));
