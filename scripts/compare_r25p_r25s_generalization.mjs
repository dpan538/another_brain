#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_PATH = "artifacts/training_os/small_decoder_pilot/r25t/r25t_r25p_r25s_generalization.json";

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

function finite(value) {
  return Number.isFinite(Number(value));
}

function lossChange(initial, final) {
  const start = Number(initial);
  const end = Number(final);
  if (!finite(start) || !finite(end)) return null;
  return {
    initial: start,
    final: end,
    absolute_decrease: start - end,
    relative_decrease: start === 0 ? null : (start - end) / Math.abs(start)
  };
}

function metricSnapshot(run, heldout, analysis) {
  if (!run) return null;
  const finalTrain = Number(run.final_train_loss);
  const finalDev = Number(run.final_dev_loss);
  const heldoutLoss = Number(heldout?.heldout_loss);
  return {
    run_id: run.run_id,
    variant_id: run.variant_id,
    backend: run.backend,
    architecture_type: run.architecture_type,
    parameter_count: run.parameter_count,
    train_sequences: run.train_sequences,
    dev_sequences: run.dev_sequences,
    heldout_sequences: heldout?.heldout_sequences ?? run.heldout_sequences_prepared ?? null,
    steps: run.steps,
    train_loss: lossChange(run.initial_train_loss, run.final_train_loss),
    dev_loss: lossChange(run.initial_dev_loss, run.final_dev_loss),
    heldout_loss: finite(heldoutLoss) ? heldoutLoss : null,
    train_dev_gap: finite(finalTrain) && finite(finalDev) ? finalDev - finalTrain : null,
    train_heldout_gap: finite(finalTrain) && finite(heldoutLoss) ? heldoutLoss - finalTrain : null,
    dev_heldout_difference: finite(finalDev) && finite(heldoutLoss) ? heldoutLoss - finalDev : null,
    overfit_risk: analysis?.overfit_risk || null,
    classification: analysis?.classification || null,
    product_model: false,
    release_checkpoint: false
  };
}

function delta(current, previous) {
  if (!finite(current) || !finite(previous)) return null;
  return current - previous;
}

function bucketLoss(report, section, key) {
  const value = report?.[section]?.[key]?.average_next_token_loss;
  return finite(value) ? Number(value) : null;
}

function bucketSequenceCount(report, section, key) {
  const value = report?.[section]?.[key]?.sequence_count;
  return finite(value) ? Number(value) : null;
}

function compareBucket(r25pBreakdown, r25sBreakdown, section, key) {
  const p = bucketLoss(r25pBreakdown, section, key);
  const s = bucketLoss(r25sBreakdown, section, key);
  return {
    r25p_loss: p,
    r25s_loss: s,
    delta: delta(s, p),
    improved: finite(p) && finite(s) ? s <= p : null,
    r25p_sequence_count: bucketSequenceCount(r25pBreakdown, section, key),
    r25s_sequence_count: bucketSequenceCount(r25sBreakdown, section, key)
  };
}

function weakBucketDeltas(r25pBreakdown, r25sBreakdown) {
  return {
    "language:zh": compareBucket(r25pBreakdown, r25sBreakdown, "by_language", "zh"),
    "language:mixed": compareBucket(r25pBreakdown, r25sBreakdown, "by_language", "mixed"),
    "task_type:release_packaging_boundary": compareBucket(r25pBreakdown, r25sBreakdown, "by_task_type", "release_packaging_boundary"),
    "task_type:toy_training_boundary": compareBucket(r25pBreakdown, r25sBreakdown, "by_task_type", "toy_training_boundary"),
    "task_type:verify_draft": compareBucket(r25pBreakdown, r25sBreakdown, "by_task_type", "verify_draft"),
    "task_family:from_scratch_training_direction": compareBucket(r25pBreakdown, r25sBreakdown, "by_task_family", "from_scratch_training_direction")
  };
}

function riskRank(risk) {
  return { low: 1, moderate: 2, high: 3, invalid: 4 }[risk] || 0;
}

function chooseRecommendation({ ok, dataFirstHelped, overfitRiskChange, weakBucketDeltas }) {
  if (!ok) return "pause_for_review";
  const comparableBuckets = Object.values(weakBucketDeltas).filter((item) => item?.improved !== null);
  const improvedBuckets = comparableBuckets.filter((item) => item.improved === true).length;
  if (!dataFirstHelped) return "pause_for_review";
  if (improvedBuckets >= Math.ceil(comparableBuckets.length / 2) && overfitRiskChange === "improved") {
    return "architecture_ablation_design";
  }
  if (improvedBuckets > 0) return "another_data_first_pass";
  return "pause_for_review";
}

