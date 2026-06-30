#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const OUTPUT_PATH = "artifacts/training_os/small_decoder_pilot/r25q/r25q_next_step_decision.json";

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

function chooseRecommendation(analysis, determinism, breakdown, comparison) {
  if (!analysis || analysis.skipped) {
    return {
      recommendation: "pause_for_review",
      recommended_next_variant: null,
      reasons: ["R25P ignored artifacts were not available locally, so R25Q cannot validate the pilot signal."]
    };
  }
  if (!analysis.ok || analysis.classification === "invalid") {
    return {
      recommendation: "do_not_continue",
      recommended_next_variant: null,
      reasons: ["R25P analysis is invalid or structurally failed."]
    };
  }
  if (!determinism?.ok || determinism.nondeterministic === true) {
    return {
      recommendation: "pause_for_review",
      recommended_next_variant: null,
      reasons: ["R25P replay determinism has not passed, so another pilot should wait."]
    };
  }
  if (!breakdown?.ok) {
    return {
      recommendation: "pause_for_review",
      recommended_next_variant: null,
      reasons: ["R25P held-out breakdown is unavailable or failed."]
    };
  }
  if (analysis.overfit_risk === "high") {
    return {
      recommendation: "pause_for_review",
      recommended_next_variant: "data_first_second_stage",
      reasons: ["R25P shows a large train-to-heldout gap; review data coverage and regularization before another run."]
    };
  }
  if (analysis.overfit_risk === "moderate" || analysis.classification === "generalization_uncertain") {
    return {
      recommendation: "consider_r25r_with_fresh_approval",
      recommended_next_variant: "data_first_second_stage",
      reasons: [
        "R25P produced a valid replayable pilot signal with finite held-out loss.",
        "The train-to-dev and train-to-heldout gaps make generalization uncertain, so the next pilot should be data or regularization first."
      ]
    };
  }
  return {
    recommendation: "consider_r25r_with_fresh_approval",
    recommended_next_variant: comparison?.recommendation_category || "data_first_second_stage",
    reasons: ["R25P structural analysis passed, but any next pilot still needs reviewer approval."]
  };
}

async function main() {
  const analysis = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25q/r25q_pilot_analysis.json");
  const determinism = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25q/r25q_replay_determinism_report.json");
  const breakdown = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25q/r25q_heldout_breakdown.json");
  const comparison = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25q/r25q_history_comparison.json");
  const progress = await readJsonIfPresent("artifacts/training_os/from_scratch_training_progress_report.json");
  const chosen = chooseRecommendation(analysis, determinism, breakdown, comparison);

  const report = {
    ok: true,
    recommendation: chosen.recommendation,
    recommended_next_variant: chosen.recommended_next_variant,
    reasons: chosen.reasons,
    risks: [
      "R25P train loss improved much more than dev or held-out loss, so overfit risk must be reviewed.",
      "R25P is a small pilot mechanics signal, not product capability.",
      "Phase_4 scaled training is not approved."
    ],
    required_before_next_training: [
      "fresh one-shot reviewer approval for R25R with approved:true",
      "selected run_id and variant_id matching the approval marker",
      "no product-training, long-term-training, release-checkpoint, external API, or weight-commit permission",
      "R24/R25 gates green before and after the run",
      "ignored artifact path and replayable checkpoint schema reviewed"
    ],
    must_not_do: [
      "do not start phase_4 scaled training",
      "do not rerun R25P with the consumed approval",
      "do not treat the replayable checkpoint as a release artifact",
      "do not commit checkpoints, tokenizer artifacts, generated replay reports, or model-like binaries",
      "do not add external model, LoRA, adapter, fine-tune, backend inference, or external storage paths"
    ],
    product_training_progress_percent: 0,
    formal_training_progress_percent: 0,
    pilot_training_progress_percent: progress?.pilot_training_progress_percent ?? 2,
    fresh_approval_required: true,
    phase_4_scaled_training_approved: false,
    notes: [
      "R25Q is analysis only and does not run training.",
      "The recommendation is reviewer-facing; it is not automatic authorization."
    ]
  };

  await writeJson(OUTPUT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
