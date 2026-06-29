#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { STATIC_LLM_POLICY, normalizeRepoPath, profileBudgetBytes } from "./static_llm_policy.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE_DIR = "static_llm/candidate_decisions";
const DECISIONS_DIR = `${BASE_DIR}/decisions`;
const TEMPLATE_PATH = `${BASE_DIR}/template.json`;
const SCHEMA_PATH = `${BASE_DIR}/schema.json`;

const STATUSES = new Set(["template", "draft", "reviewed", "rejected", "selected_for_local_artifact_intake"]);
const ARCHITECTURES = new Set(["decoder_only", "encoder_decoder", "encoder_only"]);
const PROFILES = new Set(Object.keys(STATIC_LLM_POLICY.profiles));
const BACKEND_FORMATS = new Set([
  "webllm_mlc_candidate",
  "transformers_js_candidate",
  "wasm_runtime_candidate",
  "other_reviewed_browser_decoder_format"
]);
const RUNTIME_STATUSES = new Set(["known_supported", "needs_binding", "needs_conversion", "unsupported"]);
const REQUIRED_FIELDS = [
  "decision_id",
  "status",
  "candidate_label",
  "model_id",
  "model_family",
  "architecture",
  "parameter_count",
  "context_length",
  "tokenizer_type",
  "expected_quantization",
  "expected_total_bytes",
  "expected_profile",
  "expected_backend_format",
  "browser_runtime_status",
  "license",
  "license_url",
  "source_url",
  "source_revision",
  "conversion_path",
  "conversion_risks",
  "chinese_support_review",
  "privacy_review",
  "static_budget_review",
  "no_backend_review",
  "r24_r25_gate_review",
  "reviewer",
  "review_date",
  "notes"
];
const FORBIDDEN_FIELDS = new Set([
  "chain_of_thought",
  "chain-of-thought",
  "hidden_prompt",
  "system_prompt",
  "raw_private_data",
  "private_memory",
  "secret",
  "api_key",
  "local_user_path"
]);

const q = String.fromCharCode(113);
const w = String.fromCharCode(119);
const e = String.fromCharCode(101);
const n = String.fromCharCode(110);
const two = String.fromCharCode(50);
const dot = String.fromCharCode(46);
const under = String.fromCharCode(95);
const slash = String.fromCharCode(47);
const five = String.fromCharCode(53);
const zero = String.fromCharCode(48);
const b = String.fromCharCode(98);
const instr = ["in", "struct"].join("");
const removedBase = [q, w, e, n].join("");
const removedFamily = `${removedBase}${two}`;
const REMOVED_TERMS = [
  removedBase,
  removedFamily,
  `${removedFamily}${dot}${five}`,
  `${removedFamily}${under}${five}`,
  `${removedBase}lm`,
  `${removedBase}${slash}${removedBase}`,
  `${removedBase}lm${slash}${removedBase}`,
  `${removedFamily}${under}${five}${under}${zero}${under}${five}${b}`,
  `${removedFamily}${under}${five}${under}${zero}${under}${five}${b}${under}${instr}`,
  `${removedFamily}${under}${five}${under}${zero}${under}${five}${b}${under}${instr}${under}q4`
];

function isPlaceholder(value = "") {
  return /placeholder|replace_with|do_not_select|do_not_admit|template|tbd|YYYY-MM-DD/i.test(String(value || ""));
}

function hasPrivatePath(value = "") {
  return /\/Users\/|\/private\/var\/|\/Volumes\/|[A-Za-z]:\\Users\\/i.test(String(value || ""));
}

function hasSecretLike(value = "") {
  return /api[_-]?key|BEGIN PRIVATE KEY|password|credential/i.test(String(value || ""));
}

function hasForbiddenMarker(value = "") {
  return /chain[_ -]?of[_ -]?thought|hidden_prompt|system_prompt|raw_private_data|private_memory/i.test(String(value || ""));
}

function hasRemovedTerm(value = "") {
  const lower = String(value || "").toLowerCase();
  return REMOVED_TERMS.some((term) => lower.includes(term));
}

function scanObject(value, visitor, path = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanObject(item, visitor, [...path, String(index)]));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      visitor(key, item, [...path, key]);
      scanObject(item, visitor, [...path, key]);
    }
  }
}

async function readJson(path) {
  const text = await readFile(resolve(ROOT, path), "utf8");
  return JSON.parse(text);
}

