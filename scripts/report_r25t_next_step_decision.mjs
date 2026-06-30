#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const OUTPUT_PATH = "artifacts/training_os/small_decoder_pilot/r25t/r25t_next_step_decision.json";

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

function chooseRecommendation(analysis, breakdown, comparison) {
  if (!analysis || analysis.skipped || !breakdown || breakdown.skipped || !comparison || comparison.skipped) {
    return {
      recommendation: "pause_for_review",
      recommended_next_phase: "r25u_design_only_if_artifacts_are_reviewed",
      reasons: ["R25S ignored artifacts were unavailable or incomplete, so R25T cannot justify another design step."]
    };
  }
  if (!analysis.ok || analysis.classification === "invalid" || !comparison.ok) {
    return {
      recommendation: "do_not_continue",
      recommended_next_phase: "pause_until_structural_failures_are_fixed",
      reasons: ["R25S analysis or R25P/R25S comparison failed structural checks."]
    };
  }
  if (comparison.data_first_helped === true && comparison.overfit_risk_change === "improved") {
    return {
      recommendation: "architecture_ablation_design",
      recommended_next_phase: "R25U architecture ablation design only; training requires fresh approval",
      reasons: [
        "R25S improved dev and heldout losses relative to R25P while reducing train-to-eval gaps.",
        "The data-first pass appears to reduce overfit risk, so the next useful work is controlled ablation design rather than immediate scaling."
      ]
    };
  }
  if (comparison.data_first_helped === true) {
    return {
      recommendation: "another_data_first_pass",
      recommended_next_phase: "R25U data-first design only; training requires fresh approval",
      reasons: [
        "R25S improved some generalization metrics but did not cleanly resolve risk.",
        "A future data-first pass could be designed, but cannot run without reviewer approval."
      ]
    };
  }
  return {
    recommendation: "pause_for_review",
    recommended_next_phase: "manual_review_before_any_r25u",
    reasons: ["R25S did not clearly improve enough generalization signals to justify another automatic design step."]
  };
}

async function main() {
  const r25pAnalysis = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25q/r25q_pilot_analysis.json");
  const r25qBreakdown = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25q/r25q_heldout_breakdown.json");
  const r25sAnalysis = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25t/r25t_r25s_analysis.json");
  const r25sBreakdown = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25t/r25t_r25s_heldout_breakdown.json");
  const comparison = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25t/r25t_r25p_r25s_generalization.json");
  const progress = await readJsonIfPresent("artifacts/training_os/from_scratch_training_progress_report.json");
  const chosen = chooseRecommendation(r25sAnalysis, r25sBreakdown, comparison);

  const report = {
    ok: true,
    recommendation: chosen.recommendation,
    recommended_next_phase: chosen.recommended_next_phase,
    reasons: chosen.reasons,
    r25p_context: r25pAnalysis ? {
      classification: r25pAnalysis.classification,
      overfit_risk: r25pAnalysis.overfit_risk,
      heldout_loss: r25pAnalysis.heldout_loss
    } : null,
    r25s_context: r25sAnalysis ? {
      classification: r25sAnalysis.classification,
      overfit_risk: r25sAnalysis.overfit_risk,
      heldout_loss: r25sAnalysis.heldout_loss,
      data_first_helped: r25sAnalysis.data_first_helped
    } : null,
    weak_bucket_summary_available: Boolean(r25qBreakdown?.ok && r25sBreakdown?.ok),
    data_first_helped: comparison?.data_first_helped === true,
    risks: [
      "R25S remains a bounded phase_3 small pilot; product capability is not established.",
      "Architecture ablation can clarify whether model form matters after data balancing, but phase_4 scaling is not approved.",
      "Further pilots may overfit the small R25L corpus unless approval, data boundaries, and heldout replay gates remain strict."
    ],
    required_before_next_training: [
      "fresh one-shot reviewer approval for a named R25U or later run_id",
      "approval marker with approved:true, consumed:false, and no product, long-term, phase_4, release, or weight-commit permission",
      "routine gates proving consumed R25S approval cannot rerun training",
      "R24/R25 gates green before and after any future run",
      "ignored artifact path and replayable checkpoint schema reviewed"
    ],
    must_not_do: [
      "do not start phase_4 scaled training",
      "do not run architecture ablation from the inert template",
      "do not treat R25S or future replayable checkpoints as release artifacts",
      "do not commit checkpoints, tokenizer artifacts, generated replay reports, or model-like binaries",
      "do not add external model, LoRA, adapter, fine-tune, backend inference, or external storage paths"
    ],
    product_training_progress_percent: 0,
    formal_training_progress_percent: 0,
    pilot_training_progress_percent: progress?.pilot_training_progress_percent ?? 3,
    fresh_approval_required: true,
    phase_4_scaled_training_approved: false,
    training_ran: false,
    notes: [
      "R25T is analysis only and does not run training.",
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
