#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS_DIR = resolve(ROOT, "training/llm_corpus");
const FILES = ["train.jsonl", "dev.jsonl", "heldout.jsonl"];

export const REQUIRED_FAMILIES = Object.freeze([
  "static_browser_llm_policy",
  "no_backend_no_storage",
  "same_origin_model_assets",
  "decoder_llm_not_slm",
  "retrieval_grounded_draft",
  "verifier_rejects_bad_draft",
  "fallback_firewall_boundary",
  "privacy_boundary",
  "unknown_boundary",
  "copyright_boundary",
  "project_continuation",
  "constraint_preservation",
  "answer_density_control",
  "training_direction_correction",
  "behavior_repair_not_fact_expansion",
  "shard_runtime_as_evidence",
  "local_first_deployment_reasoning",
  "bilingual_zh_en_task_following",
  "route_plan_before_answer",
  "no_claimed_execution"
]);

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
const SPLITS = new Set(["train", "dev", "heldout"]);
const LANGUAGES = new Set(["zh", "en", "mixed"]);
const TASK_TYPES = new Set(["draft_answer", "verify_draft", "repair_draft", "route_plan", "retrieval_grounded_answer"]);
const MODEL_WEIGHT_REF = /\.(safetensors|gguf|bin|pt|pth|onnx|mlmodel|mlpackage|ckpt)\b/i;
const LOCAL_PATH_REF = /\/Users\/|\/private\/var\/|\/Volumes\//;
const SECRET_REF = /\b(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}|BEGIN PRIVATE KEY)\b/;

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

export async function loadCorpusRows(root = ROOT) {
  const rows = [];
  for (const file of FILES) {
    const text = await readFile(resolve(root, "training/llm_corpus", file), "utf8");
    for (const [index, line] of text.split(/\r?\n/).entries()) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        rows.push({ ...row, __file: file, __line: index + 1 });
      } catch (error) {
        rows.push({ __file: file, __line: index + 1, __parse_error: error.message });
      }
    }
  }
  return rows;
}

