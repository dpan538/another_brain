#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS_DIR = resolve(ROOT, "training/llm_corpus");
const REPORT_PATH = "artifacts/training_os/corpus_review/r25al/r25al_expanded_corpus_quality.json";
const SUMMARY_PATH = "docs/R25AL_EXPANDED_CORPUS_QUALITY_SUMMARY.md";
const FORBIDDEN_SOURCE_RE = /^(evals\/|private_sources\/|data\/public_ingestion\/|artifacts\/)|(^|\/)[^/]+\.(pdf|PDF|docx|DOCX|doc|DOC)$/;

function normalizeTarget(text = "") {
  return String(text || "")
    .normalize("NFC")
    .replace(/[，。！？；：、,.!?;:()[\]{}"'“”‘’]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase()
    .trim();
}

function countKey(map, key, inc = 1) {
  const value = key === undefined || key === null || key === "" ? "unspecified" : String(key);
  map[value] = (map[value] || 0) + inc;
}

function collectStrings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, out));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectStrings(item, out));
  return out;
}

function collectForbiddenKeys(value, path = "$", out = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectForbiddenKeys(item, `${path}[${index}]`, out));
  } else if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (/^(chain_of_thought|hidden_prompt|system_prompt|raw_private_data|private_memory)$/i.test(key)) {
        out.push({ path: `${path}.${key}`, key });
      }
      collectForbiddenKeys(nested, `${path}.${key}`, out);
    }
  }
  return out;
}

function sourceFileRefs(row) {
  const refs = [];
  if (Array.isArray(row.source_file_refs)) refs.push(...row.source_file_refs);
  for (const evidence of Array.isArray(row.retrieved_evidence) ? row.retrieved_evidence : []) {
    if (typeof evidence?.source_id === "string") refs.push(evidence.source_id);
  }
  return refs;
}

async function readJsonl(file) {
  const text = await readFile(join(CORPUS_DIR, file), "utf8");
  const rows = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      rows.push({ row: JSON.parse(line), file, line: index + 1 });
    } catch (error) {
      rows.push({ row: null, file, line: index + 1, parse_error: error.message });
    }
  }
  return rows;
}

async function writeJson(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(path, text) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, text, "utf8");
}

