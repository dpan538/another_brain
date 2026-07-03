#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "artifacts/training_os/corpus_expansion/r25ah");
const SELECTION_PATH = path.join(OUT_DIR, "r25ah_selected_repo_sources.json");
const CANDIDATE_PATH = path.join(OUT_DIR, "r25ah_repo_derived_candidate_rows.jsonl");
const REPORT_PATH = path.join(OUT_DIR, "r25ah_validation_report.json");
const MAX_ROWS = 1000;

function rel(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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

function textOf(row) {
  return JSON.stringify(row);
}

function hasSecretLikeString(text) {
  return /(sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----)/.test(text);
}

function languageOk(rows) {
  const counts = countBy(rows, (row) => row.language);
  const total = rows.length || 1;
  return {
    counts,
    zh_share: (counts.zh || 0) / total,
    mixed_share: (counts.mixed || 0) / total,
    en_share: (counts.en || 0) / total
  };
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const failures = [];

if (!fs.existsSync(SELECTION_PATH)) failures.push("missing selected source report");
if (!fs.existsSync(CANDIDATE_PATH)) failures.push("missing candidate rows");

let selection = null;
let rows = [];
if (!failures.length) {
  selection = readJson(SELECTION_PATH);
  rows = readJsonl(CANDIDATE_PATH);
}

const staged = git(["diff", "--cached", "--name-only"]).split(/\r?\n/).filter(Boolean);
const tracked = git(["ls-files", "--", rel(CANDIDATE_PATH)]).trim();
const stagedArtifacts = staged.filter((file) => file.startsWith("artifacts/training_os/corpus_expansion/r25ah/"));
const trainingCorpusStatus = git(["status", "--short", "--", "training/llm_corpus"]).trim();

if (tracked) failures.push("candidate rows are tracked");
if (stagedArtifacts.length) failures.push(`R25AH artifact files staged: ${stagedArtifacts.join(", ")}`);
if (trainingCorpusStatus) failures.push(`training/llm_corpus has worktree changes: ${trainingCorpusStatus}`);
if (rows.length === 0) failures.push("candidate rows are empty");
if (rows.length > MAX_ROWS) failures.push(`candidate rows exceed max ${MAX_ROWS}`);

const allowedSourceIds = new Set((selection?.selected_sources || []).map((source) => source.source_id));
const allowedSourceRefs = new Set((selection?.selected_sources || []).map((source) => source.path));
const seenIds = new Set();

for (const [index, row] of rows.entries()) {
  const id = row.sample_id || `row_${index + 1}`;
  if (seenIds.has(id)) failures.push(`duplicate sample_id: ${id}`);
  seenIds.add(id);

  if (row.training_allowed !== false) failures.push(`${id}: training_allowed must be false`);
  if (row.public_commit_allowed !== false) failures.push(`${id}: public_commit_allowed must be false`);
  if (row.review_status !== "candidate_unreviewed") failures.push(`${id}: review_status must be candidate_unreviewed`);
  if (row.contains_private_data !== false) failures.push(`${id}: contains_private_data must be false`);
  if (row.provenance?.external_llm_used !== false) failures.push(`${id}: external_llm_used must be false`);
  if (row.provenance?.source_type !== "repo_derived") failures.push(`${id}: source_type must be repo_derived`);
  if (!Array.isArray(row.source_hashes) || !row.source_hashes.length) failures.push(`${id}: missing source_hashes`);
  if (!Array.isArray(row.source_ids) || !row.source_ids.every((sourceId) => allowedSourceIds.has(sourceId))) failures.push(`${id}: source_ids not selected`);
  if (!Array.isArray(row.source_file_refs) || !row.source_file_refs.every((ref) => allowedSourceRefs.has(ref))) failures.push(`${id}: source_file_refs not selected`);

  for (const ref of row.source_file_refs || []) {
    if (ref.startsWith("evals/")) failures.push(`${id}: eval source reference`);
    if (ref.startsWith("data/public_ingestion/")) failures.push(`${id}: data/public_ingestion source reference`);
    if (ref.startsWith("private_sources/")) failures.push(`${id}: private_sources reference`);
    if (ref.startsWith("artifacts/")) failures.push(`${id}: artifact source reference`);
    if (!ref.includes("/") && /\.(pdf|PDF|docx|DOCX|doc|DOC)$/.test(ref)) failures.push(`${id}: root document source reference`);
  }

  walkValues(row, (value, parts) => {
    if (parts.some((part) => /chain[_-]?of[_-]?thought|hidden_prompt|system_prompt|private_memory|raw_private_data/i.test(part))) {
      failures.push(`${id}: forbidden field path ${parts.join(".")}`);
    }
    if (typeof value !== "string") return;
    if (/chain[_-]?of[_-]?thought|hidden_prompt|system_prompt|private_memory|raw_private_data/i.test(value)) {
      failures.push(`${id}: forbidden marker in text`);
    }
    if (/\/Users\//.test(value)) failures.push(`${id}: local absolute path in text`);
    if (hasSecretLikeString(value)) failures.push(`${id}: secret-like string`);
    if (value.length > 700) failures.push(`${id}: overly long field`);
  });

  if ((row.messages || []).some((message) => message.role === "system")) failures.push(`${id}: system role is not allowed`);
  if (String(row.target_answer || "").length > 360) failures.push(`${id}: target_answer too long for candidate safety threshold`);
  if (/evals\//i.test(textOf(row))) failures.push(`${id}: possible eval fixture path reference`);
}

const language = languageOk(rows);
if (language.zh_share < 0.7) failures.push(`zh share below 0.7: ${language.zh_share}`);
if (language.en_share > 0.1) failures.push(`en share above 0.1: ${language.en_share}`);

const report = {
  report_id: "r25ah_validation_report",
  ok: failures.length === 0,
  generated_at: new Date().toISOString(),
  safety: {
    training_ran: false,
    prior_pilot_reran: false,
    corpus_rows_promoted: false,
    training_llm_corpus_modified: false,
    root_pdf_docx_content_parsed: false,
    data_public_ingestion_content_parsed: false,
    private_sources_read: false,
    eval_sources_used: false,
    external_api_used: false,
    phase_4_scaled_training_approved: false,
    candidate_rows_staged: stagedArtifacts.length > 0,
    candidate_rows_tracked: Boolean(tracked)
  },
  checks: {
    candidate_file_exists: fs.existsSync(CANDIDATE_PATH),
    rows_parse_as_jsonl: rows.length > 0,
    row_count_lte_1000: rows.length <= MAX_ROWS,
    training_llm_corpus_unchanged: !trainingCorpusStatus,
    all_rows_training_allowed_false: rows.every((row) => row.training_allowed === false),
    all_rows_public_commit_allowed_false: rows.every((row) => row.public_commit_allowed === false),
    all_rows_candidate_unreviewed: rows.every((row) => row.review_status === "candidate_unreviewed"),
    no_candidate_rows_staged_or_tracked: stagedArtifacts.length === 0 && !tracked,
    zh_share_meets_target: language.zh_share >= 0.7,
    en_share_meets_cap: language.en_share <= 0.1
  },
  summary: {
    row_count: rows.length,
    rows_by_language: language.counts,
    language_shares: {
      zh: language.zh_share,
      mixed: language.mixed_share,
      en: language.en_share
    },
    rows_by_transformation_type: countBy(rows, (row) => row.transformation_type),
    rows_by_source_category: countBy(rows, (row) => row.source_category),
    personal_target_coverage: countBy(rows.flatMap((row) => row.personal_color_targets || []), (target) => target),
    warning_count: failures.length
  },
  failures
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
  rows_by_language: report.summary.rows_by_language
}, null, 2));
