#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  exists,
  readJson,
  readJsonIfPresent,
  readJsonlRows,
  repoPath,
  stagedFiles,
  writeJson
} from "./r26a_project_utils.mjs";

export const R26E_PHASE = "R26E";
export const R26E_PACK_ID = "another_brain_question_pack_001";
export const R26E_APPROVAL = "training/from_scratch/APPROVE_R26E_PROMOTE_FIRST50_USER_ANSWERS.json";
export const R26E_POLICY = "training/current/r26e_first50_promotion_policy.json";
export const R26D_CANDIDATES = "artifacts/training_os/user_answer_intake/r26d/r26d_first50_answer_as_user_candidates.jsonl";
export const R26E_REPORT_DIR = "artifacts/training_os/user_answer_intake/r26e";
export const R26E_PROMOTION_REPORT = `${R26E_REPORT_DIR}/r26e_promotion_report.json`;
export const R26E_VALIDATION_REPORT = `${R26E_REPORT_DIR}/r26e_validation_report.json`;
export const R26E_COVERAGE_REPORT = `${R26E_REPORT_DIR}/r26e_user_answered_coverage.json`;
export const R26E_FILES = {
  train: "training/llm_corpus/r26e_user_answered_train.jsonl",
  dev: "training/llm_corpus/r26e_user_answered_dev.jsonl",
  heldout: "training/llm_corpus/r26e_user_answered_heldout.jsonl"
};

export const FORBIDDEN_FIELD_RE = /chain[_-]?of[_-]?thought|hidden_prompt|system_prompt|private_memory|raw_private_data/i;
export const LOCAL_PATH_RE = /\/Users\/|\/private\/var\/|\/Volumes\/|private_sources\//;
export const SECRET_RE = /\b(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}|BEGIN PRIVATE KEY|api[_-]?key|secret[_-]?key|password|access[_-]?token)\b/i;
export const ASSISTANT_GENERIC_RE = /作为\s*(AI|人工智能)|as an ai|I am an AI|我可以帮你|很抱歉/i;

export function normalizeTarget(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[。！？!?，,；;：:）)\]]+$/u, "");
}

export function splitForCandidate(row) {
  if (row.split_suggestion === "heldout_candidate") return "heldout";
  if (row.split_suggestion === "dev") return "dev";
  return "train";
}

export function countBy(rows, getter) {
  const out = {};
  for (const row of rows) {
    const value = typeof getter === "function" ? getter(row) : row[getter];
    if (Array.isArray(value)) {
      for (const item of value) out[item] = (out[item] || 0) + 1;
    } else {
      out[String(value)] = (out[String(value)] || 0) + 1;
    }
  }
  return out;
}

