#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = "artifacts/training_os/small_decoder_pilot/r25ap/r25ap_next_step_decision.json";

async function readJson(path) {
  try {
    return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
  } catch {
    return null;
  }
}

async function writeJson(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const analysis = await readJson("artifacts/training_os/small_decoder_pilot/r25ap/r25ap_r25ao_analysis.json");
  const buckets = await readJson("artifacts/training_os/small_decoder_pilot/r25ap/r25ap_r25ao_language_bucket_regression.json");
  const coverage = await readJson("artifacts/training_os/small_decoder_pilot/r25ap/r25ap_personal_target_source_coverage.json");
  const history = await readJson("artifacts/training_os/small_decoder_pilot/r25ap/r25ap_history_comparison.json")
    || await readJson("artifacts/training_os/small_decoder_pilot/r25ao/r25ao_history_comparison.json");
  const progress = await readJson("artifacts/training_os/from_scratch_training_progress.json");

  const heldoutRegressed = analysis?.interpretation?.heldout_generalization_not_proven === true
    || analysis?.classification === "sampler_success_quality_regressed"
    || analysis?.classification === "train_improved_heldout_regressed";
  const weakBuckets = buckets?.weak_buckets || [];
  const recommendation = heldoutRegressed
    ? "pause_for_review"
    : weakBuckets.length
      ? "adjust_sampler_without_training"
      : "another_bounded_microcycle_later_with_fresh_approval";

  const report = {
    ok: Boolean(analysis?.ok && buckets?.ok && coverage?.ok),
    recommendation,
    phase4_approved: false,
    product_training_progress_percent: 0,
    formal_decoder_training_progress_percent: 0,
    active_training_approval_count: progress?.active_training_approval_count ?? 0,
    best_pilot_by_heldout: analysis?.comparisons?.best_overall_by_heldout || history?.runs?.slice?.().sort((a, b) => Number(a.heldout_loss ?? Infinity) - Number(b.heldout_loss ?? Infinity))[0]?.id || null,
    best_pilot_by_project_direction: "R25AO_sampler_met_project_direction_but_needs_quality_review",
    why_r25ao_did_or_did_not_help: [
      analysis?.sampler?.hit_zh_first_target ? "R25AO met the zh-first sampler target." : "R25AO sampler target needs review.",
      analysis?.losses?.train?.absolute_decrease > 0 ? "Train loss decreased during the bounded pilot." : "Train loss did not show usable decrease.",
      analysis?.losses?.dev?.absolute_decrease > 0 ? "Dev loss decreased during the bounded pilot." : "Dev loss did not show usable decrease.",
      heldoutRegressed ? "Heldout loss remains worse than the best earlier reference, so generalization was not proven." : "Heldout did not regress against available references."
    ],
    language_bucket_risks: weakBuckets.length
      ? weakBuckets.map((bucket) => `${bucket}_heldout_bucket_weaker_than_zh`)
      : ["language_bucket_comparison_needs_continued_review"],
    personal_target_risks: coverage?.high_loss_task_types?.length
      ? coverage.high_loss_task_types.map((task) => `${task}_high_heldout_loss`)
      : ["no_missing_configured_personal_target_coverage_detected"],
    required_before_next_training: [
      "fresh reviewer approval",
      "no tokenizer dry-run unless separately approved",
      "review mixed and en heldout weaknesses",
      "review high-loss task families before any repeat",
      "keep phase_4 blocked"
    ],
    must_not_do: [
      "do not rerun R25AO from consumed approval",
      "do not start phase_4",
      "do not claim product or formal decoder progress",
      "do not commit ignored checkpoints or weights"
    ]
  };

  await writeJson(OUT, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
