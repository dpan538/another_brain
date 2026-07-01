#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_PATH = "artifacts/training_os/small_decoder_pilot/r25w/r25w_next_step_decision.json";

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
  if (!analysis || analysis.skipped || !breakdown || breakdown.skipped || !comparison || comparison.skipped || !ledger) {
    return {
      recommendation: "pause_phase3_for_review",
      reasons: ["R25W cannot justify a next pilot while local ignored analysis artifacts or the decision ledger are missing."]
    };
  }
  if (!analysis.ok || analysis.ablation_result === "invalid" || !comparison.ok) {
    return {
      recommendation: "do_not_continue",
      reasons: ["R25V analysis or data-vs-architecture comparison failed structural checks."]
    };
  }
  if (comparison.architecture_ablation_helped === false && comparison.data_first_best_so_far === true) {
    return {
      recommendation: "pause_phase3_for_review",
      reasons: [
        "R25V did not improve dev or held-out loss over the R25S data-first pilot.",
        "R25S remains the best pilot so far by held-out replay loss.",
        "Review should happen before approving any additional phase_3 training."
      ]
    };
  }
  if (comparison.data_first_best_so_far === true) {
    return {
      recommendation: "return_to_data_first",
      reasons: [
        "Data-first work still appears stronger than architecture expansion.",
        "Any next run would need a narrower reviewer-approved data or regularization question."
      ]
    };
  }
  return {
    recommendation: "design_regularization_only",
    reasons: [
      "The comparison does not support phase_4 or another capacity increase.",
      "If phase_3 continues, the safer design direction is regularization or data refinement only."
    ]
  };
}

async function main() {
  const analysis = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25w/r25w_r25v_analysis.json");
  const breakdown = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25w/r25w_r25v_heldout_breakdown.json");
  const comparison = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25w/r25w_data_vs_architecture_comparison.json");
  const ledger = await readJsonIfPresent("training/from_scratch/phase3_decision_ledger.json");
  const progress = await readJsonIfPresent("artifacts/training_os/from_scratch_training_progress_report.json");
  const chosen = chooseRecommendation(analysis, breakdown, comparison, ledger);

  const report = {
    ok: true,
    recommendation: chosen.recommendation,
    phase4_approved: false,
    recommended_best_pilot: comparison?.best_pilot || ledger?.current_best_pilot || "unknown",
    reasons: chosen.reasons,
    risks: [
      "R25V suggests extra depth can reduce train loss while worsening dev and held-out behavior.",
      "Small-pilot comparisons are not product benchmarks.",
      "Further phase_3 work could overfit the R25L pilot corpus without stricter review."
    ],
    required_before_next_training: [
      "fresh one-shot reviewer approval for a named future run_id",
      "approval marker approved:true, consumed:false, and matched to the requested run_id",
      "no product, long-term, phase_4, release, or weight-commit permission",
      "routine gates proving consumed approvals cannot rerun training",
      "R24/R25 gates green before and after any future run"
    ],
    must_not_do: [
      "do not approve phase_4 scaled training",
      "do not run R25X or any future pilot from an inert template",
      "do not treat R25V or R25S replayable checkpoints as release artifacts",
      "do not commit checkpoints, tokenizer artifacts, replay reports, or model-like binaries",
      "do not add external model, LoRA, adapter, fine-tune, backend inference, or external storage paths"
    ],
    product_training_progress_percent: 0,
    formal_training_progress_percent: 0,
    pilot_training_progress_percent: progress?.pilot_training_progress_percent ?? 4,
    fresh_approval_required: true,
    phase_4_scaled_training_approved: false,
    training_ran: false,
    notes: [
      "R25W is analysis only and does not run training.",
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
