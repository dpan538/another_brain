#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLING_CONFIG_PATH = "training/from_scratch/small_decoder_r25s_sampling_config.json";
const RUN_CONFIG_TEMPLATE_PATH = "training/from_scratch/small_decoder_pilot_run_config.r25s.template.json";
const APPROVAL_TEMPLATE_PATH = "training/from_scratch/APPROVE_R25S_DATA_FIRST_PILOT.template.json";
const SAMPLING_PLAN_PATH = "artifacts/training_os/small_decoder_pilot/r25r/r25s_balanced_dataset_plan.json";

const FINAL_STRATEGY_RE = /(?:lora|adapter|fine[- ]?tune|fine[- ]?tuning).{0,80}(?:final|strategy|product)/i;
const EXTERNAL_RE = /(?:external[_ -]?(?:api|backend|storage|model)|remote[_ -]?model|hosted[_ -]?model|server[_ -]?inference)/i;
const FORBIDDEN_DATA_RE = /(?:chain[_ -]?of[_ -]?thought|hidden_prompt|system_prompt|private_memory|raw_private_data|BEGIN PRIVATE KEY|api[_-]?key|\/Users\/[^/\s]+|data\/public_ingestion|evals\/)/i;

async function exists(path) {
  try {
    await access(resolve(ROOT, path));
    return true;
  } catch {
    return false;
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

function checkCommonConfig(label, value, failures) {
  if (value.product_model !== false) failures.push({ code: `${label}_product_model_must_be_false` });
  if (value.release_checkpoint !== false) failures.push({ code: `${label}_release_checkpoint_must_be_false` });
  if (value.phase_4_scaled_training === true) failures.push({ code: `${label}_phase_4_scaled_training_must_not_be_true` });
  if (value.commit_weights_allowed !== false && value.commit_weight_commit !== false) {
    failures.push({ code: `${label}_commit_weights_allowed_must_be_false` });
  }
  if (value.train_source === value.dev_source || value.train_source === value.heldout_source || value.dev_source === value.heldout_source) {
    failures.push({ code: `${label}_split_sources_must_be_separate` });
  }
  if (!/heldout\.jsonl$/.test(String(value.heldout_source || ""))) failures.push({ code: `${label}_heldout_source_must_be_heldout_jsonl` });
  if (!String(value.output_dir || value.artifact_output_root || "artifacts/training_os/small_decoder_pilot/r25s/").startsWith("artifacts/training_os/small_decoder_pilot/")) {
    failures.push({ code: `${label}_output_must_be_under_ignored_training_artifacts` });
  }
  const serialized = JSON.stringify(value);
  if (FINAL_STRATEGY_RE.test(serialized)) failures.push({ code: `${label}_lora_adapter_finetune_final_strategy_present` });
  if (EXTERNAL_RE.test(serialized)) failures.push({ code: `${label}_external_api_backend_or_storage_present` });
  if (FORBIDDEN_DATA_RE.test(serialized)) failures.push({ code: `${label}_forbidden_data_marker_present` });
}

async function main() {
  const failures = [];
  const samplingConfig = await readJson(SAMPLING_CONFIG_PATH).catch((error) => {
    failures.push({ code: "sampling_config_missing_or_invalid", detail: error.message });
    return null;
  });
  const runConfigTemplate = await readJson(RUN_CONFIG_TEMPLATE_PATH).catch((error) => {
    failures.push({ code: "run_config_template_missing_or_invalid", detail: error.message });
    return null;
  });
  const approvalTemplate = await readJson(APPROVAL_TEMPLATE_PATH).catch((error) => {
    failures.push({ code: "approval_template_missing_or_invalid", detail: error.message });
    return null;
  });
  const samplingPlan = (await exists(SAMPLING_PLAN_PATH)) ? await readJson(SAMPLING_PLAN_PATH) : null;

  if (samplingConfig) {
    checkCommonConfig("sampling_config", samplingConfig, failures);
    if (samplingConfig.training_allowed_by_default !== false) failures.push({ code: "sampling_config_training_allowed_by_default_must_be_false" });
    if (samplingConfig.requires_fresh_approval !== true) failures.push({ code: "sampling_config_requires_fresh_approval_must_be_true" });
    if (samplingConfig.sampling_strategy?.avoid_exact_heldout_copy !== true) failures.push({ code: "sampling_config_must_avoid_exact_heldout_copy" });
    if (samplingConfig.sampling_strategy?.avoid_eval_prompt_copy !== true) failures.push({ code: "sampling_config_must_avoid_eval_prompt_copy" });
  }

  if (runConfigTemplate) {
    checkCommonConfig("run_config_template", runConfigTemplate, failures);
    if (runConfigTemplate.approval_required !== true) failures.push({ code: "run_config_template_approval_required_must_be_true" });
    if (runConfigTemplate.approved_by_default !== false) failures.push({ code: "run_config_template_approved_by_default_must_be_false" });
    if (runConfigTemplate.long_term_training !== false) failures.push({ code: "run_config_template_long_term_training_must_be_false" });
    if (runConfigTemplate.formal_product_training !== false) failures.push({ code: "run_config_template_formal_product_training_must_be_false" });
    if (runConfigTemplate.heldout_source === runConfigTemplate.train_source) failures.push({ code: "run_config_template_heldout_must_not_be_train" });
  }

  if (approvalTemplate) {
    if (approvalTemplate.approved !== false) failures.push({ code: "approval_template_must_not_be_approved" });
    if (approvalTemplate.reviewer !== "") failures.push({ code: "approval_template_reviewer_must_be_blank" });
    if (approvalTemplate.allow_small_pilot_training !== false) failures.push({ code: "approval_template_must_not_allow_training" });
    if (approvalTemplate.allow_long_term_training !== false) failures.push({ code: "approval_template_must_not_allow_long_term_training" });
    if (approvalTemplate.allow_product_model_training !== false) failures.push({ code: "approval_template_must_not_allow_product_training" });
    if (approvalTemplate.allow_phase_4_scaled_training === true) failures.push({ code: "approval_template_must_not_allow_phase_4_scaled_training" });
    if (approvalTemplate.allow_release_checkpoint !== false) failures.push({ code: "approval_template_must_not_allow_release_checkpoint" });
    if (approvalTemplate.allow_weight_commit !== false) failures.push({ code: "approval_template_must_not_allow_weight_commit" });
    if (!String(approvalTemplate.artifact_output_root || "").startsWith("artifacts/training_os/small_decoder_pilot/r25s/")) {
      failures.push({ code: "approval_template_output_root_must_be_ignored_r25s" });
    }
  }

  if (!samplingPlan) {
    failures.push({ code: "sampling_plan_missing", path: SAMPLING_PLAN_PATH });
  } else {
    if (samplingPlan.ok !== true) failures.push({ code: "sampling_plan_not_ok" });
    if (samplingPlan.training_will_run !== false) failures.push({ code: "sampling_plan_must_not_run_training" });
    if (samplingPlan.train_row_count !== samplingConfig?.max_train_rows) failures.push({ code: "sampling_plan_train_count_mismatch" });
    if (samplingPlan.dev_row_count !== samplingConfig?.max_dev_rows) failures.push({ code: "sampling_plan_dev_count_mismatch" });
    if (samplingPlan.heldout_row_count !== samplingConfig?.max_heldout_rows) failures.push({ code: "sampling_plan_heldout_count_mismatch" });
    const overlap = samplingPlan.overlap || {};
    for (const [key, value] of Object.entries(overlap)) {
      if (Number(value) !== 0) failures.push({ code: "sampling_plan_split_overlap", key, value });
    }
  }

  const report = {
    ok: failures.length === 0,
    sampling_config_exists: Boolean(samplingConfig),
    run_config_template_exists: Boolean(runConfigTemplate),
    approval_template_exists: Boolean(approvalTemplate),
    sampling_plan_exists: Boolean(samplingPlan),
    no_training_allowed_by_default: Boolean(
      samplingConfig?.training_allowed_by_default === false &&
      runConfigTemplate?.approved_by_default === false &&
      approvalTemplate?.allow_small_pilot_training === false
    ),
    product_model: false,
    release_checkpoint: false,
    commit_weights_allowed: false,
    failures
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
