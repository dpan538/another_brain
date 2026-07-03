#!/usr/bin/env node
import { execFile as execFileCallback } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const ROOT = resolve(new URL("..", import.meta.url).pathname);

const paths = {
  approval: "training/from_scratch/APPROVE_R25AO_EXPANDED_CHINESE_PERSONAL_MICROCYCLE.json",
  config: "training/from_scratch/small_decoder_pilot_run_config.r25ao.json",
  r25apTemplate: "training/from_scratch/APPROVE_R25AP_ANALYZE_R25AO.template.json",
  dataset: "artifacts/training_os/small_decoder_pilot/r25ao/r25ao_dataset_report.json",
  run: "artifacts/training_os/small_decoder_pilot/r25ao/r25ao_small_decoder_run_report.json",
  eval: "artifacts/training_os/small_decoder_pilot/r25ao/r25ao_small_decoder_eval_report.json",
  heldout: "artifacts/training_os/small_decoder_pilot/r25ao/r25ao_heldout_eval_report.json",
  breakdown: "artifacts/training_os/small_decoder_pilot/r25ao/r25ao_chinese_personal_breakdown.json",
  history: "artifacts/training_os/small_decoder_pilot/r25ao/r25ao_history_comparison.json",
  r25anTokenizer: "artifacts/training_os/tokenizer_dryrun/r25an/r25an_tokenizer_readiness_report.json",
  r25anSampler: "artifacts/training_os/corpus_review/r25an/r25an_chinese_sampler_feasibility.json"
};

function abs(path) {
  return resolve(ROOT, path);
}

async function readJson(path) {
  return JSON.parse(await readFile(abs(path), "utf8"));
}

function pushIf(failures, condition, code, detail = {}) {
  if (condition) failures.push({ code, ...detail });
}

function share(counts = {}, key) {
  const total = Number(counts.total) || Object.values(counts).reduce((sum, value) => sum + (Number(value) || 0), 0);
  return total ? (Number(counts[key]) || 0) / total : 0;
}

async function gitOutput(args) {
  const result = await execFile("git", args, { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 });
  return result.stdout.trim();
}

