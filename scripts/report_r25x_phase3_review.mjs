#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_PATH = "artifacts/training_os/small_decoder_pilot/r25x/r25x_phase3_review_report.json";

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

function chooseRecommendation({ comparison, audit, rowAnalysis, designOk }) {
  if (audit && audit.ok === false) {
    return {
      recommendation: "do_not_continue",
      reasons: ["R25X data-quality audit found hard corpus violations that must be fixed before any future pilot."]
    };
  }
  if (comparison?.data_first_best_so_far === true && comparison?.architecture_ablation_helped === false && designOk) {
    return {
      recommendation: "prepare_r25y_with_fresh_approval",
      reasons: [
        "R25S remains best so far by heldout replay loss.",
        "R25V added depth but worsened dev and heldout loss versus R25S.",
        "The safer next phase_3 question is data regularization, not architecture scaling."
      ]
    };
  }
  if (rowAnalysis?.ok && designOk) {
    return {
      recommendation: "pause_phase3_for_review",
      reasons: ["R25X prepared data regularization materials, but local comparison evidence is incomplete or ambiguous."]
    };
  }
  return {
    recommendation: "pause_phase3_for_review",
    reasons: ["R25X should pause because required review inputs are missing or incomplete."]
  };
}

async function main() {
  const r25wDecision = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25w/r25w_next_step_decision.json");
  const r25vAnalysis = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25w/r25w_r25v_analysis.json");
  const comparison = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25w/r25w_data_vs_architecture_comparison.json");
  const audit = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25x/r25x_data_quality_audit.json");
  const rowAnalysis = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25x/r25x_r25s_best_rows.json");
  const ledger = await readJsonIfPresent("training/from_scratch/phase3_review_ledger.r25x.json");
  const progress = await readJsonIfPresent("artifacts/training_os/from_scratch_training_progress_report.json");
  const r25yConfig = await readJsonIfPresent("training/from_scratch/small_decoder_r25y_data_regularization_config.json");
  const r25yTemplate = await readJsonIfPresent("training/from_scratch/APPROVE_R25Y_DATA_REGULARIZATION_PILOT.template.json");
  const designOk = Boolean(
    r25yConfig?.training_allowed_by_default === false &&
    r25yConfig?.product_model === false &&
    r25yConfig?.phase_4_scaled_training === false &&
    r25yConfig?.architecture?.basis === "r25s_baseline_data_first" &&
    Number(r25yConfig?.architecture?.layers) === 1 &&
    r25yTemplate?.approved === false &&
    r25yTemplate?.allow_small_pilot_training === false &&
    r25yTemplate?.allow_data_regularization_training === false &&
    r25yTemplate?.allow_phase_4_scaled_training === false
  );
  const chosen = chooseRecommendation({ comparison, audit, rowAnalysis, designOk });
  const report = {
    ok: true,
    training_ran: false,
    product_model: false,
    release_checkpoint: false,
    phase_4_scaled_training_approved: false,
    recommendation: chosen.recommendation,
    recommended_variant: "r25y_data_regularized_192",
    current_best_pilot: comparison?.best_pilot || ledger?.current_best_pilot || "unknown",
    data_first_best_so_far: comparison?.data_first_best_so_far ?? null,
    architecture_ablation_helped: comparison?.architecture_ablation_helped ?? null,
    r25w_recommendation: r25wDecision?.recommendation || null,
    r25v_ablation_result: r25vAnalysis?.ablation_result || null,
    data_quality_audit_status: audit?.ok ? "passed_with_soft_warnings_possible" : audit?.ok === false ? "hard_failures" : "not_run",
    best_pilot_rows_status: rowAnalysis?.ok ? "summarized" : rowAnalysis?.skipped ? "skipped" : "not_run",
    r25y_design_status: designOk ? "valid_inert_data_regularization_design" : "needs_review",
    why_data_regularization: [
      "R25S improved dev and heldout metrics by changing sampling balance without increasing architecture depth.",
      "R25V's deeper two-layer same-width ablation improved train loss slightly but worsened dev and heldout loss.",
      "R25X audit and row review focus future work on repeated templates, rejected-answer coverage, weak buckets, and lower learning rate."
    ],
    why_not_architecture_scaling: [
      "The latest architecture ablation did not improve heldout generalization.",
      "Phase_3 evidence still comes from bounded pilot runs and ignored artifacts.",
      "Phase_4 scaled training requires a separate readiness review and explicit reviewer approval."
    ],
    why_phase4_not_approved: [
      "Phase_4 scaled training is outside R25X scope.",
      "Product training progress remains 0%.",
      "No release checkpoint or browser static artifact is admitted."
    ],
    required_before_r25y: [
      "fresh one-shot reviewer approval for r25y_data_regularized_192",
      "approval marker approved:true, consumed:false, and run_id/variant_id matched",
      "R25X data-quality audit reviewed, including soft repetition warnings",
      "R24/R25 gates green before and after any approved future run",
      "ignored artifact and no-tracked-weight guards remain green"
    ],
    must_not_do: [
      "do not run R25Y from the template",
      "do not use heldout rows for training",
      "do not approve phase_4 scaled training",
      "do not commit checkpoints, tokenizer artifacts, or replay reports",
      "do not introduce external models, LoRA, adapters, fine-tuning, backend inference, or external storage"
    ],
    reasons: chosen.reasons,
    risks: [
      "High template repetition may make pilot metrics sensitive to row style rather than general behavior.",
      "Another phase_3 run could overfit without stricter data regularization.",
      "Small-pilot metrics remain planning signals, not product intelligence."
    ],
    product_training_progress_percent: 0,
    formal_training_progress_percent: 0,
    pilot_training_progress_percent: progress?.pilot_training_progress_percent ?? 4,
    training_readiness_percent_estimate: designOk && audit?.ok && rowAnalysis?.ok ? 73 : (progress?.training_readiness_percent_estimate ?? 72),
    browser_product_completion_estimate: 32,
    fresh_approval_required: true,
    notes: [
      "R25X is review and design only.",
      "The report prepares an R25Y design but does not authorize or run it."
    ]
  };
  await writeJson(OUTPUT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
