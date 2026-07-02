#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_PATH = "artifacts/training_os/small_decoder_pilot/r25ad/r25ad_r25ac_analysis.json";
const R25AC_RUN_ID = "r25ac_chinese_personal_microcycle_256";

const PILOT_REPORTS = [
  {
    id: "R25P",
    run: "artifacts/training_os/small_decoder_pilot/r25p/r25p_small_decoder_run_report.json",
    heldout: "artifacts/training_os/small_decoder_pilot/r25p/r25p_heldout_eval_report.json"
  },
  {
    id: "R25S",
    run: "artifacts/training_os/small_decoder_pilot/r25s/r25s_small_decoder_run_report.json",
    heldout: "artifacts/training_os/small_decoder_pilot/r25s/r25s_heldout_eval_report.json"
  },
  {
    id: "R25V",
    run: "artifacts/training_os/small_decoder_pilot/r25v/r25v_small_decoder_run_report.json",
    heldout: "artifacts/training_os/small_decoder_pilot/r25v/r25v_heldout_eval_report.json"
  },
  {
    id: "R25Y",
    run: "artifacts/training_os/small_decoder_pilot/r25y/r25y_small_decoder_run_report.json",
    heldout: "artifacts/training_os/small_decoder_pilot/r25y/r25y_heldout_eval_report.json"
  },
  {
    id: "R25AC",
    run: "artifacts/training_os/small_decoder_pilot/r25ac/r25ac_small_decoder_run_report.json",
    heldout: "artifacts/training_os/small_decoder_pilot/r25ac/r25ac_heldout_eval_report.json"
  }
];