async function main() {
  const failures = [];

  const approval = await readJson(paths.approval).catch((error) => {
    failures.push({ code: "approval_missing_or_invalid", detail: error.message });
    return null;
  });
  const config = await readJson(paths.config).catch((error) => {
    failures.push({ code: "config_missing_or_invalid", detail: error.message });
    return null;
  });
  const r25apTemplate = await readJson(paths.r25apTemplate).catch((error) => {
    failures.push({ code: "r25ap_template_missing_or_invalid", detail: error.message });
    return null;
  });
  const dataset = await readJson(paths.dataset).catch((error) => {
    failures.push({ code: "dataset_report_missing_or_invalid", detail: error.message });
    return null;
  });
  const run = await readJson(paths.run).catch((error) => {
    failures.push({ code: "run_report_missing_or_invalid", detail: error.message });
    return null;
  });
  const evalReport = await readJson(paths.eval).catch((error) => {
    failures.push({ code: "eval_report_missing_or_invalid", detail: error.message });
    return null;
  });
  const heldout = await readJson(paths.heldout).catch((error) => {
    failures.push({ code: "heldout_report_missing_or_invalid", detail: error.message });
    return null;
  });
  const breakdown = await readJson(paths.breakdown).catch((error) => {
    failures.push({ code: "breakdown_report_missing_or_invalid", detail: error.message });
    return null;
  });
  const history = await readJson(paths.history).catch((error) => {
    failures.push({ code: "history_report_missing_or_invalid", detail: error.message });
    return null;
  });
  const r25anTokenizer = await readJson(paths.r25anTokenizer).catch((error) => {
    failures.push({ code: "r25an_tokenizer_readiness_missing_or_invalid", detail: error.message });
    return null;
  });
  const r25anSampler = await readJson(paths.r25anSampler).catch((error) => {
    failures.push({ code: "r25an_sampler_readiness_missing_or_invalid", detail: error.message });
    return null;
  });

  pushIf(failures, approval?.approved !== true, "approval_not_marked_approved");
  pushIf(failures, approval?.consumed !== true, "approval_not_consumed");
  pushIf(failures, approval?.allow_additional_runs !== false, "approval_allows_additional_runs");
  pushIf(failures, approval?.allow_small_pilot_training !== true, "approval_missing_small_pilot_flag");
  pushIf(failures, approval?.allow_bounded_decoder_pilot_training !== true, "approval_missing_bounded_pilot_flag");
  for (const key of ["allow_formal_decoder_training", "allow_phase_4_scaled_training", "allow_long_term_training", "allow_product_model_training", "allow_release_checkpoint", "allow_weight_commit", "allow_tokenizer_dry_run"]) {
    pushIf(failures, approval?.[key] !== false, "approval_forbidden_flag_not_false", { key, value: approval?.[key] });
  }

  pushIf(failures, config?.run_id !== "r25ao_expanded_chinese_personal_microcycle", "config_run_id_mismatch");
  pushIf(failures, config?.variant_id !== "r25ao_sampler_zh70_mixed20_en10", "config_variant_id_mismatch");
  pushIf(failures, Number(config?.architecture?.layers) !== 1, "config_not_one_layer");
  pushIf(failures, config?.architecture?.basis !== "r25s_baseline_data_first", "config_not_r25s_family");
  for (const key of ["product_model", "release_checkpoint", "formal_product_training", "formal_decoder_training", "long_term_training", "phase_4_scaled_training", "commit_weights_allowed", "tokenizer_dry_run_allowed"]) {
    pushIf(failures, config?.[key] !== false, "config_forbidden_flag_not_false", { key, value: config?.[key] });
  }

  pushIf(failures, r25apTemplate?.approved !== false, "r25ap_template_not_inert");
  for (const key of ["allow_training", "allow_decoder_training", "allow_small_pilot_training", "allow_tokenizer_dry_run", "allow_long_term_training", "allow_product_model_training", "allow_release_checkpoint", "allow_phase_4_scaled_training", "allow_weight_commit"]) {
    pushIf(failures, r25apTemplate?.[key] !== false, "r25ap_template_forbidden_flag_not_false", { key, value: r25apTemplate?.[key] });
  }

  pushIf(failures, dataset?.ok !== true, "dataset_not_ok");
  pushIf(failures, dataset?.train_rows !== 384 || dataset?.dev_rows !== 96 || dataset?.heldout_rows !== 96, "dataset_split_counts_mismatch", {
    train_rows: dataset?.train_rows,
    dev_rows: dataset?.dev_rows,
    heldout_rows: dataset?.heldout_rows
  });
  pushIf(failures, share(dataset?.train_language_counts, "zh") < 0.7, "train_zh_share_below_target");
  pushIf(failures, share(dataset?.train_language_counts, "en") > 0.1, "train_en_share_above_target");
  pushIf(failures, dataset?.split_overlap?.any_overlap !== false, "dataset_split_overlap_detected");
  pushIf(failures, Array.isArray(dataset?.forbidden_sources_touched) && dataset.forbidden_sources_touched.length > 0, "dataset_touched_forbidden_sources", {
    forbidden_sources_touched: dataset?.forbidden_sources_touched
  });

  pushIf(failures, run?.ok !== true, "run_not_ok");
  pushIf(failures, run?.small_pilot_training_ran !== true, "small_pilot_did_not_run_once");
  pushIf(failures, run?.bounded_decoder_pilot_training !== true, "bounded_pilot_flag_missing");
  pushIf(failures, run?.tokenizer_dry_run_ran !== false, "tokenizer_dry_run_ran");
  pushIf(failures, run?.formal_decoder_training !== false || run?.formal_product_training !== false, "formal_training_claimed");
  pushIf(failures, run?.long_term_training !== false || run?.phase_4_scaled_training !== false, "forbidden_training_claimed");
  pushIf(failures, run?.product_model !== false || run?.release_checkpoint !== false, "product_or_release_claimed");
  pushIf(failures, run?.actual_layers !== 1, "run_actual_layers_not_one");
  pushIf(failures, run?.train_loss_decreased !== true, "train_loss_did_not_decrease");
  pushIf(failures, run?.dev_loss_finite !== true, "dev_loss_not_finite");
  pushIf(failures, run?.replayable_checkpoint_written !== true, "checkpoint_not_written");
  pushIf(failures, run?.weights_tracked !== false, "weights_tracked_claimed");

  pushIf(failures, evalReport?.ok !== true, "eval_report_not_ok");
  pushIf(failures, heldout?.ok !== true || heldout?.heldout_loss_finite !== true, "heldout_eval_not_ok");
  pushIf(failures, heldout?.training_ran !== false, "heldout_eval_ran_training");
  pushIf(failures, breakdown?.ok !== true || breakdown?.heldout_loss_finite !== true, "breakdown_not_ok");
  pushIf(failures, breakdown?.tokenizer_dry_run_ran !== false, "breakdown_claims_tokenizer_dryrun");
  pushIf(failures, history?.ok !== true, "history_comparison_not_ok");
  pushIf(failures, history?.training_ran !== false, "history_comparison_ran_training");
  pushIf(failures, !String(history?.recommendation || "").includes("stop_and_review_r25ao"), "history_missing_stop_and_review_recommendation", {
    recommendation: history?.recommendation
  });

  pushIf(failures, r25anTokenizer?.ok !== true, "r25an_tokenizer_report_not_ok");
  pushIf(failures, r25anSampler?.ok !== true, "r25an_sampler_report_not_ok");

  const artifactTracked = await gitOutput(["ls-files", "--", "artifacts/training_os/small_decoder_pilot/r25ao"]).catch((error) => {
    failures.push({ code: "git_ls_files_artifacts_failed", detail: error.message });
    return "";
  });
  pushIf(failures, artifactTracked.length > 0, "r25ao_artifacts_tracked", { files: artifactTracked.split(/\r?\n/).filter(Boolean) });

  const corpusStatus = await gitOutput(["status", "--short", "--", "training/llm_corpus"]).catch((error) => {
    failures.push({ code: "git_status_corpus_failed", detail: error.message });
    return "";
  });
  pushIf(failures, corpusStatus.length > 0, "training_corpus_modified_by_r25ao", { status: corpusStatus.split(/\r?\n/).filter(Boolean) });

  const trackedWeights = await gitOutput(["ls-files"]).catch((error) => {
    failures.push({ code: "git_ls_files_failed", detail: error.message });
    return "";
  });
  const modelLike = trackedWeights.split(/\r?\n/).filter((path) => /\.(safetensors|gguf|bin|pt|pth|onnx|mlmodel|mlpackage|ckpt)$/i.test(path));
  pushIf(failures, modelLike.length > 0, "tracked_model_like_files_present", { files: modelLike });

  const report = {
    ok: failures.length === 0,
    gate: "check:r25ao-expanded-chinese-microcycle-history",
    history_only: true,
    run_id: run?.run_id || config?.run_id,
    variant_id: run?.variant_id || config?.variant_id,
    approval_consumed: approval?.consumed === true,
    small_pilot_training_ran_once: run?.small_pilot_training_ran === true,
    tokenizer_dry_run_ran: false,
    formal_decoder_training: false,
    product_training: false,
    phase_4_scaled_training: false,
    release_checkpoint: false,
    train_rows: dataset?.train_rows,
    dev_rows: dataset?.dev_rows,
    heldout_rows: dataset?.heldout_rows,
    language_mix: dataset?.actual_train_language_mix || run?.actual_language_mix,
    heldout_loss: heldout?.heldout_loss,
    heldout_loss_finite: heldout?.heldout_loss_finite === true,
    recommendation: history?.recommendation,
    r25ap_template_status: r25apTemplate?.approved === false ? "inert_template_approved_false" : "needs_review",
    artifacts_tracked: artifactTracked ? artifactTracked.split(/\r?\n/).filter(Boolean) : [],
    training_corpus_status: corpusStatus ? corpusStatus.split(/\r?\n/).filter(Boolean) : [],
    failures
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
