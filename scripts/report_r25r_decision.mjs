#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const OUTPUT_PATH = "artifacts/training_os/small_decoder_pilot/r25r/r25r_decision_report.json";

async function readJsonIfPresent(path) {
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

function chooseRecommendation(analysis, samplingPlan, designCheck) {
  if (designCheck && designCheck.ok !== true) return "pause_for_review";
  if (samplingPlan && samplingPlan.ok !== true) return "pause_for_review";
  if (!analysis || analysis.skipped) return "pause_for_review";
  if (analysis.ok !== true || analysis.classification === "invalid") return "do_not_continue";
  return "prepare_r25s_with_fresh_approval";
}

async function main() {
  const analysis = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25q/r25q_pilot_analysis.json");
  const breakdown = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25q/r25q_heldout_breakdown.json");
  const samplingPlan = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25r/r25s_balanced_dataset_plan.json");
  const progress = await readJsonIfPresent("artifacts/training_os/from_scratch_training_progress_report.json");
  const recommendation = chooseRecommendation(analysis, samplingPlan, null);

  const weakBuckets = {
    languages_above_en: ["zh", "mixed"],
    task_types: ["release_packaging_boundary", "toy_training_boundary", "verify_draft"],
    families: ["from_scratch_training_direction"],
    r25q_heldout_loss: analysis?.heldout_loss ?? null,
    r25q_overfit_risk: analysis?.overfit_risk || null,
    r25q_breakdown_available: Boolean(breakdown?.ok)
  };

  const report = {
    ok: recommendation !== "do_not_continue",
    recommendation,
    recommended_variant: "r25s_data_first_balanced_192",
    why_data_first: [
      "R25Q found a valid R25P pilot signal but classified generalization as uncertain.",
      "The R25P train loss improved much more than dev and held-out loss.",
      "Weak held-out buckets point to coverage and regularization before architecture scale.",
      "Balanced sampling can test whether the gap narrows without increasing model size."
    ],
    why_not_scale_architecture: [
      "Phase_4 scaled training is not approved.",
      "R25P overfit risk is moderate, so bigger capacity could amplify memorization.",
      "R25S should isolate data balance and lower learning rate before changing architecture.",
      "No release checkpoint or product browser artifact is authorized."
    ],
    required_before_r25s: [
      "fresh one-shot reviewer approval with approved:true",
      "approval marker run_id and variant_id exactly r25s_data_first_balanced_192",
      "allow_small_pilot_training:true in the copied approval marker only",
      "allow_long_term_training:false",
      "allow_product_model_training:false",
      "allow_release_checkpoint:false",
      "allow_weight_commit:false",
      "R24/R25 gates green before and after the run"
    ],
    must_not_do: [
      "do not run R25S from this R25R patch",
      "do not rerun R25P, R25M, or toy training",
      "do not start phase_4 scaled training",
      "do not use heldout rows for training",
      "do not commit checkpoints, tokenizer artifacts, replay reports, or weights",
      "do not add external APIs, remote downloads, backend inference, or external storage"
    ],
    weak_buckets: weakBuckets,
    sampling_plan_summary: samplingPlan?.ok ? {
      train_row_count: samplingPlan.train_row_count,
      dev_row_count: samplingPlan.dev_row_count,
      heldout_row_count: samplingPlan.heldout_row_count,
      language_counts: samplingPlan.language_counts,
      task_type_counts: samplingPlan.task_type_counts,
      family_counts: samplingPlan.family_counts,
      overlap: samplingPlan.overlap
    } : null,
    product_training_progress_percent: 0,
    formal_training_progress_percent: 0,
    pilot_training_progress_percent: progress?.pilot_training_progress_percent ?? 2,
    phase_4_scaled_training_approved: false,
    fresh_approval_required: true,
    notes: [
      "R25R is decision and design only; it does not run training.",
      "The recommendation is reviewer-facing and does not authorize R25S automatically."
    ]
  };
  await writeJson(OUTPUT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
