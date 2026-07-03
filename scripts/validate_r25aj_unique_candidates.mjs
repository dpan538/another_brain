#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "artifacts/training_os/corpus_expansion/r25aj");
const CANDIDATE_PATH = path.join(OUT_DIR, "r25aj_repo_derived_candidate_rows.jsonl");
const REPORT_PATH = path.join(OUT_DIR, "r25aj_validation_report.json");
const UNIQUENESS_REPORT_PATH = path.join(OUT_DIR, "r25aj_target_uniqueness_report.json");
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
  "repair_pair"
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
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid JSONL at line ${index + 1}: ${error.message}`);
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
    .replace(/\br25a[hijk]_[a-z0-9_:-]+\b/gi, " ")
    .replace(/\br25ah_repo_(?:source|derived)_\d+\b/gi, " ")
    .replace(/\bsource[_ -]?\d+\b/gi, " ")
    .replace(/\bsample[_ -]?\d+\b/gi, " ")
    .replace(/(?:^|\s)(?:第)?\d+(?:条|项|段|行)(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countBy(items, fn) {
  const counts = {};
  for (const item of items) {
    const key = fn(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function walkValues(value, visitor, pathParts = []) {
  visitor(value, pathParts);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkValues(item, visitor, [...pathParts, String(index)]));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      walkValues(item, visitor, [...pathParts, key]);
    }
  }
}

function hasSecretLikeString(text) {
  return /(sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----)/.test(text);
}

function sourceRefAllowed(ref) {
  if (ref.startsWith("evals/")) return false;
  if (ref.startsWith("data/public_ingestion/")) return false;
  if (ref.startsWith("private_sources/")) return false;
  if (ref.startsWith("artifacts/")) return false;
  if (!ref.includes("/") && /\.(pdf|PDF|docx|DOCX|doc|DOC)$/.test(ref)) return false;
  return true;
}

function isPromotionCapable(row) {
  return row.training_allowed === false &&
    row.public_commit_allowed === false &&
    row.review_status === "candidate_unreviewed" &&
    row.contains_private_data === false &&
    row.provenance?.source_type === "repo_derived" &&
    row.provenance?.external_llm_used === false &&
    Array.isArray(row.source_hashes) &&
    row.source_hashes.length > 0 &&
    Array.isArray(row.source_file_refs) &&
    row.source_file_refs.every(sourceRefAllowed) &&
    typeof row.target_answer === "string" &&
    row.target_answer.trim().length > 0;
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const failures = [];
let rows = [];

if (!fs.existsSync(CANDIDATE_PATH)) {
  failures.push("missing R25AJ candidate file");
} else {
  rows = readJsonl(CANDIDATE_PATH);
}

const uniquenessReport = readJsonIfPresent(UNIQUENESS_REPORT_PATH);
const staged = git(["diff", "--cached", "--name-only"]).split(/\r?\n/).filter(Boolean);
const stagedArtifacts = staged.filter((file) => file.startsWith("artifacts/training_os/corpus_expansion/r25aj/"));
const trackedCandidate = git(["ls-files", "--", rel(CANDIDATE_PATH)]).trim();
const trainingCorpusStatus = git(["status", "--short", "--", "training/llm_corpus"]).split(/\r?\n/).filter(Boolean);
const expectedPromotedCorpusStatus = /training\/llm_corpus\/r25a(?:k|m)_repo_derived_(train|dev|heldout)\.jsonl$/;
const unexpectedTrainingCorpusStatus = trainingCorpusStatus.filter((line) => !expectedPromotedCorpusStatus.test(line));

if (rows.length < 480) failures.push(`candidate row count below 480: ${rows.length}`);
if (stagedArtifacts.length) failures.push(`R25AJ artifact files staged: ${stagedArtifacts.join(", ")}`);
if (trackedCandidate) failures.push("R25AJ candidate artifact is tracked");
if (unexpectedTrainingCorpusStatus.length) failures.push(`training/llm_corpus has unexpected worktree changes: ${unexpectedTrainingCorpusStatus.join("; ")}`);

const seenIds = new Set();
const normalizedTargets = new Map();
const promotionCapableTargets = new Set();
const languageCounts = countBy(rows, (row) => row.language || "missing");
const totalRows = rows.length || 1;
const transformationCounts = countBy(rows, (row) => row.transformation_type || "missing");
const personalTargetCounts = countBy(rows.flatMap((row) => row.personal_color_targets || []), (target) => target);
const sourceCategoryCounts = countBy(rows, (row) => row.source_category || "missing");

for (const [index, row] of rows.entries()) {
  const id = row.sample_id || `row_${index + 1}`;
  if (seenIds.has(id)) failures.push(`duplicate sample_id: ${id}`);
  seenIds.add(id);

  if (!TRANSFORMATIONS.includes(row.transformation_type)) failures.push(`${id}: unknown transformation type`);
  if (!["zh", "mixed", "en"].includes(row.language)) failures.push(`${id}: invalid language`);
  if (!["train", "dev", "heldout_candidate"].includes(row.split_suggestion)) failures.push(`${id}: invalid split_suggestion`);
  if (!Array.isArray(row.messages) || !row.messages.length) failures.push(`${id}: missing messages`);
  if ((row.messages || []).some((message) => message.role === "system")) failures.push(`${id}: system role is not allowed`);
  if (row.training_allowed !== false) failures.push(`${id}: training_allowed must remain false`);
  if (row.public_commit_allowed !== false) failures.push(`${id}: public_commit_allowed must remain false`);
  if (row.review_status !== "candidate_unreviewed") failures.push(`${id}: review_status must remain candidate_unreviewed`);
  if (row.contains_private_data !== false) failures.push(`${id}: contains_private_data must be false`);
  if (row.provenance?.source_type !== "repo_derived") failures.push(`${id}: provenance.source_type must be repo_derived`);
  if (row.provenance?.external_llm_used !== false) failures.push(`${id}: external_llm_used must be false`);
  if (row.provenance?.source_review_status !== "tracked_project_source") failures.push(`${id}: source_review_status must be tracked_project_source`);
  if (!Array.isArray(row.source_hashes) || !row.source_hashes.length) failures.push(`${id}: missing source_hashes`);
  if (!Array.isArray(row.source_file_refs) || !row.source_file_refs.length) failures.push(`${id}: missing source_file_refs`);
  for (const ref of row.source_file_refs || []) {
    if (!sourceRefAllowed(ref)) failures.push(`${id}: forbidden source ref ${ref}`);
  }
  if (!Array.isArray(row.personal_color_targets) || !row.personal_color_targets.length) failures.push(`${id}: missing personal_color_targets`);
  if (!row.review_rubric || row.review_rubric.promotion_ready_by_default !== false) failures.push(`${id}: missing inert review_rubric`);
  if (row.release_checkpoint === true) failures.push(`${id}: release_checkpoint claim`);
  if (row.product_model === true) failures.push(`${id}: product_model claim`);

  const normalized = normalizeTarget(row.target_answer);
  if (!normalized) failures.push(`${id}: empty normalized target_answer`);
  if (!normalizedTargets.has(normalized)) normalizedTargets.set(normalized, []);
  normalizedTargets.get(normalized).push(id);
  if (isPromotionCapable(row)) promotionCapableTargets.add(normalized);

  if (String(row.target_answer || "").length > 560) failures.push(`${id}: target_answer too long`);
  if (/\/Users\//.test(JSON.stringify(row))) failures.push(`${id}: local absolute path leakage`);
  if (/evals\//i.test(JSON.stringify(row.source_file_refs || []))) failures.push(`${id}: eval path source leakage`);
  if (/data\/public_ingestion/i.test(JSON.stringify(row.source_file_refs || []))) failures.push(`${id}: public ingestion source leakage`);
  if (/private_sources/i.test(JSON.stringify(row.source_file_refs || []))) failures.push(`${id}: private source leakage`);
  if (/model training ran|training completed|phase_4 approved|product model exists/i.test(JSON.stringify(row))) failures.push(`${id}: forbidden completion claim`);

  walkValues(row, (value, parts) => {
    if (parts.some((part) => /chain[_-]?of[_-]?thought|hidden_prompt|system_prompt|private_memory|raw_private_data/i.test(part))) {
      failures.push(`${id}: forbidden field path ${parts.join(".")}`);
    }
    if (typeof value !== "string") return;
    if (/chain[_-]?of[_-]?thought|hidden_prompt|system_prompt|private_memory|raw_private_data/i.test(value)) {
      failures.push(`${id}: forbidden marker in text`);
    }
    if (hasSecretLikeString(value)) failures.push(`${id}: secret-like string`);
    if (value.length > 900) failures.push(`${id}: overly long string field`);
  });
}

const duplicateTargetGroups = [...normalizedTargets.entries()].filter(([, ids]) => ids.length > 1);
const zhShare = (languageCounts.zh || 0) / totalRows;
const enShare = (languageCounts.en || 0) / totalRows;
const normalizedUniqueTargetCount = normalizedTargets.size;
const promotionCapableUniqueCandidateCount = promotionCapableTargets.size;

if (normalizedUniqueTargetCount < 400) failures.push(`normalized unique target count below 400: ${normalizedUniqueTargetCount}`);
if (promotionCapableUniqueCandidateCount < 360) failures.push(`promotion-capable unique candidates below 360: ${promotionCapableUniqueCandidateCount}`);
if (duplicateTargetGroups.length) failures.push(`duplicate normalized target groups present: ${duplicateTargetGroups.length}`);
if (zhShare < 0.7) failures.push(`zh share below 0.7: ${zhShare}`);
if (enShare > 0.1) failures.push(`en share above 0.1: ${enShare}`);
for (const transformation of TRANSFORMATIONS) {
  if ((transformationCounts[transformation] || 0) < 32) failures.push(`${transformation} count below 32`);
}
for (const target of PERSONAL_TARGETS) {
  if ((personalTargetCounts[target] || 0) < 48) failures.push(`${target} personal target coverage below 48`);
}
if (uniquenessReport && uniquenessReport.ok !== true) failures.push("target uniqueness report is not ok");

const report = {
  report_id: "r25aj_validation_report",
  ok: failures.length === 0,
  generated_at: new Date().toISOString(),
  candidate_file: rel(CANDIDATE_PATH),
  safety: {
    training_ran: false,
    prior_pilot_reran: false,
    promotion_ran: false,
    corpus_rows_promoted: false,
    training_llm_corpus_modified: unexpectedTrainingCorpusStatus.length > 0,
    root_pdf_docx_content_parsed: false,
    data_public_ingestion_content_parsed: false,
    private_sources_read: false,
    eval_sources_used: false,
    external_api_used: false,
    phase_4_scaled_training_approved: false,
    candidate_rows_staged: stagedArtifacts.length > 0,
    candidate_rows_tracked: Boolean(trackedCandidate)
  },
  checks: {
    candidate_file_exists: fs.existsSync(CANDIDATE_PATH),
    rows_parse_as_jsonl: rows.length > 0,
    rows_gte_480: rows.length >= 480,
    normalized_unique_target_gte_400: normalizedUniqueTargetCount >= 400,
    promotion_capable_unique_gte_360: promotionCapableUniqueCandidateCount >= 360,
    all_transformations_represented: TRANSFORMATIONS.every((transformation) => (transformationCounts[transformation] || 0) >= 32),
    training_llm_corpus_unchanged: unexpectedTrainingCorpusStatus.length === 0,
    no_candidate_rows_staged_or_tracked: stagedArtifacts.length === 0 && !trackedCandidate,
    zh_share_meets_target: zhShare >= 0.7,
    en_share_meets_cap: enShare <= 0.1
  },
  summary: {
    row_count: rows.length,
    normalized_unique_target_answer_count: normalizedUniqueTargetCount,
    promotion_capable_unique_candidate_count: promotionCapableUniqueCandidateCount,
    rows_by_language: languageCounts,
    language_shares: {
      zh: zhShare,
      mixed: (languageCounts.mixed || 0) / totalRows,
      en: enShare
    },
    rows_by_transformation_type: transformationCounts,
    personal_target_coverage: personalTargetCounts,
    rows_by_source_category: sourceCategoryCounts,
    warning_count: failures.length
  },
  failures: failures.slice(0, 200)
};

fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  report: rel(REPORT_PATH),
  row_count: rows.length,
  normalized_unique_target_answer_count: normalizedUniqueTargetCount,
  promotion_capable_unique_candidate_count: promotionCapableUniqueCandidateCount,
  rows_by_language: languageCounts
}, null, 2));
