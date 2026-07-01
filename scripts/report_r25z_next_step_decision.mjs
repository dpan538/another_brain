#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_PATH = "artifacts/training_os/small_decoder_pilot/r25z/r25z_next_step_decision.json";

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

function chooseRecommendation(analysis, breakdown, comparison, ledger) {
  if (!analysis || analysis.skipped || !breakdown || breakdown.skipped || !comparison || !ledger) {
    return {
      recommendation: "pause_phase3_for_review",
      reasons: ["R25Z cannot justify a new step while local ignored analysis artifacts or the decision ledger are missing."]
    };
  }
  if (!analysis.ok || analysis.regularization_result === "invalid" || !comparison.ok) {
    return {
      recommendation: "do_not_continue",
      reasons: ["R25Y analysis or data-regularization comparison failed structural checks."]
    };
  }
  if (comparison.r25y_helped_vs_r25s === false && comparison.best_pilot === "r25s_data_first_balanced_192") {
    return {
      recommendation: "pause_phase3_for_review",
      reasons: [
        "R25Y improved over R25P and R25V but did not beat R25S.",
        "R25S remains best-so-far by held-out replay loss.",
        "Phase_3 should pause for review before any additional pilot."
      ]
    };
  }
  if (comparison.r25y_helped_vs_r25s === true) {
    return {
      recommendation: "begin_phase4_readiness_review_no_training",
      reasons: [
        "R25Y did not regress against R25S by dev and held-out replay metrics.",
        "The only allowed next phase is a readiness review without training."
      ]
    };
  }
  return {
    recommendation: "repeat_data_regularization_with_fresh_approval",
    reasons: [
      "The comparison is inconclusive but does not support architecture scaling.",
      "A narrower data-only question would require fresh reviewer approval."
    ]
  };
}

async function main() {
  const analysis = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25z/r25z_r25y_analysis.json");
  const breakdown = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25z/r25z_r25y_heldout_breakdown.json");
  const comparison = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25z/r25z_data_regularization_comparison.json");
  const ledger = await readJsonIfPresent("training/from_scratch/phase3_decision_ledger.r25z.json");
  const progress = await readJsonIfPresent("artifacts/training_os/from_scratch_training_progress_report.json");
  const phase3ExitCriteria = await readJsonIfPresent("training/from_scratch/phase3_exit_criteria.json");
  const chosen = chooseRecommendation(analysis, breakdown, comparison, ledger);

  const report = {
    ok: true,
    recommendation: chosen.recommendation,
    phase4_approved: false,
    recommended_best_pilot: comparison?.best_pilot || ledger?.current_best_pilot || "unknown",
    reasons: chosen.reasons,
    risks: [
      "R25Y did not improve on R25S, so repeated pilots may chase noise in the same corpus.",
      "Replayable checkpoints remain ignored phase_3 artifacts, not release checkpoints.",
      "Phase_4 readiness review is not phase_4 training."
    ],
    required_before_next_training: [
      "fresh one-shot reviewer approval for a named future run_id",
      "approval marker approved:true, consumed:false, and matched to the requested run_id",
      "no product, long-term, phase_4, release, or weight-commit permission",
      "routine gates proving consumed approvals cannot rerun training",
      "R24/R25 gates green before and after any future run"
    ],
    must_not_do: [
      "do not approve phase_4 scaled training from R25Z",
      "do not run R25AA or any future pilot from an inert template",
      "do not treat R25Y or R25S replayable checkpoints as release artifacts",
      "do not commit checkpoints, tokenizer artifacts, replay reports, or model-like binaries",
      "do not add external model, LoRA, adapter, fine-tune, backend inference, or external storage paths"
    ],
    product_training_progress_percent: 0,
    formal_training_progress_percent: 0,
    pilot_training_progress_percent: progress?.pilot_training_progress_percent ?? 5,
    phase3_exit_criteria_reviewed: phase3ExitCriteria?.phase4_approved === false,
    fresh_approval_required: true,
    phase_4_scaled_training_approved: false,
    training_ran: false,
    notes: [
      "R25Z is analysis only and does not run training.",
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
