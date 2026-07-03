#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "artifacts/training_os/corpus_expansion/r25am");
const CANDIDATE_PATH = path.join(OUT_DIR, "r25am_candidate_rows.jsonl");
const REPORT_PATH = path.join(OUT_DIR, "r25am_candidate_validation_report.json");
const CORPUS_DIR = path.join(ROOT, "training/llm_corpus");
const R25AJ_CANDIDATE_PATH = path.join(ROOT, "artifacts/training_os/corpus_expansion/r25aj/r25aj_repo_derived_candidate_rows.jsonl");
const APPROVAL_PATH = path.join(ROOT, "training/from_scratch/APPROVE_R25AM_SECOND_CHINESE_CORPUS_EXPANSION.json");
const R25AM_PROMOTED_FILES = new Set([
  "training/llm_corpus/r25am_repo_derived_train.jsonl",
  "training/llm_corpus/r25am_repo_derived_dev.jsonl",
  "training/llm_corpus/r25am_repo_derived_heldout.jsonl"
]);

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

const PERSONAL_TARGETS = [
  "project_continuation",
  "repair_after_weak_answer",
  "local_first_static_browser_reasoning",
  "style_preference",
  "tool_status_honesty",
  "bounded_judgment"
];

function rel(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
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

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${rel(filePath)}:${index + 1}: ${error.message}`);
      }
    });
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function countBy(items, fn) {
  const counts = {};
  for (const item of items) {
    const key = fn(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function collectStrings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, out));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectStrings(item, out));
  return out;
}

function walk(value, visitor, pathParts = []) {
  visitor(value, pathParts);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visitor, [...pathParts, String(index)]));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) walk(item, visitor, [...pathParts, key]);
  }
}

function sourceAllowed(ref) {
  return !ref.startsWith("evals/") &&
    !ref.startsWith("data/public_ingestion/") &&
    !ref.startsWith("private_sources/") &&
    !ref.startsWith("artifacts/") &&
    !/^[^/]+\.(pdf|PDF|docx|DOCX|doc|DOC)$/.test(ref);
}

function hasForbiddenBlob(row) {
  const blob = collectStrings(row).join("\n");
  if (/\/Users\/|\/private\/var\/|\/Volumes\//.test(blob)) return "local_absolute_path";
  if (/(sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----)/.test(blob)) return "secret_like_string";
  if (/chain[_-]?of[_-]?thought|hidden_prompt|system_prompt|private_memory|raw_private_data/i.test(blob)) return "forbidden_private_or_prompt_marker";
  if (/model training ran|training completed|tokenizer dry-run ran|tokenizer dry run ran|phase_4 approved|product model exists/i.test(blob)) {
    return "forbidden_completion_claim";
  }
  return null;
}

function promotionCapable(row) {
  return row.training_allowed === false &&
    row.public_commit_allowed === false &&
    row.review_status === "candidate_unreviewed" &&
    row.contains_private_data === false &&
    row.provenance?.source_type === "repo_derived" &&
    row.provenance?.generator === "scripts/generate_r25am_second_chinese_candidates.mjs" &&
    row.provenance?.external_llm_used === false &&
    row.provenance?.source_review_status === "tracked_project_source" &&
    Array.isArray(row.source_hashes) &&
    row.source_hashes.length > 0 &&
    Array.isArray(row.source_file_refs) &&
    row.source_file_refs.length > 0 &&
    row.source_file_refs.every(sourceAllowed) &&
    typeof row.target_answer === "string" &&
    row.target_answer.trim().length > 0;
}

function existingCorpusTargets() {
  const targets = new Set();
  const files = fs.readdirSync(CORPUS_DIR)
    .filter((file) => file.endsWith(".jsonl"))
    .filter((file) => !file.startsWith("r25am_repo_derived_"));
  for (const file of files) {
    for (const row of readJsonl(path.join(CORPUS_DIR, file))) {
      const normalized = normalizeTarget(row.target_answer);
      if (normalized) targets.add(normalized);
    }
  }
  return targets;
}

function r25amPromotionComplete() {
  if (!fs.existsSync(APPROVAL_PATH)) return false;
  try {
    const approval = JSON.parse(fs.readFileSync(APPROVAL_PATH, "utf8"));
    return approval.approved === true &&
      approval.consumed === true &&
      approval.allow_additional_runs === false &&
      [...R25AM_PROMOTED_FILES].every((file) => fs.existsSync(path.join(ROOT, file)));
  } catch {
    return false;
  }
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const failures = [];
let rows = [];
try {
  rows = readJsonl(CANDIDATE_PATH);
} catch (error) {
  failures.push({ code: "candidate_jsonl_parse_error", detail: error.message });
}

const existingTargets = existingCorpusTargets();
const r25ajTargets = new Set(readJsonl(R25AJ_CANDIDATE_PATH).map((row) => normalizeTarget(row.target_answer)).filter(Boolean));
const normalizedTargets = new Map();
const promotionCapableTargets = new Set();
const sampleIds = new Set();
const languageCounts = countBy(rows, (row) => row.language || "missing");
const transformationCounts = countBy(rows, (row) => row.transformation_type || "missing");
const personalTargetCounts = countBy(rows.flatMap((row) => row.personal_color_targets || []), (target) => target);
const sourceCategoryCounts = countBy(rows, (row) => row.source_category || "missing");

for (const [index, row] of rows.entries()) {
  const id = row.sample_id || `row_${index + 1}`;
  if (sampleIds.has(id)) failures.push({ code: "duplicate_sample_id", sample_id: id });
  sampleIds.add(id);
  if (!TRANSFORMATIONS.includes(row.transformation_type)) failures.push({ code: "invalid_transformation_type", sample_id: id, transformation_type: row.transformation_type });
  if (!["zh", "mixed", "en"].includes(row.language)) failures.push({ code: "invalid_language", sample_id: id, language: row.language });
  if (!["train", "dev", "heldout_candidate"].includes(row.split_suggestion)) failures.push({ code: "invalid_split_suggestion", sample_id: id, split_suggestion: row.split_suggestion });
  if (!Array.isArray(row.messages) || row.messages.length === 0) failures.push({ code: "missing_messages", sample_id: id });
  if ((row.messages || []).some((message) => message.role === "system")) failures.push({ code: "system_role_not_allowed", sample_id: id });
  if (!row.review_rubric || row.review_rubric.promotion_ready_by_default !== false) failures.push({ code: "missing_inert_review_rubric", sample_id: id });
  if (row.training_allowed !== false) failures.push({ code: "training_allowed_not_false", sample_id: id });
  if (row.public_commit_allowed !== false) failures.push({ code: "public_commit_allowed_not_false", sample_id: id });
  if (row.review_status !== "candidate_unreviewed") failures.push({ code: "review_status_not_candidate_unreviewed", sample_id: id });
  if (row.contains_private_data !== false) failures.push({ code: "contains_private_data_not_false", sample_id: id });
  if (row.product_model !== false) failures.push({ code: "product_model_not_false", sample_id: id });
  if (row.release_checkpoint !== false) failures.push({ code: "release_checkpoint_not_false", sample_id: id });
  if (row.phase_4_scaled_training !== false) failures.push({ code: "phase4_not_false", sample_id: id });
  for (const ref of row.source_file_refs || []) {
    if (!sourceAllowed(ref)) failures.push({ code: "forbidden_source_ref", sample_id: id, ref });
  }
  if (!Array.isArray(row.source_hashes) || row.source_hashes.length === 0) failures.push({ code: "missing_source_hashes", sample_id: id });
  if (!Array.isArray(row.personal_color_targets) || row.personal_color_targets.length === 0) failures.push({ code: "missing_personal_targets", sample_id: id });
  if (String(row.target_answer || "").length > 700) failures.push({ code: "target_answer_too_long", sample_id: id });

  const normalized = normalizeTarget(row.target_answer);
  if (!normalized) failures.push({ code: "empty_normalized_target_answer", sample_id: id });
  if (!normalizedTargets.has(normalized)) normalizedTargets.set(normalized, []);
  normalizedTargets.get(normalized).push(id);
  if (existingTargets.has(normalized)) failures.push({ code: "duplicate_against_existing_corpus", sample_id: id });
  if (r25ajTargets.has(normalized)) failures.push({ code: "duplicate_against_r25aj_candidates", sample_id: id });
  if (promotionCapable(row)) promotionCapableTargets.add(normalized);

  const forbiddenBlob = hasForbiddenBlob(row);
  if (forbiddenBlob) failures.push({ code: forbiddenBlob, sample_id: id });
  walk(row, (value, parts) => {
    if (parts.some((part) => /chain[_-]?of[_-]?thought|hidden_prompt|system_prompt|private_memory|raw_private_data/i.test(part))) {
      failures.push({ code: "forbidden_field_path", sample_id: id, path: parts.join(".") });
    }
  });
}

const duplicateTargetGroups = [...normalizedTargets.entries()].filter(([, ids]) => ids.length > 1);
for (const [target, ids] of duplicateTargetGroups.slice(0, 20)) {
  failures.push({ code: "duplicate_normalized_target_answer", ids: ids.slice(0, 10), target: target.slice(0, 120) });
}

const totalRows = rows.length || 1;
const zhShare = (languageCounts.zh || 0) / totalRows;
const enShare = (languageCounts.en || 0) / totalRows;
if (rows.length < 1200) failures.push({ code: "row_count_below_1200", rows: rows.length });
if (normalizedTargets.size < 1100) failures.push({ code: "normalized_unique_target_count_below_1100", normalized_unique_target_count: normalizedTargets.size });
if (promotionCapableTargets.size < 960) failures.push({ code: "promotion_capable_unique_candidates_below_960", promotion_capable_unique_candidate_count: promotionCapableTargets.size });
if (zhShare < 0.8) failures.push({ code: "zh_share_below_80_percent", zhShare });
if (enShare > 0.05) failures.push({ code: "en_share_above_5_percent", enShare });
for (const transformation of TRANSFORMATIONS) {
  if (!transformationCounts[transformation]) failures.push({ code: "missing_transformation_type", transformation });
}
for (const target of PERSONAL_TARGETS) {
  if (!personalTargetCounts[target]) failures.push({ code: "missing_personal_target_coverage", target });
}

const staged = git(["diff", "--cached", "--name-only"]).split(/\r?\n/).filter(Boolean);
const stagedCandidates = staged.filter((file) => file.startsWith("artifacts/training_os/corpus_expansion/r25am/"));
if (stagedCandidates.length) failures.push({ code: "candidate_artifacts_staged", files: stagedCandidates });
const trackedCandidate = git(["ls-files", "--", rel(CANDIDATE_PATH)]).trim();
if (trackedCandidate) failures.push({ code: "candidate_artifact_tracked", file: trackedCandidate });
const corpusStatus = git(["status", "--short", "--", "training/llm_corpus"]).split(/\r?\n/).filter(Boolean);
const promotionComplete = r25amPromotionComplete();
const unexpectedCorpusStatus = corpusStatus.filter((line) => {
  const file = line.replace(/^.. /, "");
  return /r25am_repo_derived_/.test(line) && !(promotionComplete && R25AM_PROMOTED_FILES.has(file));
});
if (unexpectedCorpusStatus.length) failures.push({ code: "training_corpus_modified_before_promotion", corpusStatus: unexpectedCorpusStatus });

const report = {
  ok: failures.length === 0,
  report_id: "r25am_candidate_validation_report",
  candidate_file: rel(CANDIDATE_PATH),
  row_count: rows.length,
  normalized_unique_target_answer_count: normalizedTargets.size,
  promotion_capable_unique_candidate_count: promotionCapableTargets.size,
  language_counts: languageCounts,
  language_shares: {
    zh: zhShare,
    mixed: (languageCounts.mixed || 0) / totalRows,
    en: enShare
  },
  split_suggestion_counts: countBy(rows, (row) => row.split_suggestion || "missing"),
  transformation_counts: transformationCounts,
  personal_target_counts: personalTargetCounts,
  source_category_counts: sourceCategoryCounts,
  duplicate_target_group_count: duplicateTargetGroups.length,
  safety: {
    training_ran: false,
    tokenizer_dry_run_ran: false,
    phase4_approved: false,
    root_pdf_docx_content_parsed: false,
    data_public_ingestion_content_parsed: false,
    private_sources_read: false,
    eval_sources_used: false,
    candidate_rows_staged: stagedCandidates.length > 0,
    candidate_rows_tracked: Boolean(trackedCandidate)
  },
  failures: failures.slice(0, 200)
};

writeJson(REPORT_PATH, report);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
