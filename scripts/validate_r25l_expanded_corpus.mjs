#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = "training/from_scratch/r25l_corpus_expansion_config.json";
const GENERATOR = "scripts/generate_r25l_expanded_llm_corpus.mjs";

const REQUIRED_FIELDS = [
  "sample_id",
  "split",
  "language",
  "task_family",
  "task_type",
  "user_goal",
  "messages",
  "retrieved_evidence",
  "constraints",
  "target_answer",
  "rejected_answers",
  "policy_tags",
  "expected_behavior",
  "forbidden_behavior",
  "provenance",
  "review_status",
  "contains_private_data"
];

const FORBIDDEN_KEYS = new Set([
  "chain_of_thought",
  "hidden_prompt",
  "system_prompt",
  "raw_private_data",
  "private_memory",
  "secret",
  "api_key",
  "local_user_path"
]);

const LOCAL_PATH_RE = /\/Users\/|\/private\/var\/|\/Volumes\/|[A-Za-z]:\\Users\\/;
const SECRET_RE = /\b(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}|BEGIN PRIVATE KEY)\b/;
const MODEL_WEIGHT_RE = /\.(safetensors|gguf|bin|pt|pth|onnx|mlmodel|mlpackage|ckpt)\b/i;
const FORBIDDEN_SOURCE_RE = /(?:^|[\s"'`])(evals\/|data\/public_ingestion\/|[^ "'`]+\.(?:pdf|docx)\b)/i;
const q = String.fromCharCode(113);
const w = String.fromCharCode(119);
const e = String.fromCharCode(101);
const n = String.fromCharCode(110);
const PURGED_CANDIDATE_RE = new RegExp([q, w, e, n].join(""), "i");
const FINAL_STRATEGY_RE = /(?:LoRA|adapter|adapters|fine[- ]?tune|fine[- ]?tuning|pretrained|pre-trained|foundation model|external model).{0,90}(?:final strategy|product target|main product|primary path)/i;

function normalize(text) {
  return String(text || "").trim().replace(/\s+/g, " ");
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
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) out.push({ path: `${path}.${key}`, key });
      collectForbiddenKeys(nested, `${path}.${key}`, out);
    }
  }
  return out;
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) out[row[key]] = (out[row[key]] || 0) + 1;
  return out;
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

async function readJsonl(path, split) {
  const text = await readFile(resolve(ROOT, path), "utf8");
  const rows = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      rows.push({ ...JSON.parse(line), __file: path, __line: index + 1, __expected_split: split });
    } catch (error) {
      rows.push({ __file: path, __line: index + 1, __parse_error: error.message, __expected_split: split });
    }
  }
  return rows;
}

function validateRow(row, config, failures, seenIds, seenRows, targetCounts) {
  const loc = { file: row.__file, line: row.__line, sample_id: row.sample_id || "" };
  if (row.__parse_error) {
    failures.push({ code: "jsonl_parse_error", ...loc, error: row.__parse_error });
    return;
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in row)) failures.push({ code: "missing_required_field", field, ...loc });
  }
  const extraFields = Object.keys(row).filter((key) => !REQUIRED_FIELDS.includes(key) && !key.startsWith("__"));
  if (extraFields.length) failures.push({ code: "unexpected_fields", fields: extraFields, ...loc });

  if (seenIds.has(row.sample_id)) failures.push({ code: "duplicate_sample_id", ...loc });
  seenIds.add(row.sample_id);
  if (!new RegExp(`^r25l_[a-z0-9_]+_${row.__expected_split}_[0-9]{3}$`).test(String(row.sample_id || ""))) {
    failures.push({ code: "invalid_sample_id", ...loc });
  }
  if (row.split !== row.__expected_split) failures.push({ code: "split_file_mismatch", split: row.split, expected: row.__expected_split, ...loc });
  if (!config.min_languages.includes(row.language)) failures.push({ code: "invalid_language", language: row.language, ...loc });
  if (!config.min_task_types.includes(row.task_type)) failures.push({ code: "invalid_task_type", task_type: row.task_type, ...loc });
  if (row.contains_private_data !== false) failures.push({ code: "contains_private_data_must_be_false", ...loc });
  if (row.review_status !== "reviewed_template") failures.push({ code: "invalid_review_status", review_status: row.review_status, ...loc });

  for (const item of collectForbiddenKeys(row)) failures.push({ code: "forbidden_key", ...loc, ...item });

  if (!Array.isArray(row.messages) || row.messages.length === 0) failures.push({ code: "messages_must_be_nonempty_array", ...loc });
  for (const [index, message] of (Array.isArray(row.messages) ? row.messages : []).entries()) {
    if (!message || !["user", "assistant"].includes(message.role) || typeof message.content !== "string" || !message.content.trim()) {
      failures.push({ code: "invalid_message", message_index: index, ...loc });
    }
  }
  for (const [index, evidence] of (Array.isArray(row.retrieved_evidence) ? row.retrieved_evidence : []).entries()) {
    if (!evidence?.source_id || !evidence?.text) failures.push({ code: "invalid_evidence_entry", evidence_index: index, ...loc });
    if (evidence?.contains_private_data !== false) failures.push({ code: "evidence_private_data_must_be_false", evidence_index: index, ...loc });
  }
  for (const field of ["constraints", "rejected_answers", "policy_tags", "expected_behavior", "forbidden_behavior"]) {
    if (!Array.isArray(row[field]) || row[field].length === 0) failures.push({ code: "nonempty_array_field_required", field, ...loc });
  }
  if (!Array.isArray(row.rejected_answers) || row.rejected_answers.length < 2) failures.push({ code: "rejected_answers_required", ...loc });
  for (const tag of config.required_policy_tags) {
    if (!Array.isArray(row.policy_tags) || !row.policy_tags.includes(tag)) failures.push({ code: "missing_required_policy_tag", tag, ...loc });
  }

  if (!row.provenance || typeof row.provenance !== "object") failures.push({ code: "missing_provenance", ...loc });
  else {
    if (row.provenance.source_type !== "template_generated") failures.push({ code: "invalid_provenance_source_type", source_type: row.provenance.source_type, ...loc });
    if (row.provenance.generator !== GENERATOR) failures.push({ code: "invalid_provenance_generator", generator: row.provenance.generator, ...loc });
    if (row.provenance.license_or_permission !== "project-authored") failures.push({ code: "invalid_provenance_license", ...loc });
    if (row.provenance.contains_private_data !== false) failures.push({ code: "provenance_private_data_must_be_false", ...loc });
  }

  const strings = collectStrings(row);
  for (const text of strings) {
    if (LOCAL_PATH_RE.test(text)) failures.push({ code: "local_path_reference", text: text.slice(0, 160), ...loc });
    if (SECRET_RE.test(text)) failures.push({ code: "secret_like_string", text: text.slice(0, 160), ...loc });
    if (MODEL_WEIGHT_RE.test(text)) failures.push({ code: "model_weight_file_reference", text: text.slice(0, 160), ...loc });
    if (FORBIDDEN_SOURCE_RE.test(text)) failures.push({ code: "forbidden_source_reference", text: text.slice(0, 160), ...loc });
    if (PURGED_CANDIDATE_RE.test(text)) failures.push({ code: "purged_candidate_reference", ...loc });
    if (FINAL_STRATEGY_RE.test(text)) failures.push({ code: "forbidden_final_strategy_claim", text: text.slice(0, 160), ...loc });
  }

  const rowFingerprint = normalize(JSON.stringify(Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith("__")))));
  if (seenRows.has(rowFingerprint)) failures.push({ code: "exact_duplicate_row", ...loc });
  seenRows.add(rowFingerprint);
  const target = normalize(row.target_answer);
  targetCounts.set(target, (targetCounts.get(target) || 0) + 1);
}

