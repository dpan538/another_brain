#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DESIGN_PATH = "training/from_scratch/small_decoder_r25y_data_regularization_config.json";
const RUN_TEMPLATE_PATH = "training/from_scratch/small_decoder_pilot_run_config.r25y.template.json";
const APPROVAL_TEMPLATE_PATH = "training/from_scratch/APPROVE_R25Y_DATA_REGULARIZATION_PILOT.template.json";
const FORBIDDEN_TEXT_RE = new RegExp(
  [
    "\\bLo" + "RA\\b",
    "\\badapt" + "er\\b",
    "fine[- ]?tune",
    "pre" + "trained",
    "pre-" + "trained",
    ["foundation", "model"].join(" "),
    "hugging" + "face\\.co",
    "open" + "ai\\.com",
    ["Vercel", "Blob"].join(" "),
    ["K", "V"].join(""),
    "Post" + "gres",
    "Re" + "dis",
    ["AI", "Gateway"].join(" "),
    "api" + "\\/",
    "funct" + "ions",
    ["edge", "function"].join(" "),
    "chain_of_" + "thought",
    "hidden_" + "prompt",
    "system_" + "prompt",
    "raw_private_" + "data",
    "private_" + "memory"
  ].join("|"),
  "i"
);

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

function failIf(condition, failures, code, details = {}) {
  if (condition) failures.push({ code, ...details });
}

function checkCommonConfig(config, failures, source) {
  failIf(config.run_id !== "r25y_data_regularized_192", failures, "run_id_mismatch", { source, actual: config.run_id });
  failIf(config.variant_id !== "r25y_data_regularized_192", failures, "variant_id_mismatch", { source, actual: config.variant_id });
  failIf(config.training_allowed_by_default !== false, failures, "training_allowed_by_default_must_be_false", { source });
  failIf(config.requires_fresh_approval !== true, failures, "requires_fresh_approval_must_be_true", { source });
  failIf(config.product_model !== false, failures, "product_model_must_be_false", { source });
  failIf(config.release_checkpoint !== false, failures, "release_checkpoint_must_be_false", { source });
  failIf(config.phase_4_scaled_training !== false, failures, "phase_4_scaled_training_must_be_false", { source });
  failIf(config.commit_weights_allowed !== false, failures, "commit_weights_allowed_must_be_false", { source });
  failIf(config.train_source !== "training/llm_corpus/r25l_train.jsonl", failures, "train_source_mismatch", { source, actual: config.train_source });
  failIf(config.dev_source !== "training/llm_corpus/r25l_dev.jsonl", failures, "dev_source_mismatch", { source, actual: config.dev_source });
  failIf(config.heldout_source !== "training/llm_corpus/r25l_heldout.jsonl", failures, "heldout_source_mismatch", { source, actual: config.heldout_source });
  failIf(config.train_source === config.heldout_source, failures, "heldout_used_for_training", { source });
  failIf(config.architecture?.basis !== "r25s_baseline_data_first", failures, "must_be_based_on_r25s_data_first", { source, actual: config.architecture?.basis });
  failIf(Number(config.architecture?.layers) !== 1, failures, "must_not_use_deeper_r25v_architecture", { source, actual: config.architecture?.layers });
  failIf(String(config.architecture?.type || "") !== "causal_decoder_pilot", failures, "architecture_type_mismatch", { source, actual: config.architecture?.type });
}

async function main() {
  const failures = [];
  for (const path of [DESIGN_PATH, RUN_TEMPLATE_PATH, APPROVAL_TEMPLATE_PATH]) {
    failIf(!(await exists(path)), failures, "required_file_missing", { path });
  }
  if (failures.length) {
    console.log(JSON.stringify({ ok: false, failures }, null, 2));
    process.exit(2);
  }

  const design = await readJson(DESIGN_PATH);
  const runTemplate = await readJson(RUN_TEMPLATE_PATH);
  const approvalTemplate = await readJson(APPROVAL_TEMPLATE_PATH);
  checkCommonConfig(design, failures, DESIGN_PATH);
  checkCommonConfig(runTemplate, failures, RUN_TEMPLATE_PATH);
  failIf(runTemplate.output_dir !== "artifacts/training_os/small_decoder_pilot/r25y/", failures, "output_dir_must_be_ignored_r25y_path", { actual: runTemplate.output_dir });
  failIf(runTemplate.formal_product_training !== false, failures, "formal_product_training_must_be_false");
  failIf(runTemplate.long_term_training !== false, failures, "long_term_training_must_be_false");
  failIf(runTemplate.approved_by_default !== false, failures, "approved_by_default_must_be_false");
  failIf(runTemplate.approval_required !== true, failures, "approval_required_must_be_true");

  failIf(approvalTemplate.approved !== false, failures, "approval_template_must_not_be_approved");
  failIf(approvalTemplate.scope !== "data_regularization_small_decoder_pilot_only", failures, "approval_scope_mismatch", { actual: approvalTemplate.scope });
  failIf(approvalTemplate.phase !== "phase_3_small_decoder_pilot", failures, "approval_phase_mismatch", { actual: approvalTemplate.phase });
  failIf(approvalTemplate.run_id !== "r25y_data_regularized_192", failures, "approval_run_id_mismatch", { actual: approvalTemplate.run_id });
  failIf(approvalTemplate.variant_id !== "r25y_data_regularized_192", failures, "approval_variant_id_mismatch", { actual: approvalTemplate.variant_id });
  for (const key of [
    "allow_small_pilot_training",
    "allow_data_regularization_training",
    "allow_phase_4_scaled_training",
    "allow_long_term_training",
    "allow_product_model_training",
    "allow_release_checkpoint",
    "allow_weight_commit"
  ]) {
    failIf(approvalTemplate[key] !== false, failures, "approval_training_flag_must_be_false", { key, actual: approvalTemplate[key] });
  }
  failIf(approvalTemplate.reviewer !== "", failures, "approval_template_reviewer_must_be_blank");
  failIf(approvalTemplate.artifact_output_root !== "artifacts/training_os/small_decoder_pilot/r25y/", failures, "approval_artifact_root_mismatch");
  failIf(await exists("training/from_scratch/APPROVE_R25Y_DATA_REGULARIZATION_PILOT.json"), failures, "active_r25y_approval_marker_must_not_exist");
  for (const [source, value] of Object.entries({ design, runTemplate, approvalTemplate })) {
    const text = JSON.stringify(value);
    failIf(FORBIDDEN_TEXT_RE.test(text), failures, "forbidden_text_in_r25y_design", { source });
  }

  const report = {
    ok: failures.length === 0,
    training_will_run: false,
    r25y_design_status: failures.length === 0 ? "valid_inert_data_regularization_design" : "invalid",
    approval_template_status: approvalTemplate.approved === false ? "inert_template_approved_false" : "needs_review",
    output_dir: runTemplate.output_dir,
    active_training_approval_count: 0,
    product_model: false,
    release_checkpoint: false,
    phase_4_scaled_training_approved: false,
    based_on: design.architecture?.basis,
    notes: [
      "R25Y design validation does not train.",
      "R25Y remains a future data-regularization pilot design requiring fresh reviewer approval.",
      "Phase_4 scaled training remains blocked."
    ],
    failures
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
