#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";
import {
  exists,
  git,
  readJson,
  readJsonIfPresent,
  readJsonlRows,
  repoPath,
  stagedFiles,
  trackedFiles,
  writeJson,
  writeText
} from "./r26a_project_utils.mjs";
import {
  R26D_CANDIDATES,
  R26E_FILES,
  collectStrings,
  normalizeTarget,
  writeJsonl
} from "./r26e_user_answer_promotion_utils.mjs";

export const R26G_PHASE = "R26G";
export const R26G_PACK_ID = "another_brain_question_pack_002_abstract_values";
export const R26G_REPLACES_PACK_ID = "another_brain_question_pack_001";
export const R26G_APPROVAL = "training/from_scratch/APPROVE_R26G_FIX_AND_INTAKE_USER_ANSWERS.json";
export const R26H_TEMPLATE = "training/from_scratch/APPROVE_R26H_USER_ANSWER_CORPUS_READINESS.template.json";
export const R26G_DOCX = "private_sources/question_packs/another_brain_question_pack_002_replacement_51_100.docx";
export const R26G_CSV = "private_sources/question_packs/another_brain_question_pack_002_replacement_51_100.csv";
export const R26G_REPORT_DIR = "artifacts/training_os/user_answer_intake/r26g";
export const R26G_METADATA_FIX_REPORT = `${R26G_REPORT_DIR}/r26g_r26e_metadata_fix_report.json`;
export const R26G_TARGET_PRESERVED_REPORT = `${R26G_REPORT_DIR}/r26g_r26e_target_preserved_report.json`;
export const R26G_OMITTED_REVIEW_REPORT = `${R26G_REPORT_DIR}/r26g_omitted_first50_review.json`;
export const R26G_PARSED_REPORT = `${R26G_REPORT_DIR}/r26g_replacement_51_100_parsed.json`;
export const R26G_CANDIDATES = `${R26G_REPORT_DIR}/r26g_replacement_51_100_candidates.jsonl`;
export const R26G_GENERATION_REPORT = `${R26G_REPORT_DIR}/r26g_replacement_51_100_generation_report.json`;
export const R26G_PROMOTION_REPORT = `${R26G_REPORT_DIR}/r26g_promotion_report.json`;
export const R26G_VALIDATION_REPORT = `${R26G_REPORT_DIR}/r26g_validation_report.json`;
export const R26G_COVERAGE_REPORT = `${R26G_REPORT_DIR}/r26g_user_answered_coverage.json`;
export const R26F_PROJECT_META_REPORT = "artifacts/training_os/user_answer_intake/r26f/r26f_project_meta_rejection_audit.json";
export const R26G_FILES = {
  train: "training/llm_corpus/r26g_user_answered_train.jsonl",
  dev: "training/llm_corpus/r26g_user_answered_dev.jsonl",
  heldout: "training/llm_corpus/r26g_user_answered_heldout.jsonl"
};

export const R26G_DOCS = [
  "docs/R26G_FIX_AND_INTAKE_USER_ANSWERS.md",
  "docs/R26G_REPLACEMENT_51_100_PARSE_SUMMARY.md",
  "docs/R26G_USER_ANSWERED_CORPUS_SUMMARY.md",
  "docs/R26G_NEXT_BOUNDARY.md"
];

export const R26G_SCRIPTS = [
  "scripts/fix_r26g_r26e_response_obligation_metadata.mjs",
  "scripts/check_r26g_r26e_target_preserved.mjs",
  "scripts/review_r26g_omitted_first50_rows.mjs",
  "scripts/parse_r26g_replacement_51_100.mjs",
  "scripts/generate_r26g_replacement_51_100_candidates.mjs",
  "scripts/promote_r26g_user_answers.mjs",
  "scripts/validate_r26g_user_answered_corpus.mjs",
  "scripts/report_r26g_user_answered_coverage.mjs",
  "scripts/consume_r26g_approval.mjs",
  "scripts/r26g_user_answer_utils.mjs"
];