async function main() {
  const r25pRun = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25p/r25p_small_decoder_run_report.json");
  const r25pHeldout = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25p/r25p_heldout_eval_report.json");
  const r25pAnalysis = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25q/r25q_pilot_analysis.json");
  const r25pBreakdown = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25q/r25q_heldout_breakdown.json");
  const r25sRun = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25s/r25s_small_decoder_run_report.json");
  const r25sHeldout = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25s/r25s_heldout_eval_report.json");
  const r25sAnalysis = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25t/r25t_r25s_analysis.json");
  const r25sBreakdown = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25t/r25t_r25s_heldout_breakdown.json");

  const missing = [];
  for (const [label, value] of Object.entries({ r25pRun, r25pHeldout, r25pAnalysis, r25pBreakdown, r25sRun, r25sHeldout, r25sAnalysis, r25sBreakdown })) {
    if (!value) missing.push(label);
  }
  if (missing.length) {
    const report = {
      ok: true,
      skipped: true,
      reason: "ignored_artifacts_missing",
      missing,
      training_ran: false,
      product_model: false,
      release_checkpoint: false,
      phase_4_scaled_training: false,
      recommendation: "pause_for_review",
      reasons: ["R25T cannot compare missing ignored artifacts and does not recreate them."]
    };
    await writeJson(OUTPUT_PATH, report);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const r25p = metricSnapshot(r25pRun, r25pHeldout, r25pAnalysis);
  const r25s = metricSnapshot(r25sRun, r25sHeldout, r25sAnalysis);
  const weakDeltas = weakBucketDeltas(r25pBreakdown, r25sBreakdown);
  const deltaReport = {
    train_sequences_delta: Number(r25s.train_sequences) - Number(r25p.train_sequences),
    dev_sequences_delta: Number(r25s.dev_sequences) - Number(r25p.dev_sequences),
    heldout_sequences_delta: Number(r25s.heldout_sequences) - Number(r25p.heldout_sequences),
    final_train_loss_delta: delta(r25s.train_loss?.final, r25p.train_loss?.final),
    final_dev_loss_delta: delta(r25s.dev_loss?.final, r25p.dev_loss?.final),
    heldout_loss_delta: delta(r25s.heldout_loss, r25p.heldout_loss),
    train_dev_gap_delta: delta(r25s.train_dev_gap, r25p.train_dev_gap),
    train_heldout_gap_delta: delta(r25s.train_heldout_gap, r25p.train_heldout_gap)
  };
  const dataFirstHelped = (
    Number(deltaReport.final_dev_loss_delta) <= 0 &&
    Number(deltaReport.heldout_loss_delta) <= 0 &&
    Number(deltaReport.train_dev_gap_delta) <= 0 &&
    Number(deltaReport.train_heldout_gap_delta) <= 0
  );
  const overfitRiskChange = riskRank(r25s.overfit_risk) < riskRank(r25p.overfit_risk)
    ? "improved"
    : riskRank(r25s.overfit_risk) > riskRank(r25p.overfit_risk)
      ? "worse"
      : riskRank(r25s.overfit_risk) > 0
        ? "unchanged"
        : "unknown";
  const ok = Boolean(r25pRun.ok && r25pHeldout.ok && r25pAnalysis.ok && r25pBreakdown.ok && r25sRun.ok && r25sHeldout.ok && r25sAnalysis.ok && r25sBreakdown.ok);
  const recommendation = chooseRecommendation({ ok, dataFirstHelped, overfitRiskChange, weakBucketDeltas: weakDeltas });
  const report = {
    ok,
    skipped: false,
    training_ran: false,
    product_model: false,
    release_checkpoint: false,
    phase_4_scaled_training: false,
    r25p,
    r25s,
    delta: deltaReport,
    weak_bucket_deltas: weakDeltas,
    data_first_helped: dataFirstHelped,
    overfit_risk_change: overfitRiskChange,
    recommendation,
    reasons: [
      dataFirstHelped
        ? "R25S improved dev loss, heldout loss, and train-to-eval gaps relative to R25P."
        : "R25S did not improve all primary generalization indicators relative to R25P.",
      "R25S used more balanced rows and a lower learning rate, so weaker train memorization is acceptable for this comparison.",
      recommendation === "architecture_ablation_design"
        ? "The next useful step is design work for architecture ablation, not an automatic training run."
        : "Any next training remains blocked pending reviewer approval."
    ],
    must_not_do: [
      "do not approve phase_4 scaled training",
      "do not run R25U or any fourth pilot without fresh reviewer approval",
      "do not treat replayable checkpoints as release artifacts",
      "do not commit ignored checkpoint or replay reports"
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
