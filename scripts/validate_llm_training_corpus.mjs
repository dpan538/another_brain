#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS_DIR = resolve(ROOT, "training/llm_corpus");
const BASE_FILES = ["train.jsonl", "dev.jsonl", "heldout.jsonl"];
const PROMOTED_REPO_DERIVED_FILE_RE = /^r25a[km]_repo_derived_(train|dev|heldout)\.jsonl$/;
const PROMOTED_USER_ANSWERED_FILE_RE = /^r26[eg]_user_answered_(train|dev|heldout)\.jsonl$/;

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

const PROMOTED_REPO_DERIVED_REQUIRED_FIELDS = [
  "sample_id",
  "split",
  "language",
  "transformation_type",
  "source_category",
  "source_ids",
  "source_file_refs",
  "source_hashes",
  "messages",
  "target_answer",
  "rejected_answers",
  "constraints",
  "personal_color_targets",
  "provenance",
  "review_status",
  "contains_private_data",
  "public_commit_allowed",
  "training_allowed"
];

const PROMOTED_USER_ANSWERED_REQUIRED_FIELDS = [
  "sample_id",
  "pack_id",
  "source_row_id",
  "source_row_range_policy",
  "split",
  "language",
  "module",
  "scene",
  "speaker_context",
  "question_intent",
  "suggested_answer_mode",
  "question",
  "messages",
  "answer_target_note",
  "user_answer_raw",
  "user_answer_clean",
  "should_answer",
  "source_should_answer_raw",
  "response_obligation",
  "direct_compliance",
  "valid_nonanswer",
  "answer_mode",
  "answer_as",
  "stance",
  "evidence_policy",
  "candidate_type",
  "target_answer",
  "rejected_answers",
  "tags",
  "risk_flags",
  "split_suggestion",
  "eligibility",
  "exclusion_reason",
  "provenance",
  "review_status",
  "contains_private_data",
  "training_allowed",
  "public_commit_allowed"
];

const PROMOTED_USER_ANSWERED_OPTIONAL_FIELDS = new Set([
  "display_id",
  "replacement_for_pack_id",
  "replacement_for_display_id",
  "type",
  "metadata_fix_phase",
  "metadata_fix_reason",
  "promotion_ordinal"
]);

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
const REPO_DERIVED_TRANSFORMATION_TYPES = new Set([
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
]);
const MODEL_WEIGHT_REF = /\.(safetensors|gguf|bin|pt|pth|onnx|mlmodel|mlpackage|ckpt)\b/i;
const LOCAL_PATH_REF = /\/Users\/|\/private\/var\/|\/Volumes\//;
const SECRET_REF = /\b(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}|BEGIN PRIVATE KEY)\b/;
const ROOT_DOC_REF = /^[^/]+\.(pdf|PDF|docx|DOCX|doc|DOC)$/;

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

function isPromotedRepoDerivedRow(row) {
  return PROMOTED_REPO_DERIVED_FILE_RE.test(String(row.__file || "")) || /^r25a[km]_repo_derived_/.test(String(row.sample_id || ""));
}

function isPromotedUserAnsweredRow(row) {
  return PROMOTED_USER_ANSWERED_FILE_RE.test(String(row.__file || "")) || /^r26e_user_answered_/.test(String(row.sample_id || ""));
}

function expectedPromotedFile(row) {
  const match = String(row.__file || "").match(PROMOTED_REPO_DERIVED_FILE_RE);
  const prefix = match ? row.__file.split(`_${match[1]}.jsonl`)[0] : String(row.sample_id || "").startsWith("r25am_") ? "r25am_repo_derived" : "r25ak_repo_derived";
  return `${prefix}_${row.split}.jsonl`;
}

function expectedPromotedBy(row) {
  return String(row.sample_id || "").startsWith("r25am_") || String(row.__file || "").startsWith("r25am_")
    ? "scripts/promote_r25am_second_chinese_corpus.mjs"
    : "scripts/promote_r25ak_unique_candidates.mjs";
}