export function validateCorpusRows(rows) {
  const failures = [];
  const sampleIds = new Set();
  const sampleFingerprints = new Set();
  const targetMap = new Map();

  for (const row of rows) {
    const loc = { file: row.__file, line: row.__line, sample_id: row.sample_id || "" };
    if (row.__parse_error) {
      failures.push({ code: "jsonl_parse_error", ...loc, error: row.__parse_error });
      continue;
    }
    for (const field of REQUIRED_FIELDS) {
      if (!(field in row)) failures.push({ code: "missing_required_field", field, ...loc });
    }
    const extraFields = Object.keys(row).filter((key) => !REQUIRED_FIELDS.includes(key) && !key.startsWith("__"));
    if (extraFields.length) failures.push({ code: "unexpected_fields", fields: extraFields, ...loc });

    if (sampleIds.has(row.sample_id)) failures.push({ code: "duplicate_sample_id", ...loc });
    sampleIds.add(row.sample_id);
    if (!SPLITS.has(row.split)) failures.push({ code: "invalid_split", split: row.split, ...loc });
    if (row.__file && row.split && row.__file !== `${row.split}.jsonl`) {
      failures.push({ code: "split_file_mismatch", split: row.split, ...loc });
    }
    if (!LANGUAGES.has(row.language)) failures.push({ code: "invalid_language", language: row.language, ...loc });
    if (!TASK_TYPES.has(row.task_type)) failures.push({ code: "invalid_task_type", task_type: row.task_type, ...loc });
    if (!REQUIRED_FAMILIES.includes(row.task_family)) failures.push({ code: "invalid_or_missing_task_family", task_family: row.task_family, ...loc });
    if (row.contains_private_data !== false) failures.push({ code: "contains_private_data_must_be_false", ...loc });

    const forbiddenKeys = collectForbiddenKeys(row);
    for (const item of forbiddenKeys) failures.push({ code: "forbidden_key", ...loc, ...item });

    if (!Array.isArray(row.messages) || row.messages.length === 0) failures.push({ code: "messages_must_be_nonempty_array", ...loc });
    for (const [index, message] of (Array.isArray(row.messages) ? row.messages : []).entries()) {
      if (!message || !["user", "assistant"].includes(message.role) || typeof message.content !== "string" || !message.content.trim()) {
        failures.push({ code: "invalid_message", message_index: index, ...loc });
      }
    }
    for (const [index, evidence] of (Array.isArray(row.retrieved_evidence) ? row.retrieved_evidence : []).entries()) {
      if (evidence?.contains_private_data !== false) failures.push({ code: "evidence_private_data_must_be_false", evidence_index: index, ...loc });
      if (!evidence?.source_id || !evidence?.text) failures.push({ code: "invalid_evidence_entry", evidence_index: index, ...loc });
    }
    for (const arrayField of ["constraints", "rejected_answers", "policy_tags", "expected_behavior", "forbidden_behavior"]) {
      if (!Array.isArray(row[arrayField])) failures.push({ code: "array_field_required", field: arrayField, ...loc });
    }
    if (!row.provenance || typeof row.provenance !== "object") failures.push({ code: "missing_provenance", ...loc });
    else {
      if (!["repo_derived", "template_generated"].includes(row.provenance.source_type)) failures.push({ code: "invalid_provenance_source_type", ...loc });
      if (row.provenance.generator !== "scripts/generate_r25b_llm_corpus.mjs") failures.push({ code: "invalid_provenance_generator", ...loc });
      if (row.provenance.license_or_permission !== "project-authored") failures.push({ code: "invalid_provenance_license", ...loc });
      if (row.provenance.contains_private_data !== false) failures.push({ code: "provenance_private_data_must_be_false", ...loc });
    }
    if (row.review_status !== "reviewed_template") failures.push({ code: "invalid_review_status", ...loc });

    const strings = collectStrings(row);
    for (const text of strings) {
      if (LOCAL_PATH_REF.test(text)) failures.push({ code: "local_path_reference", text: text.slice(0, 120), ...loc });
      if (SECRET_REF.test(text)) failures.push({ code: "secret_like_string", text: text.slice(0, 120), ...loc });
      if (MODEL_WEIGHT_REF.test(text)) failures.push({ code: "model_weight_file_reference", text: text.slice(0, 120), ...loc });
    }

    const fingerprint = normalize(`${row.user_goal} ${row.target_answer}`);
    if (sampleFingerprints.has(fingerprint)) failures.push({ code: "duplicate_sample_fingerprint", ...loc });
    sampleFingerprints.add(fingerprint);

    const target = normalize(row.target_answer);
    if (!targetMap.has(target)) targetMap.set(target, { count: 0, families: new Set(), samples: [] });
    const item = targetMap.get(target);
    item.count += 1;
    item.families.add(row.task_family);
    item.samples.push(row.sample_id);
  }

  for (const [target, item] of targetMap.entries()) {
    if (item.families.size > 1 && item.count > 2) {
      failures.push({
        code: "target_answer_repeated_across_unrelated_families",
        count: item.count,
        family_count: item.families.size,
        sample_ids: item.samples.slice(0, 8),
        target: target.slice(0, 160)
      });
    }
  }

  const splitCounts = countBy(rows.filter((row) => !row.__parse_error), "split");
  const familyCounts = countBy(rows.filter((row) => !row.__parse_error), "task_family");
  if (rows.length < 480) failures.push({ code: "row_count_below_minimum", rows: rows.length, minimum: 480 });
  if ((splitCounts.train || 0) < 320) failures.push({ code: "train_count_below_minimum", count: splitCounts.train || 0, minimum: 320 });
  if ((splitCounts.dev || 0) < 80) failures.push({ code: "dev_count_below_minimum", count: splitCounts.dev || 0, minimum: 80 });
  if ((splitCounts.heldout || 0) < 80) failures.push({ code: "heldout_count_below_minimum", count: splitCounts.heldout || 0, minimum: 80 });
  for (const family of REQUIRED_FAMILIES) {
    if (!familyCounts[family]) failures.push({ code: "missing_required_task_family", family });
  }

  return {
    ok: failures.length === 0,
    total_rows: rows.length,
    split_counts: splitCounts,
    family_counts: familyCounts,
    failures
  };
}

async function main() {
  JSON.parse(await readFile(resolve(CORPUS_DIR, "schema.json"), "utf8"));
  JSON.parse(await readFile(resolve(CORPUS_DIR, "registry.json"), "utf8"));
  const rows = await loadCorpusRows(ROOT);
  const report = validateCorpusRows(rows);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