export function walk(value, path = "$", out = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`, out));
  } else if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      out.push({ path: `${path}.${key}`, key, value: nested });
      walk(nested, `${path}.${key}`, out);
    }
  }
  return out;
}

export function collectStrings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, out));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectStrings(item, out));
  return out;
}

export async function loadR26DCandidates() {
  return (await readJsonlRows(R26D_CANDIDATES)).map(({ row, line }) => ({ ...row, __line: line }));
}

export async function loadPromotedRows() {
  const rows = [];
  for (const [split, path] of Object.entries(R26E_FILES)) {
    if (!(await exists(path))) continue;
    for (const { row, line } of await readJsonlRows(path)) rows.push({ ...row, __file: path, __line: line, __expected_split: split });
  }
  return rows;
}

export async function loadApproval() {
  return readJson(R26E_APPROVAL);
}

export async function approvalConsumed() {
  const approval = await readJsonIfPresent(R26E_APPROVAL);
  return approval?.consumed === true;
}

export async function candidateFileHash() {
  const text = await readFile(repoPath(R26D_CANDIDATES), "utf8");
  return createHash("sha256").update(text).digest("hex");
}

export async function stagedForbiddenArtifacts() {
  const staged = await stagedFiles();
  return {
    artifacts: staged.filter((path) => path.startsWith("artifacts/")),
    private_sources: staged.filter((path) => path.startsWith("private_sources/")),
    public_ingestion: staged.filter((path) => path.startsWith("data/public_ingestion/")),
    raw_docs_or_csv: staged.filter((path) => /\.(csv|CSV|xlsx|XLSX|pdf|PDF|docx|DOCX|doc|DOC)$/.test(path))
  };
}

export function makePromotionRow(row, split) {
  const sourceId = String(row.source_row_id).padStart(3, "0");
  const { __line, __file, __expected_split, ...cleanRow } = row;
  return {
    ...cleanRow,
    sample_id: `r26e_user_answered_row_${sourceId}`,
    split,
    messages: [
      { role: "user", content: row.question },
      { role: "assistant", content: row.target_answer }
    ],
    eligibility: "eligible_after_review",
    review_status: "reviewed_for_training_corpus",
    training_allowed: true,
    public_commit_allowed: true,
    contains_private_data: false,
    provenance: {
      ...(row.provenance || {}),
      source_type: "user_answered",
      pack_id: R26E_PACK_ID,
      promoted_by: "scripts/promote_r26e_first50_user_answers.mjs",
      promotion_phase: R26E_PHASE,
      external_llm_used: false,
      contains_private_data: false,
      license_or_permission: "user-authored-reviewed-for-project-training"
    }
  };
}

export function reviewCandidate(row, seenTargets) {
  const reasons = [];
  const sourceRowId = Number(row.source_row_id);
  if (!Number.isInteger(sourceRowId) || sourceRowId < 1 || sourceRowId > 50) reasons.push("source_row_id_outside_1_50");
  if (sourceRowId >= 51) reasons.push("source_row_id_51_100_forbidden");
  if (row.pack_id !== R26E_PACK_ID) reasons.push("pack_id_mismatch");
  if (row.review_status !== "candidate_unreviewed") reasons.push("review_status_not_candidate_unreviewed");
  if (row.training_allowed !== false) reasons.push("candidate_training_allowed_before_promotion");
  if (row.public_commit_allowed !== false) reasons.push("candidate_public_commit_allowed_before_promotion");
  if (row.contains_private_data !== false) reasons.push("candidate_private_data");
  if (!row.target_answer || !normalizeTarget(row.target_answer)) reasons.push("blank_target_answer");
  if (normalizeTarget(row.target_answer).length < 4) reasons.push("target_answer_too_short");
  if (Array.isArray(row.risk_flags) && row.risk_flags.length) reasons.push(`risk_flags:${row.risk_flags.join(",")}`);
  if (Array.isArray(row.rejected_answers) && row.rejected_answers.length) reasons.push("unexpected_rejected_answers");
  if (row.target_answer && normalizeTarget(row.target_answer) !== normalizeTarget(row.user_answer_clean)) reasons.push("target_not_user_answer_clean");
  for (const item of walk(row)) if (FORBIDDEN_FIELD_RE.test(item.key)) reasons.push(`forbidden_field:${item.path}`);
  for (const text of collectStrings(row)) {
    if (LOCAL_PATH_RE.test(text)) reasons.push("local_path_or_private_source_reference");
    if (SECRET_RE.test(text)) reasons.push("secret_like_string");
    if (ASSISTANT_GENERIC_RE.test(text)) reasons.push("assistant_generic_wording");
  }
  const normalizedTarget = normalizeTarget(row.target_answer);
  if (normalizedTarget && seenTargets.has(normalizedTarget)) reasons.push("duplicate_target_answer");
  return reasons;
}

export async function writeJsonl(path, rows) {
  const { writeFile, mkdir } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  await mkdir(repoPath(dirname(path)), { recursive: true });
  await writeFile(repoPath(path), `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

export async function writePromotionLikeReport(path, report) {
  await writeJson(path, report);
}