function expectedPromotionPhase(row) {
  return String(row.sample_id || "").startsWith("r25am_") || String(row.__file || "").startsWith("r25am_") ? "R25AM" : "R25AK";
}

function rowFamily(row) {
  return row.task_family || row.transformation_type || "unknown";
}

export async function loadCorpusRows(root = ROOT) {
  const rows = [];
  const corpusFiles = [
    ...BASE_FILES,
    ...(await readdir(resolve(root, "training/llm_corpus"))).filter((file) => PROMOTED_REPO_DERIVED_FILE_RE.test(file) || PROMOTED_USER_ANSWERED_FILE_RE.test(file)).sort()
  ];
  for (const file of corpusFiles) {
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
    const promotedRepoDerived = isPromotedRepoDerivedRow(row);
    const promotedUserAnswered = isPromotedUserAnsweredRow(row);
    const requiredFields = promotedUserAnswered ? PROMOTED_USER_ANSWERED_REQUIRED_FIELDS : promotedRepoDerived ? PROMOTED_REPO_DERIVED_REQUIRED_FIELDS : REQUIRED_FIELDS;
    for (const field of requiredFields) {
      if (!(field in row)) failures.push({ code: "missing_required_field", field, ...loc });
    }
    const extraFields = Object.keys(row).filter((key) => {
      if (key.startsWith("__")) return false;
      if (requiredFields.includes(key)) return false;
      if (promotedUserAnswered && PROMOTED_USER_ANSWERED_OPTIONAL_FIELDS.has(key)) return false;
      return true;
    });
    if (extraFields.length) failures.push({ code: "unexpected_fields", fields: extraFields, ...loc });

    if (sampleIds.has(row.sample_id)) failures.push({ code: "duplicate_sample_id", ...loc });
    sampleIds.add(row.sample_id);
    if (!SPLITS.has(row.split)) failures.push({ code: "invalid_split", split: row.split, ...loc });
    const expectedFile = promotedUserAnswered ? `${String(row.sample_id || "").startsWith("r26g_") ? "r26g" : "r26e"}_user_answered_${row.split}.jsonl` : promotedRepoDerived ? expectedPromotedFile(row) : `${row.split}.jsonl`;
    if (row.__file && row.split && row.__file !== expectedFile) {
      failures.push({ code: "split_file_mismatch", split: row.split, ...loc });
    }
    if (!LANGUAGES.has(row.language)) failures.push({ code: "invalid_language", language: row.language, ...loc });
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
      if (!promotedRepoDerived && !promotedUserAnswered && !Array.isArray(row[arrayField])) failures.push({ code: "array_field_required", field: arrayField, ...loc });
    }
    if (promotedUserAnswered) {
      if (!["another_brain_question_pack_001", "another_brain_question_pack_002_abstract_values"].includes(row.pack_id)) failures.push({ code: "invalid_user_answer_pack_id", ...loc });
      if (Number(row.source_row_id) < 1 || Number(row.source_row_id) > 50) failures.push({ code: "user_answer_source_row_not_1_50", ...loc });
      if (row.pack_id === "another_brain_question_pack_001" && Number(row.source_row_id) >= 51) failures.push({ code: "excluded_question_pack_row_promoted", ...loc });
      if (row.pack_id === "another_brain_question_pack_002_abstract_values") {
        if (Number(row.display_id) < 51 || Number(row.display_id) > 100) failures.push({ code: "replacement_display_id_not_51_100", ...loc });
        if (row.replacement_for_pack_id !== "another_brain_question_pack_001") failures.push({ code: "replacement_for_pack_mismatch", ...loc });
      }
      if (row.answer_as !== "user_self") failures.push({ code: "answer_as_must_be_user_self", ...loc });
      if (normalize(row.target_answer) !== normalize(row.user_answer_clean)) failures.push({ code: "target_answer_must_match_user_answer_clean", ...loc });
      if (row.should_answer !== true) failures.push({ code: "should_answer_must_be_true", ...loc });
      if (row.response_obligation !== "produce_response") failures.push({ code: "response_obligation_must_be_produce_response", ...loc });
      for (const arrayField of ["constraints", "policy_tags", "expected_behavior", "forbidden_behavior", "retrieved_evidence"]) {
        if (row[arrayField] !== undefined) failures.push({ code: "unexpected_legacy_field_on_user_answer", field: arrayField, ...loc });
      }
      for (const arrayField of ["rejected_answers", "tags", "risk_flags"]) {
        if (!Array.isArray(row[arrayField])) failures.push({ code: "array_field_required", field: arrayField, ...loc });
      }
      if (Array.isArray(row.risk_flags) && row.risk_flags.length) failures.push({ code: "risk_flags_must_be_empty_for_promoted_user_answer", ...loc });
      if (!row.provenance || typeof row.provenance !== "object") failures.push({ code: "missing_provenance", ...loc });
      else {
        if (row.provenance.source_type !== "user_answered") failures.push({ code: "invalid_user_answer_source_type", ...loc });
        if (row.provenance.pack_id !== row.pack_id) failures.push({ code: "invalid_user_answer_provenance_pack", ...loc });
        if (row.provenance.external_llm_used !== false) failures.push({ code: "external_llm_used_must_be_false", ...loc });
        const expectedPromoter = String(row.sample_id || "").startsWith("r26g_") ? "scripts/promote_r26g_user_answers.mjs" : "scripts/promote_r26e_first50_user_answers.mjs";
        const expectedPhase = String(row.sample_id || "").startsWith("r26g_") ? "R26G" : "R26E";
        if (row.provenance.promoted_by !== expectedPromoter) failures.push({ code: "invalid_promoted_by", ...loc });
        if (row.provenance.promotion_phase !== expectedPhase) failures.push({ code: "invalid_promotion_phase", ...loc });
        if (row.provenance.contains_private_data !== false) failures.push({ code: "provenance_private_data_must_be_false", ...loc });
        if (row.provenance.license_or_permission !== "user-authored-reviewed-for-project-training") failures.push({ code: "invalid_provenance_license", ...loc });
      }
      if (row.review_status !== "reviewed_for_training_corpus") failures.push({ code: "invalid_review_status", ...loc });
      if (row.training_allowed !== true) failures.push({ code: "user_answer_training_allowed_must_be_true", ...loc });
      if (row.public_commit_allowed !== true) failures.push({ code: "user_answer_public_commit_allowed_must_be_true", ...loc });
      if (row.release_checkpoint === true) failures.push({ code: "release_checkpoint_claim_true", ...loc });
      if (row.product_model === true) failures.push({ code: "product_model_claim_true", ...loc });
    } else if (promotedRepoDerived) {
      if (!REPO_DERIVED_TRANSFORMATION_TYPES.has(row.transformation_type)) failures.push({ code: "invalid_repo_derived_transformation_type", transformation_type: row.transformation_type, ...loc });
      for (const arrayField of ["constraints", "rejected_answers", "source_ids", "source_file_refs", "source_hashes", "personal_color_targets"]) {
        if (!Array.isArray(row[arrayField])) failures.push({ code: "array_field_required", field: arrayField, ...loc });
      }
      for (const ref of row.source_file_refs || []) {
        if (ref.startsWith("evals/")) failures.push({ code: "eval_source_reference", ref, ...loc });
        if (ref.startsWith("data/public_ingestion/")) failures.push({ code: "data_public_ingestion_source_reference", ref, ...loc });
        if (ref.startsWith("private_sources/")) failures.push({ code: "private_sources_reference", ref, ...loc });
        if (ref.startsWith("artifacts/")) failures.push({ code: "artifact_source_reference", ref, ...loc });
        if (ROOT_DOC_REF.test(ref)) failures.push({ code: "root_document_source_reference", ref, ...loc });
      }
      if (!row.provenance || typeof row.provenance !== "object") failures.push({ code: "missing_provenance", ...loc });
      else {
        if (!["repo_derived", "project_authored"].includes(row.provenance.source_type)) failures.push({ code: "invalid_provenance_source_type", ...loc });
        if (row.provenance.external_llm_used !== false) failures.push({ code: "external_llm_used_must_be_false", ...loc });
        if (row.provenance.promoted_by !== expectedPromotedBy(row)) failures.push({ code: "invalid_promoted_by", ...loc });
        if (row.provenance.promotion_phase !== expectedPromotionPhase(row)) failures.push({ code: "invalid_promotion_phase", ...loc });
        if (row.provenance.contains_private_data !== false) failures.push({ code: "provenance_private_data_must_be_false", ...loc });
        if (!String(row.provenance.license_or_permission || "").includes("repo-tracked")) failures.push({ code: "invalid_provenance_license", ...loc });
      }
      if (row.review_status !== "reviewed_for_training_corpus") failures.push({ code: "invalid_review_status", ...loc });
      if (row.training_allowed !== true) failures.push({ code: "repo_derived_training_allowed_must_be_true", ...loc });
      if (row.public_commit_allowed !== true) failures.push({ code: "repo_derived_public_commit_allowed_must_be_true", ...loc });
      if (row.release_checkpoint === true) failures.push({ code: "release_checkpoint_claim_true", ...loc });
      if (row.product_model === true) failures.push({ code: "product_model_claim_true", ...loc });
    } else if (!row.provenance || typeof row.provenance !== "object") failures.push({ code: "missing_provenance", ...loc });
    else {
      if (!TASK_TYPES.has(row.task_type)) failures.push({ code: "invalid_task_type", task_type: row.task_type, ...loc });
      if (!REQUIRED_FAMILIES.includes(row.task_family)) failures.push({ code: "invalid_or_missing_task_family", task_family: row.task_family, ...loc });
      if (!["repo_derived", "template_generated"].includes(row.provenance.source_type)) failures.push({ code: "invalid_provenance_source_type", ...loc });
      if (row.provenance.generator !== "scripts/generate_r25b_llm_corpus.mjs") failures.push({ code: "invalid_provenance_generator", ...loc });
      if (row.provenance.license_or_permission !== "project-authored") failures.push({ code: "invalid_provenance_license", ...loc });
      if (row.provenance.contains_private_data !== false) failures.push({ code: "provenance_private_data_must_be_false", ...loc });
      if (row.review_status !== "reviewed_template") failures.push({ code: "invalid_review_status", ...loc });
    }

    const strings = collectStrings(row);
    for (const text of strings) {
      if (LOCAL_PATH_REF.test(text)) failures.push({ code: "local_path_reference", text: text.slice(0, 120), ...loc });
      if (SECRET_REF.test(text)) failures.push({ code: "secret_like_string", text: text.slice(0, 120), ...loc });
      if (MODEL_WEIGHT_REF.test(text)) failures.push({ code: "model_weight_file_reference", text: text.slice(0, 120), ...loc });
    }

    const fingerprint = normalize(`${row.user_goal || row.transformation_type || ""} ${row.target_answer}`);
    if (sampleFingerprints.has(fingerprint)) failures.push({ code: "duplicate_sample_fingerprint", ...loc });
    sampleFingerprints.add(fingerprint);

    const target = normalize(row.target_answer);
    if (!targetMap.has(target)) targetMap.set(target, { count: 0, families: new Set(), samples: [] });
    const item = targetMap.get(target);
    item.count += 1;
    item.families.add(rowFamily(row));
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
  const familyCounts = {};
  for (const row of rows.filter((item) => !item.__parse_error)) {
    const family = rowFamily(row);
    familyCounts[family] = (familyCounts[family] || 0) + 1;
  }
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
