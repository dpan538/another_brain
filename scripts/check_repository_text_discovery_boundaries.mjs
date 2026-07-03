#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "artifacts/training_os/repo_text_discovery/r25ag");
const BOUNDARY_REPORT = path.join(REPORT_DIR, "repo_text_discovery_boundary_check.json");
const REQUIRED_REPORTS = [
  "repository_text_sources.json",
  "personal_corpus_source_ranking.json",
  "existing_answer_like_text_audit.json",
  "legacy_scan_reconciliation.json"
].map((name) => path.join(REPORT_DIR, name));
const TRACKED_SUMMARIES = [
  "docs/R25AG_REPOSITORY_TEXT_DISCOVERY_POLICY.md",
  "docs/R25AG_REPOSITORY_TEXT_DISCOVERY.md",
  "docs/R25AG_REPOSITORY_TEXT_SOURCE_SUMMARY.md",
  "docs/R25AG_PERSONAL_CORPUS_SOURCE_RANKING.md",
  "docs/R25AG_EXISTING_ANSWER_LIKE_TEXT_SUMMARY.md",
  "docs/R25AG_LEGACY_SCAN_RECONCILIATION.md"
];

function rel(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function repoPath(relativePath) {
  const resolved = path.resolve(ROOT, relativePath);
  if (!resolved.startsWith(ROOT + path.sep) && resolved !== ROOT) {
    throw new Error(`Refusing to leave repo root: ${relativePath}`);
  }
  return resolved;
}

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function activeApprovals() {
  const dir = repoPath("training/from_scratch");
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((name) => /^APPROVE_.*\.json$/i.test(name) && !name.endsWith(".template.json"))
    : [];
  let activeTraining = 0;
  let activePhase4 = 0;
  const activeFiles = [];
  for (const name of files) {
    const full = path.join(dir, name);
    let data;
    try {
      data = readJson(full);
    } catch {
      continue;
    }
    const consumed = data.consumed === true || data.allow_additional_runs === false;
    const trainingAllowed = data.approved === true && data.allow_training !== false && !consumed;
    const phase4Allowed = data.approved === true && data.allow_phase_4_scaled_training === true && !consumed;
    if (trainingAllowed) activeTraining += 1;
    if (phase4Allowed) activePhase4 += 1;
    if ((trainingAllowed || phase4Allowed) && !consumed) activeFiles.push(name);
  }
  return { activeTraining, activePhase4, activeFiles };
}

function hasSecretLikeString(text) {
  return /(sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----)/.test(text);
}

function isAllowedPromotedCorpusPath(lineOrPath) {
  return /training\/llm_corpus\/r25a(?:k|m)_repo_derived_(train|dev|heldout)\.jsonl$/.test(String(lineOrPath).trim());
}

function checkTrackedSummaries(failures) {
  for (const relativePath of TRACKED_SUMMARIES) {
    const full = repoPath(relativePath);
    if (!fs.existsSync(full)) {
      failures.push(`missing tracked summary: ${relativePath}`);
      continue;
    }
    const text = fs.readFileSync(full, "utf8");
    if (/\/Users\/(?!jarlgiovanni\/Desktop\/another_brain\b)/.test(text)) {
      failures.push(`tracked summary contains private absolute path outside repo root: ${relativePath}`);
    }
    if (/safe_short_excerpt|raw_private_data\s*:\s*true|contains_private_data\s*:\s*true/i.test(text)) {
      failures.push(`tracked summary may contain raw/private excerpt markers: ${relativePath}`);
    }
    if (/chain[_-]?of[_-]?thought\s*:\s*true|hidden_prompt\s*:\s*true|system_prompt\s*:\s*["[{]/i.test(text)) {
      failures.push(`tracked summary contains forbidden prompt/thought fields: ${relativePath}`);
    }
    if (hasSecretLikeString(text)) failures.push(`tracked summary contains secret-like string: ${relativePath}`);
    if (/fetch\s*\(|https:\/\/api\.|openai\.com|huggingface\.co/i.test(text)) {
      failures.push(`tracked summary contains external API/model reference: ${relativePath}`);
    }
  }
}

fs.mkdirSync(REPORT_DIR, { recursive: true });
const failures = [];
const reportExistence = {};
for (const filePath of REQUIRED_REPORTS) {
  const exists = fs.existsSync(filePath);
  reportExistence[rel(filePath)] = exists;
  if (!exists) failures.push(`missing report: ${rel(filePath)}`);
}

let discovery = null;
let ranking = null;
let answerAudit = null;
let legacy = null;
if (REQUIRED_REPORTS.every((filePath) => fs.existsSync(filePath))) {
  discovery = readJson(REQUIRED_REPORTS[0]);
  ranking = readJson(REQUIRED_REPORTS[1]);
  answerAudit = readJson(REQUIRED_REPORTS[2]);
  legacy = readJson(REQUIRED_REPORTS[3]);
  if (discovery.safety?.root_pdf_docx_content_parsed !== false) failures.push("root PDF/DOCX content parse flag is not false");
  if (discovery.safety?.data_public_ingestion_content_parsed !== false) failures.push("data/public_ingestion content parse flag is not false");
  if (ranking.safety?.corpus_rows_generated !== false) failures.push("ranking claims corpus rows were generated");
  if (answerAudit.safety?.training_llm_corpus_modified !== false) failures.push("answer audit claims training corpus was modified");
  if (legacy.summary?.data_public_ingestion_ingested_into_training_corpus !== false) failures.push("legacy report says data/public_ingestion feeds training corpus");
}

const staged = git(["diff", "--cached", "--name-only"]).split(/\r?\n/).filter(Boolean);
const unstagedTrainingLines = git(["status", "--short", "--", "training/llm_corpus"]).split(/\r?\n/).filter(Boolean);
const unexpectedTrainingLines = unstagedTrainingLines.filter((line) => !isAllowedPromotedCorpusPath(line));
const stagedArtifacts = staged.filter((file) => file.startsWith("artifacts/"));
const stagedRootDocs = staged.filter((file) => !file.includes("/") && /\.(pdf|PDF|docx|DOCX|doc|DOC)$/.test(file));
const stagedPublicIngestion = staged.filter((file) => file.startsWith("data/public_ingestion/"));
const stagedTrainingCorpus = staged.filter((file) => file.startsWith("training/llm_corpus/") && !isAllowedPromotedCorpusPath(file));

if (stagedArtifacts.length) failures.push(`generated reports/artifacts staged: ${stagedArtifacts.join(", ")}`);
if (stagedRootDocs.length) failures.push(`root PDF/DOCX files staged: ${stagedRootDocs.join(", ")}`);
if (stagedPublicIngestion.length) failures.push(`data/public_ingestion staged: ${stagedPublicIngestion.join(", ")}`);
if (stagedTrainingCorpus.length) failures.push(`training/llm_corpus staged: ${stagedTrainingCorpus.join(", ")}`);
if (unexpectedTrainingLines.length) failures.push(`training/llm_corpus has unexpected worktree changes: ${unexpectedTrainingLines.join("; ")}`);

const generatedCandidateRows = fs.existsSync(repoPath("artifacts/training_os/corpus_expansion/r25ag/r25ag_candidate_rows.jsonl"));
if (generatedCandidateRows) failures.push("derived corpus candidate rows exist for R25AG discovery task");

checkTrackedSummaries(failures);
const approvals = activeApprovals();
if (approvals.activeTraining !== 0) failures.push(`active training approval count is ${approvals.activeTraining}`);
if (approvals.activePhase4 !== 0) failures.push(`active phase4 approval count is ${approvals.activePhase4}`);

const result = {
  report_id: "r25ag_repo_text_discovery_boundary_check",
  ok: failures.length === 0,
  generated_at: new Date().toISOString(),
  report_existence: reportExistence,
  checks: {
    no_generated_reports_staged: stagedArtifacts.length === 0,
    no_root_pdf_docx_staged: stagedRootDocs.length === 0,
    no_data_public_ingestion_staged: stagedPublicIngestion.length === 0,
    no_training_llm_corpus_modifications: unexpectedTrainingLines.length === 0 && stagedTrainingCorpus.length === 0,
    no_derived_corpus_rows_generated: !generatedCandidateRows,
    root_pdf_docx_metadata_only: discovery?.safety?.root_pdf_docx_content_parsed === false,
    data_public_ingestion_metadata_only: discovery?.safety?.data_public_ingestion_content_parsed === false,
    no_active_training_approval: approvals.activeTraining === 0,
    no_phase4_approval: approvals.activePhase4 === 0
  },
  active_training_approval_count: approvals.activeTraining,
  active_phase4_training_approval_count: approvals.activePhase4,
  active_approval_files: approvals.activeFiles,
  failures
};

fs.writeFileSync(BOUNDARY_REPORT, `${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  report: rel(BOUNDARY_REPORT),
  active_training_approval_count: approvals.activeTraining,
  active_phase4_training_approval_count: approvals.activePhase4
}, null, 2));