async function main() {
  const files = (await readdir(CORPUS_DIR)).filter((file) => file.endsWith(".jsonl")).sort();
  const entries = [];
  for (const file of files) entries.push(...(await readJsonl(file)));

  const rows = entries.filter((entry) => entry.row).map((entry) => ({ ...entry.row, __file: entry.file, __line: entry.line }));
  const parseErrors = entries.filter((entry) => entry.parse_error);
  const byFile = {};
  const bySplit = {};
  const languageCounts = {};
  const languageByFile = {};
  const transformationCounts = {};
  const personalTargetCounts = {};
  const provenanceCounts = {};
  const reviewStatusCounts = {};
  const privateDataFlagCounts = {};
  const publicCommitAllowedCounts = {};
  const trainingAllowedCounts = {};
  const sourceCategoryCounts = {};
  const targetLengthsByLanguage = {};
  const targetCountsByLanguage = {};
  const targetMap = new Map();
  const normalizedTargetMap = new Map();
  const forbiddenSourceRefs = [];
  const privateMarkers = [];
  let targetAnswerCount = 0;
  let rejectedAnswersRows = 0;
  let rejectedAnswersTotal = 0;
  let shortTargetRiskRows = 0;

  for (const row of rows) {
    countKey(byFile, row.__file);
    countKey(bySplit, row.split);
    countKey(languageCounts, row.language);
    languageByFile[row.__file] ||= {};
    countKey(languageByFile[row.__file], row.language);
    countKey(transformationCounts, row.transformation_type || row.task_family || "legacy_task_family");
    for (const target of Array.isArray(row.personal_color_targets) ? row.personal_color_targets : []) countKey(personalTargetCounts, target);
    countKey(provenanceCounts, row.provenance?.source_type || "unknown");
    countKey(reviewStatusCounts, row.review_status || "unknown");
    countKey(privateDataFlagCounts, String(row.contains_private_data));
    countKey(publicCommitAllowedCounts, String(row.public_commit_allowed));
    countKey(trainingAllowedCounts, String(row.training_allowed));
    countKey(sourceCategoryCounts, row.source_category || "legacy_or_unspecified");

    const target = String(row.target_answer || "").trim();
    if (target) {
      targetAnswerCount += 1;
      const language = row.language || "unspecified";
      targetLengthsByLanguage[language] = (targetLengthsByLanguage[language] || 0) + target.length;
      targetCountsByLanguage[language] = (targetCountsByLanguage[language] || 0) + 1;
      if (target.length < 24) shortTargetRiskRows += 1;
      const rawHash = createHash("sha256").update(target).digest("hex");
      const normalizedHash = createHash("sha256").update(normalizeTarget(target)).digest("hex");
      if (!targetMap.has(rawHash)) targetMap.set(rawHash, 0);
      if (!normalizedTargetMap.has(normalizedHash)) normalizedTargetMap.set(normalizedHash, 0);
      targetMap.set(rawHash, targetMap.get(rawHash) + 1);
      normalizedTargetMap.set(normalizedHash, normalizedTargetMap.get(normalizedHash) + 1);
    }

    if (Array.isArray(row.rejected_answers) && row.rejected_answers.length) {
      rejectedAnswersRows += 1;
      rejectedAnswersTotal += row.rejected_answers.length;
    }

    for (const ref of sourceFileRefs(row)) {
      if (FORBIDDEN_SOURCE_RE.test(ref)) forbiddenSourceRefs.push({ file: row.__file, line: row.__line, source_ref_hash: createHash("sha256").update(ref).digest("hex") });
    }
    for (const marker of collectForbiddenKeys(row)) {
      privateMarkers.push({ file: row.__file, line: row.__line, marker: marker.key, path: marker.path });
    }
  }

  const avgTargetLengthByLanguage = {};
  for (const [language, chars] of Object.entries(targetLengthsByLanguage)) {
    avgTargetLengthByLanguage[language] = Math.round((chars / Math.max(1, targetCountsByLanguage[language])) * 10) / 10;
  }
  const duplicateTargetCount = [...targetMap.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  const normalizedDuplicateTargetCount = [...normalizedTargetMap.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  const r25akRows = rows.filter((row) => String(row.__file).startsWith("r25ak_repo_derived_"));
  const r25akLanguageCounts = {};
  for (const row of r25akRows) countKey(r25akLanguageCounts, row.language);
  const zhShare = rows.length ? (languageCounts.zh || 0) / rows.length : 0;
  const warnings = [];
  if (zhShare < 0.7) warnings.push("combined_corpus_below_future_zh_70_target");
  if (normalizedDuplicateTargetCount > 0) warnings.push("normalized_duplicate_targets_present");
  if (shortTargetRiskRows > rows.length * 0.1) warnings.push("short_target_risk_above_10_percent");

  const report = {
    ok: parseErrors.length === 0 && forbiddenSourceRefs.length === 0 && privateMarkers.length === 0,
    phase: "R25AL",
    files,
    file_count: files.length,
    total_rows: rows.length,
    row_counts_by_file: byFile,
    row_counts_by_split: bySplit,
    language_counts: languageCounts,
    language_counts_by_file: languageByFile,
    r25ak_contribution: {
      rows: r25akRows.length,
      language_counts: r25akLanguageCounts
    },
    target_answer_count: targetAnswerCount,
    rejected_answers_rows: rejectedAnswersRows,
    rejected_answers_total: rejectedAnswersTotal,
    duplicate_target_answer_count: duplicateTargetCount,
    normalized_duplicate_target_answer_count: normalizedDuplicateTargetCount,
    transformation_type_counts: transformationCounts,
    personal_target_counts: personalTargetCounts,
    provenance_counts: provenanceCounts,
    review_status_counts: reviewStatusCounts,
    private_data_flag_counts: privateDataFlagCounts,
    public_commit_allowed_counts: publicCommitAllowedCounts,
    training_allowed_counts: trainingAllowedCounts,
    source_category_counts: sourceCategoryCounts,
    average_target_length_by_language: avgTargetLengthByLanguage,
    short_target_risk_rows: shortTargetRiskRows,
    boilerplate_repeated_template_risk: normalizedDuplicateTargetCount > 0 ? "review_duplicates_before_training" : "low",
    chinese_first_gap: {
      target_zh_min: 0.7,
      combined_zh_share: Math.round(zhShare * 10000) / 10000,
      remaining_gap_to_70_percent_rows: Math.max(0, Math.ceil(0.7 * rows.length - (languageCounts.zh || 0))),
      r25ak_subset_zh_share: r25akRows.length ? Math.round(((r25akLanguageCounts.zh || 0) / r25akRows.length) * 10000) / 10000 : 0
    },
    parse_errors: parseErrors,
    forbidden_source_refs: forbiddenSourceRefs,
    private_markers: privateMarkers,
    warnings,
    safety: {
      decoder_training_ran: false,
      small_pilot_training_ran: false,
      phase4_scaled_training_ran: false,
      private_sources_read: false,
      root_pdf_docx_parsed: false,
      data_public_ingestion_parsed: false,
      tokenizer_artifacts_committed: false,
      weights_committed: false
    }
  };

  await writeJson(REPORT_PATH, report);
  const summary = `# R25AL Expanded Corpus Quality Summary

R25AL reviewed tracked corpus JSONL files only. It did not read evals as training data, did not read \`private_sources/\`, did not parse root PDFs/DOCX, and did not parse \`data/public_ingestion/\`.

## Aggregate Counts

- Corpus files: ${files.length}
- Total rows: ${rows.length}
- Split counts: train ${bySplit.train || 0}, dev ${bySplit.dev || 0}, heldout ${bySplit.heldout || 0}
- Language counts: zh ${languageCounts.zh || 0}, mixed ${languageCounts.mixed || 0}, en ${languageCounts.en || 0}
- R25AK contribution: ${r25akRows.length} rows; zh ${r25akLanguageCounts.zh || 0}, mixed ${r25akLanguageCounts.mixed || 0}, en ${r25akLanguageCounts.en || 0}
- Target-answer rows: ${targetAnswerCount}
- Rejected-answer coverage: ${rejectedAnswersRows} rows / ${rejectedAnswersTotal} rejected answers
- Normalized duplicate target count: ${normalizedDuplicateTargetCount}

## Review Notes

R25AK improved the Chinese-first direction, but the combined corpus zh share is ${Math.round(zhShare * 10000) / 100}%, below the future 70% target for uniform full-corpus use. A later R25AM review must either use Chinese-first sampling or add more reviewed Chinese personal rows. Tokenizer artifacts and weights remain uncommitted.
`;
  await writeText(SUMMARY_PATH, summary);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
