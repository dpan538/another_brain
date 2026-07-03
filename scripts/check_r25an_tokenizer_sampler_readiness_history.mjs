#!/usr/bin/env node
import { execFile as execFileCallback } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const ROOT = resolve(new URL("..", import.meta.url).pathname);

const paths = {
  approval: "training/from_scratch/APPROVE_R25AN_POST_R25AM_TOKENIZER_REVIEW.json",
  corpusQuality: "artifacts/training_os/corpus_review/r25an/r25an_expanded_corpus_quality.json",
  sampler: "artifacts/training_os/corpus_review/r25an/r25an_chinese_sampler_feasibility.json",
  tokenizerEval: "artifacts/training_os/tokenizer_dryrun/r25an/r25j_tokenizer_eval_report.json",
  tokenizerReport: "artifacts/training_os/tokenizer_dryrun/r25an/r25j_tokenizer_report.json",
  tokenizerReadiness: "artifacts/training_os/tokenizer_dryrun/r25an/r25an_tokenizer_readiness_report.json",
  nextStep: "artifacts/training_os/corpus_review/r25an/r25an_next_step_decision.json"
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
  const corpusQuality = await readJson(paths.corpusQuality).catch((error) => {
    failures.push({ code: "corpus_quality_report_missing_or_invalid", detail: error.message });
    return null;
  });
  const sampler = await readJson(paths.sampler).catch((error) => {
    failures.push({ code: "sampler_report_missing_or_invalid", detail: error.message });
    return null;
  });
  const tokenizerEval = await readJson(paths.tokenizerEval).catch((error) => {
    failures.push({ code: "tokenizer_eval_report_missing_or_invalid", detail: error.message });
    return null;
  });
  const tokenizerReport = await readJson(paths.tokenizerReport).catch((error) => {
    failures.push({ code: "tokenizer_report_missing_or_invalid", detail: error.message });
    return null;
  });
  const tokenizerReadiness = await readJson(paths.tokenizerReadiness).catch((error) => {
    failures.push({ code: "tokenizer_readiness_report_missing_or_invalid", detail: error.message });
    return null;
  });
  const nextStep = await readJson(paths.nextStep).catch((error) => {
    failures.push({ code: "next_step_report_missing_or_invalid", detail: error.message });
    return null;
  });

  pushIf(failures, approval?.approved !== true, "approval_not_marked_approved");
  pushIf(failures, approval?.consumed !== true, "approval_not_consumed");
  pushIf(failures, approval?.allow_additional_runs !== false, "approval_allows_additional_runs");
  for (const key of ["allow_decoder_training", "allow_small_pilot_training", "allow_phase_4_scaled_training", "allow_product_model_training", "allow_weight_commit"]) {
    pushIf(failures, approval?.[key] !== false, "approval_forbidden_flag_not_false", { key, value: approval?.[key] });
  }

  pushIf(failures, corpusQuality?.ok !== true, "corpus_quality_not_ok");
  pushIf(failures, corpusQuality?.total_rows !== 4160, "corpus_row_count_unexpected", { total_rows: corpusQuality?.total_rows });
  pushIf(failures, corpusQuality?.duplicate_target_answer_count !== 0, "duplicate_target_answers_present");
  pushIf(failures, corpusQuality?.normalized_duplicate_target_answer_count !== 0, "normalized_duplicate_target_answers_present");
  for (const key of ["decoder_training_ran", "small_pilot_training_ran", "phase4_scaled_training_ran", "private_sources_read", "root_pdf_docx_parsed", "data_public_ingestion_parsed", "evals_used_as_training_data", "weights_committed"]) {
    pushIf(failures, corpusQuality?.safety?.[key] !== false, "corpus_quality_safety_flag_not_false", { key, value: corpusQuality?.safety?.[key] });
  }

  pushIf(failures, sampler?.ok !== true, "sampler_not_ok");
  pushIf(failures, sampler?.sampler_target?.zh_min < 0.7, "sampler_zh_target_too_low");
  pushIf(failures, sampler?.sampler_target?.en_max > 0.1, "sampler_en_target_too_high");
  pushIf(failures, sampler?.recommendation !== "sampler_ready_for_bounded_microcycle", "sampler_recommendation_unexpected", {
    recommendation: sampler?.recommendation
  });
  for (const key of ["decoder_training_ran", "small_pilot_training_ran", "phase4_scaled_training_ran", "training_dataset_written", "private_sources_read", "root_pdf_docx_parsed", "data_public_ingestion_parsed"]) {
    pushIf(failures, sampler?.safety?.[key] !== false, "sampler_safety_flag_not_false", { key, value: sampler?.safety?.[key] });
  }

  pushIf(failures, tokenizerReport?.ok !== true, "tokenizer_report_not_ok");
  pushIf(failures, tokenizerReport?.production_tokenizer !== false, "tokenizer_report_claims_production");
  pushIf(failures, tokenizerReport?.formal_decoder_training !== false, "tokenizer_report_claims_formal_training");
  pushIf(failures, tokenizerReport?.vocab_size !== 4096, "tokenizer_report_vocab_unexpected", { vocab_size: tokenizerReport?.vocab_size });
  pushIf(failures, !tokenizerReport?.tokenizer_sha256, "tokenizer_report_missing_sha");

  pushIf(failures, tokenizerEval?.ok !== true, "tokenizer_eval_not_ok");
  pushIf(failures, tokenizerEval?.unknown_rate !== 0, "tokenizer_unknown_rate_nonzero", { unknown_rate: tokenizerEval?.unknown_rate });
  pushIf(failures, tokenizerEval?.special_token_roundtrip !== true, "tokenizer_special_roundtrip_failed");

  pushIf(failures, tokenizerReadiness?.ok !== true, "tokenizer_readiness_not_ok");
  pushIf(failures, tokenizerReadiness?.tokenizer_id !== "r25an_r25am_expanded_corpus_tokenizer_dryrun", "tokenizer_readiness_id_unexpected", {
    tokenizer_id: tokenizerReadiness?.tokenizer_id
  });
  pushIf(failures, tokenizerReadiness?.sampler_readiness_status !== "sampler_ready_for_bounded_microcycle", "tokenizer_readiness_sampler_status_unexpected", {
    sampler_readiness_status: tokenizerReadiness?.sampler_readiness_status
  });
  for (const key of ["decoder_training_ran", "small_pilot_training_ran", "phase4_scaled_training_ran", "production_tokenizer", "tokenizer_artifacts_committed", "weights_committed", "external_api_used"]) {
    pushIf(failures, tokenizerReadiness?.safety?.[key] !== false, "tokenizer_readiness_safety_flag_not_false", { key, value: tokenizerReadiness?.safety?.[key] });
  }

  pushIf(failures, nextStep?.ok !== true, "next_step_not_ok");
  pushIf(failures, nextStep?.decoder_training_approved !== false, "next_step_claims_decoder_training_approved");
  pushIf(failures, nextStep?.phase4_approved !== false, "next_step_claims_phase4_approved");
  pushIf(failures, nextStep?.active_training_approval_count !== 0, "next_step_active_training_approval_nonzero", {
    active_training_approval_count: nextStep?.active_training_approval_count
  });
  pushIf(failures, nextStep?.active_tokenizer_dry_run_approval_count !== 0, "next_step_active_tokenizer_approval_nonzero", {
    active_tokenizer_dry_run_approval_count: nextStep?.active_tokenizer_dry_run_approval_count
  });
  pushIf(failures, nextStep?.active_phase4_training_approval_count !== 0, "next_step_active_phase4_approval_nonzero", {
    active_phase4_training_approval_count: nextStep?.active_phase4_training_approval_count
  });

  const trackedTokenizerArtifacts = await gitOutput(["ls-files", "--", "artifacts/training_os/tokenizer_dryrun/r25an"]).catch((error) => {
    failures.push({ code: "git_ls_files_tokenizer_failed", detail: error.message });
    return "";
  });
  pushIf(failures, trackedTokenizerArtifacts.length > 0, "tokenizer_artifacts_tracked", {
    files: trackedTokenizerArtifacts.split(/\r?\n/).filter(Boolean)
  });

  const report = {
    ok: failures.length === 0,
    gate: "check:r25an-tokenizer-sampler-readiness-history",
    history_only: true,
    recursive_gate_replay: false,
    approval_consumed: approval?.consumed === true,
    corpus_rows: corpusQuality?.total_rows,
    sampler_recommendation: sampler?.recommendation,
    tokenizer_id: tokenizerReadiness?.tokenizer_id,
    tokenizer_vocab_size: tokenizerReadiness?.vocab_size,
    tokenizer_unknown_rate: tokenizerEval?.unknown_rate,
    tokenizer_artifacts_tracked: trackedTokenizerArtifacts ? trackedTokenizerArtifacts.split(/\r?\n/).filter(Boolean) : [],
    decoder_training_ran: false,
    tokenizer_dry_run_reran: false,
    small_pilot_training_ran: false,
    phase_4_scaled_training_ran: false,
    failures
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