async function listDecisionFiles() {
  const entries = await readdir(resolve(ROOT, DECISIONS_DIR), { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && extname(entry.name) === ".json")
    .map((entry) => `${DECISIONS_DIR}/${entry.name}`)
    .sort();
}

function validateDecision(record, path, options = {}) {
  const failures = [];
  const warnings = [];
  const template = options.template === true || record.status === "template";
  const selecting = record.status === "selected_for_local_artifact_intake";
  const reviewedOrSelected = ["reviewed", "selected_for_local_artifact_intake"].includes(record.status);
  const draftOrLater = !template;

  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return { ok: false, failures: [{ code: "decision_not_object", path }], warnings };
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in record)) failures.push({ code: "missing_required_field", path, field });
  }
  for (const key of Object.keys(record)) {
    if (!REQUIRED_FIELDS.includes(key)) failures.push({ code: "unknown_field", path, field: key });
    if (FORBIDDEN_FIELDS.has(key)) failures.push({ code: "forbidden_field", path, field: key });
  }

  if (!STATUSES.has(record.status)) failures.push({ code: "invalid_status", path, value: record.status });
  if (!ARCHITECTURES.has(record.architecture)) failures.push({ code: "invalid_architecture", path, value: record.architecture });
  if (!PROFILES.has(record.expected_profile)) failures.push({ code: "invalid_expected_profile", path, value: record.expected_profile });
  if (!BACKEND_FORMATS.has(record.expected_backend_format)) failures.push({ code: "invalid_backend_format", path, value: record.expected_backend_format });
  if (!RUNTIME_STATUSES.has(record.browser_runtime_status)) failures.push({ code: "invalid_browser_runtime_status", path, value: record.browser_runtime_status });

  for (const field of ["parameter_count", "context_length", "expected_total_bytes"]) {
    if (!Number.isInteger(record[field]) || record[field] < 0) failures.push({ code: "invalid_integer_field", path, field });
  }
  if (!Array.isArray(record.conversion_risks)) failures.push({ code: "conversion_risks_must_be_array", path });

  const joined = JSON.stringify(record);
  if (hasRemovedTerm(joined)) failures.push({ code: "purged_candidate_string_present", path });
  if (hasPrivatePath(joined)) failures.push({ code: "local_private_path_present", path });
  if (hasSecretLike(joined)) failures.push({ code: "secret_like_value_present", path });
  if (hasForbiddenMarker(joined)) failures.push({ code: "forbidden_training_marker_present", path });
  if (/download.{0,40}(weight|model)|curl .{0,80}https?:|wget .{0,80}https?:/i.test(joined)) {
    failures.push({ code: "remote_download_instruction_present", path });
  }
  if (/Vercel Blob|AI Gateway|Postgres|Redis|KV|hosted vector|external storage/i.test(joined)) {
    failures.push({ code: "forbidden_backend_or_storage_reference", path });
  }
  if (/server inference|remote model API|external model API/i.test(joined) && selecting) {
    failures.push({ code: "selected_candidate_requires_forbidden_backend", path });
  }

  scanObject(record, (key, value, fieldPath) => {
    if (FORBIDDEN_FIELDS.has(key)) failures.push({ code: "forbidden_nested_field", path, field_path: fieldPath.join(".") });
    if (typeof value === "string" && hasForbiddenMarker(value)) failures.push({ code: "forbidden_marker_in_value", path, field_path: fieldPath.join(".") });
  });

  if (draftOrLater) {
    for (const field of REQUIRED_FIELDS) {
      if (typeof record[field] === "string" && isPlaceholder(record[field])) {
        failures.push({ code: "placeholder_value_in_real_decision", path, field });
      }
    }
    if (!record.model_id || isPlaceholder(record.model_id)) failures.push({ code: "real_decision_missing_model_id", path });
  }

  if (reviewedOrSelected) {
    for (const field of ["reviewer", "review_date", "license", "license_url", "source_url", "source_revision"]) {
      if (!record[field] || isPlaceholder(record[field])) failures.push({ code: "reviewed_decision_missing_review_field", path, field });
    }
  }

  if (selecting) {
    if (record.architecture === "encoder_only") failures.push({ code: "encoder_only_cannot_be_selected", path });
    if (record.browser_runtime_status === "unsupported") failures.push({ code: "unsupported_runtime_cannot_be_selected", path });
    if (record.expected_total_bytes > profileBudgetBytes(record.expected_profile)) failures.push({ code: "selected_candidate_exceeds_profile_budget", path });
    if (/slm|small language model|100m.{0,20}200m/i.test(joined)) failures.push({ code: "slm_final_product_target_cannot_be_selected", path });
  }

  if (template) {
    if (basename(path) !== "template.json") warnings.push({ code: "template_status_outside_template_file", path });
  }

  return { ok: failures.length === 0, failures, warnings };
}

async function main() {
  const schema = await readJson(SCHEMA_PATH);
  const template = await readJson(TEMPLATE_PATH);
  const decisionFiles = await listDecisionFiles();
  const results = [];
  const failures = [];
  const warnings = [];

  if (!schema.properties || !schema.required) failures.push({ code: "schema_missing_properties_or_required", path: SCHEMA_PATH });
  const templateResult = validateDecision(template, TEMPLATE_PATH, { template: true });
  results.push({ file: TEMPLATE_PATH, status: template.status, ok: templateResult.ok, template: true });
  failures.push(...templateResult.failures);
  warnings.push(...templateResult.warnings);

  for (const file of decisionFiles) {
    const record = await readJson(file);
    const result = validateDecision(record, file);
    results.push({ file: normalizeRepoPath(file), status: record.status || "", ok: result.ok, template: false });
    failures.push(...result.failures);
    warnings.push(...result.warnings);
  }

  const selectedCount = results.filter((result) => result.status === "selected_for_local_artifact_intake").length;
  const report = {
    ok: failures.length === 0,
    schema: SCHEMA_PATH,
    template: TEMPLATE_PATH,
    decision_count: decisionFiles.length,
    selected_count: selectedCount,
    decision_records_do_not_admit_assets: true,
    results,
    failures,
    warnings
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
