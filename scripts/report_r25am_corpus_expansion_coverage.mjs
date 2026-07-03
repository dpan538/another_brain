#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CORPUS_DIR = path.join(ROOT, "training/llm_corpus");
const OUT_DIR = path.join(ROOT, "artifacts/training_os/corpus_expansion/r25am");
const REPORT_PATH = path.join(OUT_DIR, "r25am_corpus_expansion_coverage.json");
const SUMMARY_PATH = path.join(ROOT, "docs/R25AM_CORPUS_EXPANSION_SUMMARY.md");
const R25AM_FILES = [
  "r25am_repo_derived_train.jsonl",
  "r25am_repo_derived_dev.jsonl",
  "r25am_repo_derived_heldout.jsonl"
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

function splitOf(row) {
  if (row.split) return row.split;
  if (row.__file.includes("train")) return "train";
  if (row.__file.includes("dev")) return "dev";
  if (row.__file.includes("heldout")) return "heldout";
  return "unknown";
}

function languageOf(row) {
  return row.language || "unknown";
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
    rejected_answer_rows: rows.filter((row) => Array.isArray(row.rejected_answers) && row.rejected_answers.length > 0).length,
    rejected_answer_total: rows.reduce((sum, row) => sum + (Array.isArray(row.rejected_answers) ? row.rejected_answers.length : 0), 0)
  };
}

function share(counts, key, total) {
  return total ? (counts[key] || 0) / total : 0;
}

function targetDelta(before, after) {
  const beforeRows = before.rows || 1;
  const afterRows = after.rows || 1;
  const beforeZh = share(before.language_counts, "zh", beforeRows);
  const afterZh = share(after.language_counts, "zh", afterRows);
  const beforeMixed = share(before.language_counts, "mixed", beforeRows);
  const afterMixed = share(after.language_counts, "mixed", afterRows);
  const beforeEn = share(before.language_counts, "en", beforeRows);
  const afterEn = share(after.language_counts, "en", afterRows);
  const zhOnlyRowsNeededFor70 = Math.max(0, Math.ceil((0.7 * afterRows - (after.language_counts.zh || 0)) / 0.3));
  const nonEnRowsNeededFor10 = Math.max(0, Math.ceil(((after.language_counts.en || 0) / 0.1) - afterRows));
  return {
    target: { zh_min: 0.7, mixed_target: 0.2, en_max: 0.1 },
    before_share: { zh: beforeZh, mixed: beforeMixed, en: beforeEn },
    after_share: { zh: afterZh, mixed: afterMixed, en: afterEn },
    share_delta: { zh: afterZh - beforeZh, mixed: afterMixed - beforeMixed, en: afterEn - beforeEn },
    zh_only_rows_needed_for_70_percent_after_r25am: zhOnlyRowsNeededFor70,
    non_en_rows_needed_for_10_percent_en_cap_after_r25am: nonEnRowsNeededFor10,
    target_met_after_r25am: afterZh >= 0.7 && afterEn <= 0.1
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
const previousFiles = allFiles.filter((file) => !R25AM_FILES.includes(file));
const previousRows = rowsFor(previousFiles);
const r25amRows = rowsFor(R25AM_FILES);
const combinedRows = [...previousRows, ...r25amRows];
const previous = summarize(previousRows);
const promoted = summarize(r25amRows);
const combined = summarize(combinedRows);
const delta = targetDelta(previous, combined);
const duplicateTargets = new Map();
for (const row of combinedRows) {
  const key = String(row.target_answer || "").trim().replace(/\s+/g, " ");
  if (!key) continue;
  duplicateTargets.set(key, (duplicateTargets.get(key) || 0) + 1);
}
const duplicateTargetCount = [...duplicateTargets.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);

const report = {
  ok: true,
  report_id: "r25am_corpus_expansion_coverage",
  previous_files: previousFiles,
  r25am_files: R25AM_FILES,
  previous,
  r25am_promoted: promoted,
  combined,
  delta_toward_chinese_first_target: delta,
  duplicate_or_boilerplate_findings: {
    duplicate_target_answer_count: duplicateTargetCount,
    repeated_template_risk: duplicateTargetCount > 0 ? "review_duplicates" : "low"
  },
  safety: {
    training_ran: false,
    tokenizer_dry_run_ran: false,
    phase4_approved: false,
    artifacts_committed: false,
    root_pdf_docx_content_parsed: false,
    data_public_ingestion_content_parsed: false,
    private_sources_read: false,
    evals_used_as_source: false
  }
};
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const summary = `# R25AM Corpus Expansion Summary

R25AM promoted a second bounded set of reviewed repo-derived Chinese-personal rows into tracked corpus split files. R25AM did not train, did not run tokenizer dry-run, did not read private sources, did not use evals as sources, and did not approve phase_4 scaled training.

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

## Combined Corpus After R25AM

- Previous rows after R25AK/R25AL: ${previous.rows}
- Combined rows after R25AM: ${combined.rows}
- Combined language counts: zh ${combined.language_counts.zh || 0}, mixed ${combined.language_counts.mixed || 0}, en ${combined.language_counts.en || 0}
- Zh share moved from ${(delta.before_share.zh * 100).toFixed(2)}% to ${(delta.after_share.zh * 100).toFixed(2)}%.
- En share moved from ${(delta.before_share.en * 100).toFixed(2)}% to ${(delta.after_share.en * 100).toFixed(2)}%.

R25AM improves the Chinese-first direction, but the full combined corpus still does not reach the future zh >= 70% / en <= 10% target under uniform sampling. Future review should either add more reviewed Chinese-personal rows or use an approved Chinese-first sampler before any bounded training.

Future tokenizer review requires fresh R25AN approval. Future decoder training requires a separate later approval after tokenizer/corpus review.
`;

fs.writeFileSync(SUMMARY_PATH, summary, "utf8");
console.log(JSON.stringify({
  ok: true,
  report: "artifacts/training_os/corpus_expansion/r25am/r25am_corpus_expansion_coverage.json",
  summary: "docs/R25AM_CORPUS_EXPANSION_SUMMARY.md",
  previous_rows: previous.rows,
  r25am_rows: promoted.rows,
  combined_rows: combined.rows,
  r25am_language_counts: promoted.language_counts,
  combined_language_counts: combined.language_counts,
  delta_toward_chinese_first_target: delta
}, null, 2));
