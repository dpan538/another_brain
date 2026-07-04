#!/usr/bin/env node
import { execFile as execFileCallback } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const execFile = promisify(execFileCallback);

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

function failIf(failures, condition, code, detail = {}) {
  if (condition) failures.push({ code, ...detail });
}

async function git(args) {
  const result = await execFile("git", args, { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 });
  return result.stdout.trim();
}

function share(counts = {}, key) {
  const total = Number(counts.total) || Object.values(counts).reduce((sum, value) => sum + (Number(value) || 0), 0);
  return total ? (Number(counts[key]) || 0) / total : 0;
}

async function main() {
  const failures = [];
  const approval = await readJson("training/from_scratch/APPROVE_R25AR_REPAIRED_SAMPLER_MICROCYCLE.json").catch((error) => {
    failures.push({ code: "approval_missing_or_invalid", detail: error.message });
    return null;
  });
  const config = await readJson("training/from_scratch/small_decoder_pilot_run_config.r25ar.json").catch((error) => {
    failures.push({ code: "config_missing_or_invalid", detail: error.message });
    return null;
  });
  const template = await readJson("training/from_scratch/APPROVE_R25AS_ANALYZE_R25AR.template.json").catch((error) => {
    failures.push({ code: "r25as_template_missing_or_invalid", detail: error.message });
    return null;
  });
  const dataset = await readJson("artifacts/training_os/small_decoder_pilot/r25ar/r25ar_dataset_report.json").catch((error) => {
    failures.push({ code: "dataset_report_missing_or_invalid", detail: error.message });
    return null;
  });
  const run = await readJson("artifacts/training_os/small_decoder_pilot/r25ar/r25ar_small_decoder_run_report.json").catch((error) => {
    failures.push({ code: "run_report_missing_or_invalid", detail: error.message });
    return null;
  });
  const evalReport = await readJson("artifacts/training_os/small_decoder_pilot/r25ar/r25ar_small_decoder_eval_report.json").catch((error) => {
    failures.push({ code: "eval_report_missing_or_invalid", detail: error.message });
    return null;
  });
  const heldout = await readJson("artifacts/training_os/small_decoder_pilot/r25ar/r25ar_heldout_eval_report.json").catch((error) => {
    failures.push({ code: "heldout_missing_or_invalid", detail: error.message });
    return null;
  });
  const breakdown = await readJson("artifacts/training_os/small_decoder_pilot/r25ar/r25ar_mixed_repair_breakdown.json").catch((error) => {
    failures.push({ code: "breakdown_missing_or_invalid", detail: error.message });
    return null;
  });
  const history = await readJson("artifacts/training_os/small_decoder_pilot/r25ar/r25ar_history_comparison.json").catch((error) => {
    failures.push({ code: "history_missing_or_invalid", detail: error.message });
    return null;
  });

  failIf(failures, approval?.approved !== true, "approval_not_approved");
  failIf(failures, approval?.consumed !== true, "approval_not_consumed");
  failIf(failures, approval?.allow_additional_runs !== false, "approval_allows_additional_runs");
  for (const key of ["allow_formal_decoder_training", "allow_tokenizer_dry_run", "allow_phase_4_scaled_training", "allow_long_term_training", "allow_product_model_training", "allow_release_checkpoint", "allow_weight_commit"]) {
    failIf(failures, approval?.[key] !== false, "approval_forbidden_flag_not_false", { key, value: approval?.[key] });
  }
  failIf(failures, config?.run_id !== "r25ar_repaired_sampler_microcycle", "config_run_id_mismatch");
  failIf(failures, Number(config?.architecture?.layers) !== 1, "config_not_one_layer");
  failIf(failures, run?.ok !== true || run?.small_pilot_training_ran !== true, "run_report_not_completed");
  failIf(failures, run?.tokenizer_dry_run_ran !== false, "tokenizer_dry_run_claimed");
  failIf(failures, run?.corpus_expansion_ran !== false, "corpus_expansion_claimed");
  failIf(failures, run?.phase_4_scaled_training !== false || run?.product_model !== false || run?.release_checkpoint !== false, "forbidden_product_phase4_claim");
  failIf(failures, dataset?.ok !== true, "dataset_not_ok");
  failIf(failures, dataset?.train_rows !== 384 || dataset?.dev_rows !== 96 || dataset?.heldout_rows !== 96, "dataset_split_mismatch");
  failIf(failures, share(dataset?.train_language_counts, "zh") < 0.65, "train_zh_share_below_repaired_sampler_target");
  failIf(failures, share(dataset?.train_language_counts, "mixed") < 0.24, "train_mixed_share_below_repaired_sampler_target");
  failIf(failures, share(dataset?.train_language_counts, "en") > 0.1, "train_en_share_above_cap");
  failIf(failures, evalReport?.ok !== true, "eval_report_not_ok");
  failIf(failures, heldout?.ok !== true || heldout?.training_ran !== false, "heldout_report_not_history_only");
  failIf(failures, breakdown?.ok !== true || breakdown?.training_ran !== false, "breakdown_report_not_history_only");
  failIf(failures, breakdown?.mixed_gap_improved_vs_r25ao !== false, "unexpected_mixed_gap_improvement_claim");
  failIf(failures, breakdown?.en_gap_improved_vs_r25ao !== false, "unexpected_en_gap_improvement_claim");
  failIf(failures, history?.ok !== true || history?.training_ran !== false, "history_report_not_ok");
  failIf(failures, template?.approved !== false, "r25as_template_not_inert");
  for (const key of ["allow_training", "allow_decoder_training", "allow_small_pilot_training", "allow_tokenizer_dry_run", "allow_corpus_generation", "allow_phase_4_scaled_training", "allow_long_term_training", "allow_product_model_training", "allow_release_checkpoint", "allow_weight_commit"]) {
    failIf(failures, template?.[key] !== false, "r25as_template_forbidden_flag_not_false", { key, value: template?.[key] });
  }
  const trackedArtifacts = await git(["ls-files", "--", "artifacts/training_os/small_decoder_pilot/r25ar"]).catch((error) => {
    failures.push({ code: "git_ls_files_artifacts_failed", detail: error.message });
    return "";
  });
  failIf(failures, trackedArtifacts.length > 0, "r25ar_artifacts_tracked", { files: trackedArtifacts.split(/\r?\n/).filter(Boolean) });
  const report = {
    ok: failures.length === 0,
    gate: "check:r25ar-repaired-sampler-microcycle-history",
    history_only: true,
    run_id: run?.run_id || config?.run_id,
    variant_id: run?.variant_id || config?.variant_id,
    approval_consumed: approval?.consumed === true,
    train_rows: dataset?.train_rows,
    dev_rows: dataset?.dev_rows,
    heldout_rows: dataset?.heldout_rows,
    language_mix: dataset?.actual_train_language_mix || run?.actual_language_mix,
    heldout_loss: heldout?.heldout_loss,
    mixed_gap_improved_vs_r25ao: breakdown?.mixed_gap_improved_vs_r25ao,
    en_gap_improved_vs_r25ao: breakdown?.en_gap_improved_vs_r25ao,
    training_ran_in_history_check: false,
    tokenizer_dry_run_ran: false,
    corpus_expansion_ran: false,
    phase4_approved: false,
    artifacts_tracked: trackedArtifacts ? trackedArtifacts.split(/\r?\n/).filter(Boolean) : [],
    failures
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
