#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "artifacts/training_os/corpus_expansion/r25am");
const REPORT_PATH = path.join(OUT_DIR, "r25am_validation_report.json");
const CORPUS_DIR = path.join(ROOT, "training/llm_corpus");
const FILES = {
  train: "training/llm_corpus/r25am_repo_derived_train.jsonl",
  dev: "training/llm_corpus/r25am_repo_derived_dev.jsonl",
  heldout: "training/llm_corpus/r25am_repo_derived_heldout.jsonl"
};
const EXPECTED_COUNTS = { train: 768, dev: 96, heldout: 96 };
const TRANSFORMATIONS = [
  "project_continuation",
  "repair_after_weak_answer",
  "local_first_static_browser_reasoning",
  "tool_status_honesty",
  "bounded_judgment",
  "style_preference",
  "Chinese_explanation",
  "Chinese_rewrite_or_compression",
  "preference_pair",
  "repair_pair",
  "Chinese_follow_up_binding",
  "Chinese_project_decision"
];

function rel(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function readJsonl(relativePath) {
  const full = path.join(ROOT, relativePath);
  return fs.readFileSync(full, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return { ...JSON.parse(line), __file: relativePath, __line: index + 1 };
      } catch (error) {
        return { __file: relativePath, __line: index + 1, __parse_error: error.message };
      }
    });
}