async function main() {
  const config = await readJson(CONFIG_PATH);
  const rows = [
    ...(await readJsonl(config.outputs.train, "train")),
    ...(await readJsonl(config.outputs.dev, "dev")),
    ...(await readJsonl(config.outputs.heldout, "heldout"))
  ];
  const failures = [];
  const seenIds = new Set();
  const seenRows = new Set();
  const targetCounts = new Map();

  for (const row of rows) validateRow(row, config, failures, seenIds, seenRows, targetCounts);

  const validRows = rows.filter((row) => !row.__parse_error);
  const splitCounts = countBy(validRows, "split");
  const familyCounts = countBy(validRows, "task_family");
  const languageCounts = countBy(validRows, "language");
  const taskTypeCounts = countBy(validRows, "task_type");
  const policyTagCounts = {};
  for (const row of validRows) {
    for (const tag of Array.isArray(row.policy_tags) ? row.policy_tags : []) {
      policyTagCounts[tag] = (policyTagCounts[tag] || 0) + 1;
    }
  }

  if (validRows.length < config.target_total_rows) failures.push({ code: "row_count_below_target", rows: validRows.length, target: config.target_total_rows });
  if ((splitCounts.train || 0) < config.train_rows) failures.push({ code: "train_count_below_target", count: splitCounts.train || 0, target: config.train_rows });
  if ((splitCounts.dev || 0) < config.dev_rows) failures.push({ code: "dev_count_below_target", count: splitCounts.dev || 0, target: config.dev_rows });
  if ((splitCounts.heldout || 0) < config.heldout_rows) failures.push({ code: "heldout_count_below_target", count: splitCounts.heldout || 0, target: config.heldout_rows });
  if (Object.keys(familyCounts).length < config.min_families) failures.push({ code: "family_count_below_minimum", count: Object.keys(familyCounts).length, minimum: config.min_families });
  for (const language of config.min_languages) {
    if (!languageCounts[language]) failures.push({ code: "missing_language", language });
  }
  for (const taskType of config.min_task_types) {
    if (!taskTypeCounts[taskType]) failures.push({ code: "missing_task_type", task_type: taskType });
  }
  for (const tag of config.required_policy_tags) {
    if (!policyTagCounts[tag]) failures.push({ code: "missing_policy_tag", tag });
  }
  for (const [target, count] of targetCounts.entries()) {
    if (count > 1) failures.push({ code: "target_answer_duplicate", count, target: target.slice(0, 180) });
  }

  const report = {
    ok: failures.length === 0,
    total_rows: validRows.length,
    split_counts: splitCounts,
    family_count: Object.keys(familyCounts).length,
    language_counts: languageCounts,
    task_type_counts: taskTypeCounts,
    required_policy_tags_present: config.required_policy_tags.every((tag) => Boolean(policyTagCounts[tag])),
    max_target_answer_duplication: Math.max(0, ...targetCounts.values()),
    failures
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