export { R26E_FILES, normalizeTarget, readJsonIfPresent };

export function countBy(rows, getter) {
  const out = {};
  for (const row of rows || []) {
    const value = typeof getter === "function" ? getter(row) : row?.[getter];
    if (Array.isArray(value)) {
      for (const item of value) out[String(item)] = (out[String(item)] || 0) + 1;
    } else {
      out[String(value ?? "unknown")] = (out[String(value ?? "unknown")] || 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

export function markdownTable(headers, rows) {
  const safe = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  return [
    `| ${headers.map(safe).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(safe).join(" | ")} |`)
  ].join("\n");
}

export async function loadR26ERows() {
  const rows = [];
  for (const [split, path] of Object.entries(R26E_FILES)) {
    for (const { row, line } of await readJsonlRows(path)) rows.push({ ...row, __file: path, __line: line, __expected_split: split });
  }
  return rows;
}

export async function loadR26GRows() {
  const rows = [];
  for (const [split, path] of Object.entries(R26G_FILES)) {
    if (!(await exists(path))) continue;
    for (const { row, line } of await readJsonlRows(path)) rows.push({ ...row, __file: path, __line: line, __expected_split: split });
  }
  return rows;
}

export async function loadJsonlIfPresent(path) {
  if (!(await exists(path))) return [];
  return (await readJsonlRows(path)).map(({ row, line }) => ({ ...row, __line: line }));
}

export function responseSemanticsFor(answerMode) {
  const mode = String(answerMode || "");
  const directCompliance = mode === "direct_answer" ? true
    : mode === "partial_answer" ? "partial"
      : false;
  return {
    response_obligation: "produce_response",
    direct_compliance: directCompliance,
    valid_nonanswer: ["refuse", "redirect", "counterquestion"].includes(mode)
  };
}

export function fixR26ERow(row) {
  const oldShould = row.should_answer;
  const fixed = {
    ...row,
    source_should_answer_raw: row.source_should_answer_raw ?? oldShould,
    should_answer: Boolean(String(row.target_answer || "").trim()) ? true : row.should_answer,
    ...responseSemanticsFor(row.answer_mode),
    metadata_fix_phase: R26G_PHASE,
    metadata_fix_reason: "should_answer normalized to output obligation; answer_mode preserves refusal/partial/pressure semantics"
  };
  return fixed;
}

export async function originalR26ERowsFromHead() {
  const rows = [];
  for (const [split, path] of Object.entries(R26E_FILES)) {
    const text = await git(["show", `HEAD:${path}`], { maxBuffer: 64 * 1024 * 1024 });
    for (const [index, line] of text.split(/\r?\n/).entries()) {
      if (!line.trim()) continue;
      rows.push({ ...JSON.parse(line), __file: path, __line: index + 1, __expected_split: split });
    }
  }
  return rows;
}

export async function requireR26GApproval() {
  const approval = await readJson(R26G_APPROVAL);
  const failures = [];
  if (approval.approved !== true) failures.push("approval_not_true");
  if (approval.consumed === true) failures.push("approval_already_consumed");
  for (const key of [
    "allow_metadata_fix",
    "allow_repromotion",
    "allow_candidate_generation",
    "allow_promote_derived_rows"
  ]) {
    if (approval[key] !== true) failures.push(`${key}_not_true`);
  }
  for (const key of [
    "allow_training",
    "allow_tokenizer_dry_run",
    "allow_small_pilot_training",
    "allow_phase_4_scaled_training",
    "allow_weight_commit",
    "allow_raw_source_commit",
    "allow_candidate_artifact_commit",
    "allow_long_term_training",
    "allow_product_model_training"
  ]) {
    if (approval[key] !== false) failures.push(`${key}_not_false`);
  }
  if (failures.length) throw new Error(`R26G approval invalid: ${failures.join(", ")}`);
  return approval;
}

export function inferAnswerMode(type, answer) {
  const text = String(answer || "");
  if (/不(是|存在|算|会)|没有|并不|不能|不应该/.test(text)) return "compressed_judgment";
  if (/因为|所以|意味着|取决于|本质/.test(text)) return "abstract_reframe";
  if (/价值观|审美|抽象判断|语言与意义/.test(String(type || ""))) return "abstract_reframe";
  return "direct_answer";
}

export function inferEvidencePolicy(type, answer) {
  const text = `${type || ""}\n${answer || ""}`;
  if (/价值|应该|好坏|美|意义|真实|存在|算不算/.test(text)) return "value_disagreement";
  return "no_evidence_needed";
}

export function splitForOrdinal(index, total) {
  const devStart = Math.max(0, total - 10);
  const heldoutStart = Math.max(0, total - 5);
  if (index >= heldoutStart) return "heldout";
  if (index >= devStart) return "dev";
  return "train";
}

export function makeMessages(question, answer) {
  return [
    { role: "user", content: question },
    { role: "assistant", content: answer }
  ];
}

export function cleanForTrackedRow(row) {
  const { __line, __file, __expected_split, __source, ...clean } = row;
  return clean;
}

export function makeReplacementCandidate(row) {
  const answerMode = inferAnswerMode(row.type, row.user_answer_clean);
  return {
    sample_id: `r26g_replacement_row_${String(row.display_id).padStart(3, "0")}`,
    pack_id: R26G_PACK_ID,
    source_row_id: row.source_row_id,
    display_id: row.display_id,
    replacement_for_pack_id: R26G_REPLACES_PACK_ID,
    replacement_for_display_id: row.display_id,
    source_row_range_policy: "new_pack_source_rows_1_50_display_51_100; old_question_pack_001_rows_51_100_remain_excluded",
    language: "zh",
    module: row.type,
    type: row.type,
    scene: "replacement_abstract_values",
    speaker_context: "user-authored replacement answer pack",
    question_intent: row.type,
    suggested_answer_mode: answerMode,
    question: row.question,
    answer_target_note: "Preserve user-authored answer wording; do not assistant-ify.",
    user_answer_raw: row.user_answer_raw,
    user_answer_clean: row.user_answer_clean,
    source_should_answer_raw: "replacement_answered",
    should_answer: true,
    ...responseSemanticsFor(answerMode),
    answer_mode: answerMode,
    answer_as: "user_self",
    stance: "user-authored",
    evidence_policy: inferEvidencePolicy(row.type, row.user_answer_clean),
    candidate_type: "primary_user_answer",
    target_answer: row.user_answer_clean,
    rejected_answers: [],
    tags: ["r26g", "replacement_51_100", String(row.type || "unknown")],
    risk_flags: [],
    split_suggestion: "train",
    eligibility: "eligible_after_review",
    exclusion_reason: "",
    review_status: "candidate_unreviewed",
    training_allowed: false,
    public_commit_allowed: false,
    contains_private_data: false,
    provenance: {
      source_type: "user_answered",
      pack_id: R26G_PACK_ID,
      replacement_for_pack_id: R26G_REPLACES_PACK_ID,
      source_path: R26G_DOCX,
      external_llm_used: false,
      contains_private_data: false,
      license_or_permission: "user-authored-reviewed-for-project-training"
    }
  };
}

export function makePromotedR26GRow(candidate, split, ordinal) {
  const promotedBy = "scripts/promote_r26g_user_answers.mjs";
  const { source_path, source_file, ...safeProvenance } = candidate.provenance || {};
  return {
    ...cleanForTrackedRow(candidate),
    sample_id: candidate.sample_id.startsWith("r26g_") ? candidate.sample_id : `r26g_recovered_first50_row_${String(candidate.source_row_id).padStart(3, "0")}`,
    split,
    split_suggestion: split === "heldout" ? "heldout_candidate" : split,
    messages: makeMessages(candidate.question, candidate.target_answer),
    should_answer: true,
    response_obligation: "produce_response",
    metadata_fix_phase: candidate.metadata_fix_phase || R26G_PHASE,
    metadata_fix_reason: candidate.metadata_fix_reason || "R26G promoted reviewed user-authored answer with output-obligation metadata.",
    eligibility: "eligible_after_review",
    review_status: "reviewed_for_training_corpus",
    training_allowed: true,
    public_commit_allowed: true,
    contains_private_data: false,
    promotion_ordinal: ordinal,
    provenance: {
      ...safeProvenance,
      source_type: "user_answered",
      promoted_by: promotedBy,
      promotion_phase: R26G_PHASE,
      external_llm_used: false,
      contains_private_data: false,
      license_or_permission: "user-authored-reviewed-for-project-training"
    }
  };
}

export async function writeR26GSplits(rows) {
  for (const [split, path] of Object.entries(R26G_FILES)) {
    await writeJsonl(path, rows.filter((row) => row.split === split));
  }
}

export async function readReplacementRows() {
  if (await exists(R26G_CSV)) return readReplacementCsv();
  if (await exists(R26G_DOCX)) return readReplacementDocx();
  throw new Error("replacement_51_100_file_missing_from_private_sources_question_packs");
}

async function readReplacementCsv() {
  const text = await readFile(repoPath(R26G_CSV), "utf8");
  const [headerLine, ...lines] = text.split(/\r?\n/).filter((line) => line.trim());
  const headers = parseCsvLine(headerLine);
  const rows = lines.map((line) => Object.fromEntries(parseCsvLine(line).map((value, index) => [headers[index], value])));
  return normalizeReplacementRows(rows.map((row) => ({
    display_id: row.display_id || row.ID || row.id,
    type: row.type || row["类型"],
    question: row.question || row["问题"],
    user_answer_raw: row.user_answer || row["回答"] || row.user_answer_raw || ""
  })), R26G_CSV);
}

async function readReplacementDocx() {
  const entries = await readDocxEntries(R26G_DOCX);
  const xml = entries.get("word/document.xml");
  if (!xml) throw new Error("docx_missing_word_document_xml");
  const tableRows = extractDocxTableRows(xml);
  const dataRows = tableRows.filter((cells) => /^\d+$/.test(String(cells[0] || "").trim()));
  return normalizeReplacementRows(dataRows.map((cells) => ({
    display_id: cells[0],
    type: cells[1],
    question: cells[2],
    user_answer_raw: cells[3]
  })), R26G_DOCX);
}

function normalizeReplacementRows(rows, sourcePath) {
  return rows.map((row, index) => {
    const displayId = Number(row.display_id);
    const userAnswer = String(row.user_answer_raw || "").trim();
    return {
      pack_id: R26G_PACK_ID,
      source_row_id: displayId - 50,
      display_id: displayId,
      replacement_for_pack_id: R26G_REPLACES_PACK_ID,
      replacement_for_display_id: displayId,
      type: String(row.type || "").trim(),
      question: String(row.question || "").trim(),
      user_answer_raw: userAnswer,
      user_answer_clean: userAnswer.replace(/\s+/g, " ").trim(),
      source_path_used: sourcePath,
      parse_index: index + 1
    };
  });
}

function parseCsvLine(line) {
  const out = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      out.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  out.push(current);
  return out;
}

async function readDocxEntries(path) {
  const buffer = await readFile(repoPath(path));
  const eocdOffset = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocdOffset < 0) throw new Error("docx_zip_eocd_not_found");
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = new Map();
  let offset = centralDirectoryOffset;
  const end = centralDirectoryOffset + centralDirectorySize;
  while (offset < end) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("docx_zip_central_directory_invalid");
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");
    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const data = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null;
    if (data) entries.set(name, data.toString("utf8"));
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function extractDocxTableRows(xml) {
  const rows = [];
  for (const rowMatch of xml.matchAll(/<w:tr[\s\S]*?<\/w:tr>/g)) {
    const rowXml = rowMatch[0];
    const cells = [];
    for (const cellMatch of rowXml.matchAll(/<w:tc[\s\S]*?<\/w:tc>/g)) {
      const cellXml = cellMatch[0]
        .replace(/<w:br\b[^>]*\/>/g, "\n")
        .replace(/<w:tab\b[^>]*\/>/g, "\t");
      const parts = [...cellXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((match) => xmlUnescape(match[1]));
      cells.push(parts.join("").replace(/\s+/g, " ").trim());
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function xmlUnescape(text) {
  return String(text || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export async function fileSha256(path) {
  return createHash("sha256").update(await readFile(repoPath(path))).digest("hex");
}

export function validateReplacementRows(rows) {
  const failures = [];
  const displays = new Set();
  for (const row of rows) {
    if (!Number.isInteger(row.display_id) || row.display_id < 51 || row.display_id > 100) failures.push({ code: "display_id_not_51_100", display_id: row.display_id });
    if (!Number.isInteger(row.source_row_id) || row.source_row_id < 1 || row.source_row_id > 50) failures.push({ code: "source_row_id_not_new_pack_1_50", display_id: row.display_id, source_row_id: row.source_row_id });
    if (displays.has(row.display_id)) failures.push({ code: "duplicate_display_id", display_id: row.display_id });
    displays.add(row.display_id);
    if (!row.type) failures.push({ code: "missing_type", display_id: row.display_id });
    if (!row.question) failures.push({ code: "missing_question", display_id: row.display_id });
    if (!row.user_answer_clean) failures.push({ code: "missing_user_answer", display_id: row.display_id });
  }
  for (let id = 51; id <= 100; id += 1) if (!displays.has(id)) failures.push({ code: "missing_display_id", display_id: id });
  return failures;
}

export async function stagedForbiddenR26GFiles() {
  const staged = await stagedFiles();
  return {
    artifacts: staged.filter((path) => path.startsWith("artifacts/")),
    private_sources: staged.filter((path) => path.startsWith("private_sources/")),
    public_ingestion: staged.filter((path) => path.startsWith("data/public_ingestion/")),
    raw_sources: staged.filter((path) => /\.(csv|CSV|xlsx|XLSX|pdf|PDF|docx|DOCX|doc|DOC)$/.test(path))
  };
}

export async function rawSourcesTracked() {
  const tracked = await trackedFiles();
  return tracked.filter((path) => path.startsWith("private_sources/") || /\.(csv|CSV|xlsx|XLSX|pdf|PDF|docx|DOCX|doc|DOC)$/.test(path));
}

export function hasForbiddenString(row) {
  const joined = collectStrings(row).join("\n");
  return /chain[_-]?of[_-]?thought|hidden_prompt|\/Users\/|private_sources\/|data\/public_ingestion\/|BEGIN PRIVATE KEY|api[_-]?key|secret[_-]?key/i.test(joined);
}

export async function consumeR26GApproval() {
  const approval = await readJson(R26G_APPROVAL);
  const consumed = {
    ...approval,
    consumed: true,
    allow_additional_runs: false,
    consumed_by_commit: "pending_r26g_commit",
    consumed_by_phase: R26G_PHASE,
    consumed_reason: "one-shot approval used for r26g_fix_and_intake_user_answers; future runs require a new approval marker; future corpus correction/intake requires a new approval marker"
  };
  await writeJson(R26G_APPROVAL, consumed);
  return consumed;
}

export async function writeR26GMarkdown(path, text) {
  await writeText(path, text);
}

export async function writeR26GJson(path, value) {
  await writeJson(path, value);
}
