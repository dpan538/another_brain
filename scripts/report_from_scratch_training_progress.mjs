#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);

async function exists(path) {
  try {
    await readFile(resolve(ROOT, path), "utf8");
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfPresent(path) {
  try {
    return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  const required = [
    "docs/R25I_FROM_SCRATCH_LLM_TRAINING_DOCTRINE.md",
    "docs/R25I_TRAINING_PHASE_PLAN.md",
    "training/from_scratch/architectures/browser_decoder_v0.json",
    "training/from_scratch/tokenizer_corpus_manifest.json",
    "training/from_scratch/corpus_mix_v0.json",
    "static_llm/release_decisions/schema.json"
  ];
  const present = [];
  const missing = [];
  for (const path of required) {
    if (await exists(path)) present.push(path);
    else missing.push(path);
  }
  const tokenizerCorpusReport = await readJsonIfPresent("artifacts/training_os/tokenizer_dryrun/r25j_tokenizer_corpus_report.json");
  const tokenizerReport = await readJsonIfPresent("artifacts/training_os/tokenizer_dryrun/r25j_tokenizer_report.json");
  const tokenizerEvalReport = await readJsonIfPresent("artifacts/training_os/tokenizer_dryrun/r25j_tokenizer_eval_report.json");
  const toyPlanReport = await readJsonIfPresent("artifacts/training_os/tiny_decoder_toy/r25j_toy_training_plan_report.json");
  const toySkipReport = await readJsonIfPresent("artifacts/training_os/tiny_decoder_toy/r25j_toy_overfit_skip_report.json");
  const toyDatasetReport = await readJsonIfPresent("artifacts/training_os/tiny_decoder_toy/r25k_toy_dataset_report.json");
  const toyRunReport = await readJsonIfPresent("artifacts/training_os/tiny_decoder_toy/r25k_toy_run_report.json");
  const toyEvalReport = await readJsonIfPresent("artifacts/training_os/tiny_decoder_toy/r25k_toy_eval_report.json");
  const tokenizerDryrunOk = Boolean(tokenizerCorpusReport?.ok && tokenizerReport?.ok && tokenizerEvalReport?.ok);
  const toyPipelineOk = Boolean(toyPlanReport?.ok && toySkipReport?.ok && toySkipReport?.skipped === true);
  const toyOverfitOk = Boolean(
    toyDatasetReport?.ok &&
    toyRunReport?.ok &&
    toyRunReport?.toy_training_ran === true &&
    toyRunReport?.formal_training === false &&
    toyRunReport?.product_model === false &&
    toyRunReport?.loss_decreased === true &&
    toyEvalReport?.ok
  );

  const report = {
    ok: missing.length === 0,
    training_started: false,
    formal_decoder_training_started: false,
    product_model_exists: false,
    formal_training_progress_percent: 0,
    training_readiness_percent_estimate: toyOverfitOk ? 50 : tokenizerDryrunOk && toyPipelineOk ? 45 : 40,
    browser_product_completion_estimate: toyOverfitOk ? 27 : tokenizerDryrunOk && toyPipelineOk ? 26 : 25,
    current_phase: toyOverfitOk ? "phase_2_tiny_overfit_sanity" : tokenizerDryrunOk ? "phase_1_tokenizer_dry_run" : "phase_0_no_training_current",
    tokenizer_dryrun_status: tokenizerDryrunOk ? "passed_local_dryrun" : "not_complete",
    tokenizer_corpus_status: tokenizerCorpusReport?.ok ? {
      train_chars: tokenizerCorpusReport.train_chars,
      dev_chars: tokenizerCorpusReport.dev_chars,
      heldout_chars: tokenizerCorpusReport.heldout_chars
    } : "not_built",
    toy_decoder_pipeline_status: toyPipelineOk ? "planned_and_default_skip_passed" : "not_complete",
    toy_overfit_status: toyOverfitOk ? "passed_toy_only_sanity" : toyRunReport?.toy_training_ran ? "toy_run_needs_review" : "not_run",
    toy_overfit_last_run: toyRunReport?.ok ? "r25k_toy_run_report.json" : null,
    toy_loss_decreased: toyRunReport?.loss_decreased === true,
    toy_artifacts_untracked: toyEvalReport?.ok === true && toyEvalReport?.weights_tracked === false,
    toy_model_type: toyRunReport?.toy_training_ran ? "trainable_bigram_next_token_toy" : null,
    toy_metrics: toyRunReport?.toy_training_ran ? {
      steps: toyRunReport.steps,
      initial_loss: toyRunReport.initial_loss,
      final_loss: toyRunReport.final_loss,
      train_accuracy_proxy: toyRunReport.train_accuracy_proxy
    } : null,
    completed_infrastructure: [
      ...present,
      ...(tokenizerDryrunOk ? ["artifacts/training_os/tokenizer_dryrun/r25j_tokenizer_report.json"] : []),
      ...(toyPipelineOk ? ["artifacts/training_os/tiny_decoder_toy/r25j_toy_overfit_skip_report.json"] : []),
      ...(toyOverfitOk ? ["artifacts/training_os/tiny_decoder_toy/r25k_toy_run_report.json"] : [])
    ],
    missing_before_training: [
      "reviewed large-scale corpus with clean train/dev/heldout split",
      ...(tokenizerDryrunOk ? [] : ["tokenizer dry-run and held-out tokenizer evaluation"]),
      ...(toyOverfitOk ? [] : ["explicit phase_2 approval and passing toy-only overfit sanity"]),
      "training hardware/runtime plan",
      "checkpoint provenance and release-decision validator",
      "R25E/R25H static release admission for a self-trained artifact"
    ],
    risk_register: [
      "overclaiming readiness before formal training begins",
      "accidentally treating external pretrained imports as product selection",
      "letting eval prompts or private data leak into training",
      "exceeding the Pro static profile after quantization",
      "weakening R24 gates to make training appear successful"
    ],
    lessons_learned: [
      "R24 is the safety harness, not the main intelligence layer",
      "R25 static gates are release packaging gates for future self-trained artifacts",
      "dry-run capacity manifests are planning artifacts, not admitted models"
    ],
    avoid_previous_errors: [
      "do not replace the browser LLM goal with SLM or tiny-router paths",
      "do not use LoRA or adapters as the final strategy",
      "do not confuse fixture first-token smoke with real model performance",
      "do not describe candidate admission as external model selection"
    ],
    r25k_boundaries: [
      "toy overfit sanity is not formal decoder training",
      "toy checkpoint is ignored and not a release candidate",
      "formal training progress remains 0%",
      "no product model exists"
    ]
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