function normalizeTarget(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[，。！？；：、]/g, " ")
    .replace(/[,.!?;:()[\]{}<>《》「」『』"']/g, " ")
    .replace(/\br25a[hijklm]_[a-z0-9_:-]+\b/gi, " ")
    .replace(/\bsource[_ -]?\d+\b/gi, " ")
    .replace(/\bsample[_ -]?\d+\b/gi, " ")
    .replace(/(?:^|\s)(?:第)?\d+(?:条|项|段|行)(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collect(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collect(item, out));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collect(item, out));
  return out;
}

function countBy(items, fn) {
  const counts = {};
  for (const item of items) {
    const key = fn(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function sourceAllowed(ref) {
  return !ref.startsWith("evals/") &&
    !ref.startsWith("data/public_ingestion/") &&
    !ref.startsWith("private_sources/") &&
    !ref.startsWith("artifacts/") &&
    !/^[^/]+\.(pdf|PDF|docx|DOCX|doc|DOC)$/.test(ref);
}

function priorCorpusTargets() {
  const targets = new Map();
  const files = fs.readdirSync(CORPUS_DIR)
    .filter((file) => file.endsWith(".jsonl"))
    .filter((file) => !file.startsWith("r25am_repo_derived_"));
  for (const file of files) {
    for (const row of readJsonl(`training/llm_corpus/${file}`)) {
      if (row.__parse_error) continue;
      const normalized = normalizeTarget(row.target_answer);
      if (!normalized) continue;
      if (!targets.has(normalized)) targets.set(normalized, []);
      targets.get(normalized).push(row.sample_id);
    }
  }
  return targets;
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const failures = [];
const rows = [];

for (const [split, relativePath] of Object.entries(FILES)) {
  const full = path.join(ROOT, relativePath);
  if (!fs.existsSync(full)) {
    failures.push({ code: "missing_r25am_corpus_file", file: relativePath });
    continue;
  }
  const splitRows = readJsonl(relativePath);
  rows.push(...splitRows);
  if (splitRows.length !== EXPECTED_COUNTS[split]) {
    failures.push({ code: "split_count_mismatch", split, expected: EXPECTED_COUNTS[split], actual: splitRows.length });
  }
}

const sampleIds = new Set();
const normalizedTargets = new Map();
const priorTargets = priorCorpusTargets();
const splitFingerprints = new Map();
const cleanRows = rows.filter((row) => !row.__parse_error);
const languageCounts = countBy(cleanRows, (row) => row.language || "missing");
const transformationCounts = countBy(cleanRows, (row) => row.transformation_type || "missing");
const personalTargetCounts = countBy(cleanRows.flatMap((row) => row.personal_color_targets || []), (target) => target);
const sourceCategoryCounts = countBy(cleanRows, (row) => row.source_category || "missing");

for (const row of rows) {
  const loc = { file: row.__file, line: row.__line, sample_id: row.sample_id || "" };
  if (row.__parse_error) {
    failures.push({ code: "jsonl_parse_error", error: row.__parse_error, ...loc });
    continue;
  }
  if (sampleIds.has(row.sample_id)) failures.push({ code: "duplicate_sample_id", ...loc });
  sampleIds.add(row.sample_id);
  const expectedFile = FILES[row.split];
  if (!expectedFile || row.__file !== expectedFile) failures.push({ code: "split_file_mismatch", split: row.split, ...loc });
  if (!["zh", "mixed", "en"].includes(row.language)) failures.push({ code: "invalid_language", language: row.language, ...loc });
  if (!TRANSFORMATIONS.includes(row.transformation_type)) failures.push({ code: "invalid_transformation_type", transformation_type: row.transformation_type, ...loc });
  if (!Array.isArray(row.messages) || row.messages.length === 0) failures.push({ code: "messages_missing", ...loc });
  if ((row.messages || []).some((message) => message.role === "system")) failures.push({ code: "system_role_not_allowed", ...loc });
  if (!row.target_answer || !String(row.target_answer).trim()) failures.push({ code: "empty_target_answer", ...loc });
  if (row.review_status !== "reviewed_for_training_corpus") failures.push({ code: "review_status_not_promoted", ...loc });
  if (row.training_allowed !== true) failures.push({ code: "training_allowed_not_true", ...loc });
  if (row.public_commit_allowed !== true) failures.push({ code: "public_commit_allowed_not_true", ...loc });
  if (row.contains_private_data !== false) failures.push({ code: "contains_private_data_not_false", ...loc });
  if (row.release_checkpoint === true) failures.push({ code: "release_checkpoint_true", ...loc });
  if (row.product_model === true) failures.push({ code: "product_model_true", ...loc });
  if (row.phase_4_scaled_training === true) failures.push({ code: "phase4_true", ...loc });
  if (row.provenance?.source_type !== "repo_derived" && row.provenance?.source_type !== "project_authored") failures.push({ code: "invalid_provenance_source_type", ...loc });
  if (row.provenance?.external_llm_used !== false) failures.push({ code: "external_llm_used_not_false", ...loc });
  if (row.provenance?.promotion_phase !== "R25AM") failures.push({ code: "promotion_phase_not_r25am", ...loc });
  if (row.provenance?.promoted_by !== "scripts/promote_r25am_second_chinese_corpus.mjs") failures.push({ code: "invalid_promoted_by", ...loc });
  if (row.provenance?.contains_private_data !== false) failures.push({ code: "provenance_private_data_not_false", ...loc });

  for (const ref of row.source_file_refs || []) {
    if (!sourceAllowed(ref)) failures.push({ code: "forbidden_source_ref", ref, ...loc });
  }
  if (!Array.isArray(row.source_hashes) || row.source_hashes.length === 0) failures.push({ code: "missing_source_hashes", ...loc });
  if (!Array.isArray(row.personal_color_targets) || row.personal_color_targets.length === 0) failures.push({ code: "missing_personal_color_targets", ...loc });

  const normalized = normalizeTarget(row.target_answer);
  if (!normalizedTargets.has(normalized)) normalizedTargets.set(normalized, []);
  normalizedTargets.get(normalized).push(row.sample_id);
  if (priorTargets.has(normalized)) failures.push({ code: "duplicate_target_against_prior_corpus", prior_sample_ids: priorTargets.get(normalized).slice(0, 5), ...loc });
  const splitKey = `${row.split}:${normalized}`;
  if (splitFingerprints.has(splitKey)) failures.push({ code: "duplicate_target_within_split", ...loc });
  splitFingerprints.set(splitKey, row.sample_id);

  const blob = collect(row).join("\n");
  if (/\/Users\/|\/private\/var\/|\/Volumes\//.test(blob)) failures.push({ code: "local_absolute_path", ...loc });
  if (/chain[_-]?of[_-]?thought|hidden_prompt|system_prompt|private_memory|raw_private_data/i.test(blob)) failures.push({ code: "forbidden_private_or_prompt_marker", ...loc });
  if (/(sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----)/.test(blob)) failures.push({ code: "secret_like_string", ...loc });
  if (/model training ran|training completed|tokenizer dry-run ran|tokenizer dry run ran|phase_4 approved|product model exists/i.test(blob)) {
    failures.push({ code: "forbidden_training_or_tokenizer_claim", ...loc });
  }
}

for (const [target, ids] of normalizedTargets.entries()) {
  if (ids.length > 1) failures.push({ code: "duplicate_normalized_target_answer", ids: ids.slice(0, 10), target: target.slice(0, 120) });
}

const splitCounts = countBy(cleanRows, (row) => row.split || "missing");
const totalRows = cleanRows.length || 1;
const zhShare = (languageCounts.zh || 0) / totalRows;
const enShare = (languageCounts.en || 0) / totalRows;
if (cleanRows.length !== 960) failures.push({ code: "promoted_total_not_960", actual: cleanRows.length });
if (zhShare < 0.8) failures.push({ code: "zh_share_below_80_percent", zhShare });
if (enShare > 0.05) failures.push({ code: "en_share_above_5_percent", enShare });
for (const transformation of TRANSFORMATIONS) {
  if (!transformationCounts[transformation]) failures.push({ code: "missing_transformation_type", transformation });
}

const staged = execFileSync("git", ["diff", "--cached", "--name-only"], { cwd: ROOT, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
const stagedArtifacts = staged.filter((file) => file.startsWith("artifacts/training_os/"));
if (stagedArtifacts.length) failures.push({ code: "generated_artifacts_staged", files: stagedArtifacts });

const report = {
  report_id: "r25am_validation_report",
  ok: failures.length === 0,
  promoted_total: cleanRows.length,
  split_counts: splitCounts,
  language_counts: languageCounts,
  language_shares: {
    zh: zhShare,
    mixed: (languageCounts.mixed || 0) / totalRows,
    en: enShare
  },
  transformation_counts: transformationCounts,
  personal_target_counts: personalTargetCounts,
  source_category_counts: sourceCategoryCounts,
  normalized_unique_target_count: normalizedTargets.size,
  safety: {
    training_ran: false,
    tokenizer_dry_run_ran: false,
    phase4_approved: false,
    root_pdf_docx_content_parsed: false,
    data_public_ingestion_content_parsed: false,
    private_sources_read: false,
    evals_used_as_source: false,
    generated_artifacts_staged: stagedArtifacts.length > 0
  },
  failures: failures.slice(0, 200)
};

fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  ok: report.ok,
  report: rel(REPORT_PATH),
  promoted_total: report.promoted_total,
  split_counts: splitCounts,
  language_counts: languageCounts,
  normalized_unique_target_count: normalizedTargets.size
}, null, 2));
if (!report.ok) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
