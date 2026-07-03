#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CORPUS_DIR = path.join(ROOT, "training/llm_corpus");
const OUT_DIR = path.join(ROOT, "artifacts/training_os/corpus_expansion/r25ak");
const REPORT_PATH = path.join(OUT_DIR, "r25ak_promoted_corpus_coverage.json");
const SUMMARY_PATH = path.join(ROOT, "docs/R25AK_PROMOTED_CORPUS_SUMMARY.md");
const R25AK_FILES = [
  "r25ak_repo_derived_train.jsonl",
  "r25ak_repo_derived_dev.jsonl",
  "r25ak_repo_derived_heldout.jsonl"
];

function readJsonl(filePath) {
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function countBy(items, fn) {
  const out = {};
  for (const item of items) {
    const key = fn(item);
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function rowsFor(files) {
  return files.flatMap((file) => readJsonl(path.join(CORPUS_DIR, file)).map((row) => ({ ...row, __file: file })));
}

function languageOf(row) {
  return row.language || "unknown";
}

function splitOf(row) {
  if (row.split) return row.split;
  if (row.__file.includes("train")) return "train";
  if (row.__file.includes("dev")) return "dev";
  if (row.__file.includes("heldout")) return "heldout";
  return "unknown";
}

function summarize(rows) {
  return {
    rows: rows.length,
    split_counts: countBy(rows, splitOf),
    language_counts: countBy(rows, languageOf),
    transformation_counts: countBy(rows, (row) => row.transformation_type || row.task_family || "unknown"),
    source_category_counts: countBy(rows, (row) => row.source_category || "legacy_or_unspecified"),
    provenance_counts: countBy(rows, (row) => row.provenance?.source_type || row.provenance || "unknown"),
    personal_target_counts: countBy(rows.flatMap((row) => row.personal_color_targets || []), (target) => target),
    rejected_answer_rows: rows.filter((row) => Array.isArray(row.rejected_answers) && row.rejected_answers.length > 0).length
  };
}

function mdTable(counts) {
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `| ${key} | ${value} |`)
    .join("\n");
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const allFiles = fs.readdirSync(CORPUS_DIR).filter((file) => file.endsWith(".jsonl")).sort();
const existingFiles = allFiles.filter((file) => !R25AK_FILES.includes(file));
const existingRows = rowsFor(existingFiles);
const r25akRows = rowsFor(R25AK_FILES);
const combinedRows = [...existingRows, ...r25akRows];
const previous = summarize(existingRows);
const promoted = summarize(r25akRows);
const combined = summarize(combinedRows);

const report = {
  ok: true,
  report_id: "r25ak_promoted_corpus_coverage",
  previous_files: existingFiles,
  r25ak_files: R25AK_FILES,
  previous,
  r25ak_promoted: promoted,
  combined,
  estimated_effect_on_chinese_first_target: {
    before_language_counts: previous.language_counts,
    after_language_counts: combined.language_counts,
    r25ak_adds_chinese_first_personal_repo_rows: true
  },
  safety: {
    training_ran: false,
    tokenizer_dry_run_ran: false,
    phase4_approved: false,
    artifacts_committed: false
  }
};
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const summary = `# R25AK Promoted Corpus Summary

R25AK promoted a bounded reviewed subset of R25AJ unique repo-derived candidates into tracked corpus split files. R25AK did not train, did not run tokenizer dry-run, did not commit ignored artifacts, and did not approve phase_4 scaled training.

## Promoted Rows

- Total: ${promoted.rows}
- Train/dev/heldout: ${promoted.split_counts.train || 0} / ${promoted.split_counts.dev || 0} / ${promoted.split_counts.heldout || 0}
- Language: zh ${promoted.language_counts.zh || 0}, mixed ${promoted.language_counts.mixed || 0}, en ${promoted.language_counts.en || 0}

## Transformation Counts

| Transformation | Rows |
| --- | ---: |
${mdTable(promoted.transformation_counts)}

## Personal Target Coverage

| Target | Rows |
| --- | ---: |
${mdTable(promoted.personal_target_counts)}

## Source Categories

| Category | Rows |
| --- | ---: |
${mdTable(promoted.source_category_counts)}

## Combined Corpus

- Previous JSONL rows in \`training/llm_corpus\`: ${previous.rows}
- Combined JSONL rows after R25AK: ${combined.rows}
- Combined language counts: zh ${combined.language_counts.zh || 0}, mixed ${combined.language_counts.mixed || 0}, en ${combined.language_counts.en || 0}

Future tokenizer review requires fresh approval. Future training requires a separate fresh approval after corpus review.
`;

fs.writeFileSync(SUMMARY_PATH, summary, "utf8");
console.log(JSON.stringify({
  ok: true,
  report: "artifacts/training_os/corpus_expansion/r25ak/r25ak_promoted_corpus_coverage.json",
  summary: "docs/R25AK_PROMOTED_CORPUS_SUMMARY.md",
  previous_rows: previous.rows,
  r25ak_rows: promoted.rows,
  combined_rows: combined.rows,
  r25ak_language_counts: promoted.language_counts,
  combined_language_counts: combined.language_counts
}, null, 2));