async function exists(path) {
  try {
    await access(resolve(ROOT, path));
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfPresent(path) {
  return (await exists(path)) ? JSON.parse(await readFile(resolve(ROOT, path), "utf8")) : null;
}

async function writeJson(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function lossChange(initial, final) {
  const start = finiteNumber(initial);
  const end = finiteNumber(final);
  if (start == null || end == null) return null;
  return {
    initial: start,
    final: end,
    absolute_decrease: start - end,
    relative_decrease: start === 0 ? null : (start - end) / Math.abs(start)
  };
}

function coverageSummary(coverage = {}) {
  return Object.fromEntries(Object.entries(coverage).map(([target, value]) => [
    target,
    {
      rows: Number(value?.rows || 0),
      fabricated: value?.fabricated === true
    }
  ]));
}

function coverageComplete(coverage = {}) {
  const entries = Object.values(coverage);
  return entries.length > 0 && entries.every((value) => Number(value?.rows || 0) > 0 && value?.fabricated !== true);
}

async function pilotSummary(spec) {
  const run = await readJsonIfPresent(spec.run);
  const heldout = await readJsonIfPresent(spec.heldout);
  return {
    id: spec.id,
    present: Boolean(run || heldout),
    run_ok: run?.ok === true,
    heldout_ok: heldout?.ok === true,
    final_train_loss: finiteNumber(run?.final_train_loss),
    final_dev_loss: finiteNumber(run?.final_dev_loss),
    heldout_loss: finiteNumber(heldout?.heldout_loss),
    steps: finiteNumber(run?.steps),
    train_sequences: finiteNumber(run?.train_sequences),
    dev_sequences: finiteNumber(run?.dev_sequences),
    heldout_sequences: finiteNumber(heldout?.heldout_sequences ?? run?.heldout_sequences_prepared),
    parameter_count: finiteNumber(run?.parameter_count),
    actual_layers: finiteNumber(run?.actual_layers),
    phase_4_scaled_training: run?.phase_4_scaled_training === true || heldout?.phase_4_scaled_training === true,
    product_model: run?.product_model === true || heldout?.product_model === true,
    release_checkpoint: run?.release_checkpoint === true || heldout?.release_checkpoint === true
  };
}

function classify({ r25acRun, r25acHeldout, r25acDataset, r25sPilot }) {
  if (!r25acRun?.ok || !r25acHeldout?.ok) return "r25ac_reports_missing_or_invalid";
  const mix = r25acRun.actual_language_mix || r25acDataset?.actual_train_language_mix || {};
  if (Number(mix.zh || 0) < 0.7 || Number(mix.en || 0) > 0.1) return "language_mix_failed";
  if (!coverageComplete(r25acRun.personal_target_coverage || r25acDataset?.personal_target_coverage || {})) {
    return "language_mix_success_personal_coverage_incomplete";
  }
  const r25acHeldoutLoss = finiteNumber(r25acHeldout.heldout_loss);
  const r25sHeldoutLoss = finiteNumber(r25sPilot?.heldout_loss);
  if (r25acHeldoutLoss == null || r25sHeldoutLoss == null) return "language_mix_success_quality_needs_review";
  if (r25acHeldoutLoss <= r25sHeldoutLoss) return "language_mix_success_quality_non_regressed_vs_r25s";
  return "language_mix_success_quality_regressed_vs_r25s";
}

async function main() {
  const r25acRun = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25ac/r25ac_small_decoder_run_report.json");
  const r25acHeldout = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25ac/r25ac_heldout_eval_report.json");
  const r25acDataset = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25ac/r25ac_dataset_report.json");
  const r25acBreakdown = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25ac/r25ac_chinese_personal_breakdown.json");
  const r25acApproval = await readJsonIfPresent("training/from_scratch/APPROVE_R25AC_CHINESE_PERSONAL_MICROCYCLE.json");
  const r25acConfig = await readJsonIfPresent("training/from_scratch/small_decoder_r25ac_chinese_personal_config.json");
  const pilots = [];
  for (const spec of PILOT_REPORTS) pilots.push(await pilotSummary(spec));
  const r25sPilot = pilots.find((pilot) => pilot.id === "R25S");
  const r25acPilot = pilots.find((pilot) => pilot.id === "R25AC");
  const validHeldoutPilots = pilots.filter((pilot) => pilot.heldout_loss != null);
  const bestByHeldout = validHeldoutPilots
    .slice()
    .sort((a, b) => a.heldout_loss - b.heldout_loss)[0] || null;

  const classification = classify({ r25acRun, r25acHeldout, r25acDataset, r25sPilot });
  const r25acHeldoutLoss = finiteNumber(r25acHeldout?.heldout_loss);
  const r25sHeldoutLoss = finiteNumber(r25sPilot?.heldout_loss);
  const finalTrainLoss = finiteNumber(r25acRun?.final_train_loss);
  const finalDevLoss = finiteNumber(r25acRun?.final_dev_loss);
  const failures = [];

  if (r25acRun?.run_id !== R25AC_RUN_ID) failures.push({ code: "r25ac_run_id_mismatch", actual: r25acRun?.run_id || null });
  if (r25acRun?.small_pilot_training_ran !== true) failures.push({ code: "r25ac_run_report_does_not_show_completed_bounded_run" });
  if (r25acRun?.phase_4_scaled_training !== false) failures.push({ code: "phase4_training_must_be_false" });
  if (r25acRun?.product_model !== false) failures.push({ code: "product_model_must_be_false" });
  if (r25acRun?.release_checkpoint !== false) failures.push({ code: "release_checkpoint_must_be_false" });
  if (r25acApproval?.consumed !== true || r25acApproval?.allow_additional_runs !== false) failures.push({ code: "r25ac_approval_must_be_consumed_and_inert" });
  if (classification === "r25ac_reports_missing_or_invalid" || classification === "language_mix_failed") failures.push({ code: classification });

  const report = {
    ok: failures.length === 0,
    report_id: "r25ad_r25ac_analysis",
    training_ran: false,
    r25ac_rerun: false,
    new_training_ran_in_r25ad: false,
    run_id: r25acRun?.run_id || null,
    variant_id: r25acRun?.variant_id || null,
    r25ac_completed_before_r25ad: r25acRun?.ok === true && r25acHeldout?.ok === true && r25acApproval?.consumed === true,
    approval_consumed: r25acApproval?.consumed === true,
    allow_additional_runs: r25acApproval?.allow_additional_runs === true,
    classification,
    language_mix_success: classification.startsWith("language_mix_success"),
    quality_regressed_vs_r25s: classification === "language_mix_success_quality_regressed_vs_r25s",
    chinese_first_personal_helped_by_loss: classification === "language_mix_success_quality_non_regressed_vs_r25s",
    target_language_mix: r25acConfig?.language_mix_target || r25acDataset?.target_language_mix || null,
    actual_language_mix: r25acRun?.actual_language_mix || r25acDataset?.actual_train_language_mix || null,
    train_language_counts: r25acDataset?.train_language_counts || null,
    dev_language_counts: r25acDataset?.dev_language_counts || null,
    heldout_language_counts: r25acHeldout?.heldout_language_counts || r25acDataset?.heldout_language_counts || null,
    losses: {
      train: lossChange(r25acRun?.initial_train_loss, r25acRun?.final_train_loss),
      dev: lossChange(r25acRun?.initial_dev_loss, r25acRun?.final_dev_loss),
      heldout: r25acHeldoutLoss,
      train_dev_gap: finalDevLoss == null || finalTrainLoss == null ? null : finalDevLoss - finalTrainLoss,
      train_heldout_gap: r25acHeldoutLoss == null || finalTrainLoss == null ? null : r25acHeldoutLoss - finalTrainLoss,
      dev_heldout_difference: r25acHeldoutLoss == null || finalDevLoss == null ? null : r25acHeldoutLoss - finalDevLoss
    },
    heldout_loss_by_language: r25acBreakdown?.by_language || null,
    personal_target_coverage: coverageSummary(r25acRun?.personal_target_coverage || r25acDataset?.personal_target_coverage || {}),
    personal_target_coverage_complete: coverageComplete(r25acRun?.personal_target_coverage || r25acDataset?.personal_target_coverage || {}),
    pilot_comparison: {
      pilots,
      best_by_heldout_loss: bestByHeldout ? { id: bestByHeldout.id, heldout_loss: bestByHeldout.heldout_loss } : null,
      r25s_remains_best_by_loss: bestByHeldout?.id === "R25S",
      r25ac_vs_r25s_heldout_delta: r25acHeldoutLoss == null || r25sHeldoutLoss == null ? null : r25acHeldoutLoss - r25sHeldoutLoss,
      r25ac_vs_r25y_heldout_delta: r25acHeldoutLoss == null ? null : r25acHeldoutLoss - (pilots.find((pilot) => pilot.id === "R25Y")?.heldout_loss ?? NaN),
      r25ac_vs_r25v_heldout_delta: r25acHeldoutLoss == null ? null : r25acHeldoutLoss - (pilots.find((pilot) => pilot.id === "R25V")?.heldout_loss ?? NaN),
      r25ac_vs_r25p_heldout_delta: r25acHeldoutLoss == null ? null : r25acHeldoutLoss - (pilots.find((pilot) => pilot.id === "R25P")?.heldout_loss ?? NaN)
    },
    architecture: {
      type: r25acRun?.architecture_type || r25acConfig?.architecture?.type || null,
      layers: r25acRun?.actual_layers ?? r25acConfig?.architecture?.layers ?? null,
      parameter_count: r25acPilot?.parameter_count ?? null,
      basis_pilot: r25acConfig?.basis_pilot || null,
      two_layer_r25v_architecture_used: Number(r25acRun?.actual_layers || 0) === 2
    },
    recommendation: classification === "language_mix_success_quality_regressed_vs_r25s"
      ? "expand_chinese_personal_corpus_before_any_followup_microcycle"
      : "pause_for_review_before_any_followup_microcycle",
    phase_4_scaled_training_approved: false,
    product_model: false,
    release_checkpoint: false,
    failures,
    notes: [
      "R25AD analyzes existing ignored R25AC artifacts and does not train.",
      "R25AC met the Chinese-first sampling target but did not beat R25S held-out loss.",
      "A stronger Chinese-personal corpus should be reviewed before another micro-cycle; phase_4 remains blocked."
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
