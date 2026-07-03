#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = "artifacts/training_os/small_decoder_pilot/r25ap/r25ap_r25ao_analysis.json";

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

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function lossChange(initial, final) {
  const start = finite(initial);
  const end = finite(final);
  if (start === null || end === null) return null;
  return {
    initial: start,
    final: end,
    absolute_decrease: start - end,
    relative_decrease: start === 0 ? null : (start - end) / Math.abs(start)
  };
}

function runSummary(id, run, heldout, dataset) {
  if (!run && !heldout) return null;
  return {
    id,
    train_sequences: finite(run?.train_sequences ?? dataset?.train_rows_used ?? dataset?.train_rows),
    dev_sequences: finite(run?.dev_sequences ?? dataset?.dev_rows_used ?? dataset?.dev_rows),
    heldout_sequences: finite(heldout?.heldout_sequences ?? run?.heldout_sequences_prepared ?? dataset?.heldout_rows_prepared ?? dataset?.heldout_rows),
    final_train_loss: finite(run?.final_train_loss),
    final_dev_loss: finite(run?.final_dev_loss),
    heldout_loss: finite(heldout?.heldout_loss),
    train_loss_change: lossChange(run?.initial_train_loss, run?.final_train_loss),
    dev_loss_change: lossChange(run?.initial_dev_loss, run?.final_dev_loss),
    actual_language_mix: run?.actual_language_mix || dataset?.actual_train_language_mix || null,
    personal_target_coverage: run?.personal_target_coverage || dataset?.personal_target_coverage || null,
    phase_4_scaled_training: run?.phase_4_scaled_training === true || heldout?.phase_4_scaled_training === true,
    training_ran_in_analysis: false
  };
}

function minHeldout(entries) {
  return entries
    .filter((entry) => entry && Number.isFinite(entry.heldout_loss))
    .sort((a, b) => a.heldout_loss - b.heldout_loss)[0] || null;
}

async function main() {
  const r25aoRun = await readJson("artifacts/training_os/small_decoder_pilot/r25ao/r25ao_small_decoder_run_report.json");
  const r25aoHeldout = await readJson("artifacts/training_os/small_decoder_pilot/r25ao/r25ao_heldout_eval_report.json");
  const r25aoBreakdown = await readJson("artifacts/training_os/small_decoder_pilot/r25ao/r25ao_chinese_personal_breakdown.json");
  const r25aoDataset = await readJson("artifacts/training_os/small_decoder_pilot/r25ao/r25ao_dataset_report.json");

  if (!r25aoRun || !r25aoHeldout) {
    const skipped = {
      ok: true,
      skipped: true,
      reason: "ignored_artifacts_missing",
      training_ran: false,
      tokenizer_dry_run_ran: false,
      corpus_expansion_ran: false,
      phase4_approved: false
    };
    await writeJson(OUT, skipped);
    console.log(JSON.stringify(skipped, null, 2));
    return;
  }

  const prior = [];
  for (const id of ["r25p", "r25s", "r25v", "r25y", "r25ac"]) {
    const upper = id.toUpperCase();
    prior.push(runSummary(
      upper,
      await readJson(`artifacts/training_os/small_decoder_pilot/${id}/${id}_small_decoder_run_report.json`),
      await readJson(`artifacts/training_os/small_decoder_pilot/${id}/${id}_heldout_eval_report.json`),
      await readJson(`artifacts/training_os/small_decoder_pilot/${id}/${id}_dataset_report.json`)
    ));
  }

  const r25ao = runSummary("R25AO", r25aoRun, r25aoHeldout, r25aoDataset);
  const bestPrior = minHeldout(prior);
  const bestOverall = minHeldout([...prior, r25ao]);
  const trainDevGap = finite(r25aoRun.final_dev_loss) !== null && finite(r25aoRun.final_train_loss) !== null
    ? finite(r25aoRun.final_dev_loss) - finite(r25aoRun.final_train_loss)
    : null;
  const trainHeldoutGap = finite(r25aoHeldout.heldout_loss) !== null && finite(r25aoRun.final_train_loss) !== null
    ? finite(r25aoHeldout.heldout_loss) - finite(r25aoRun.final_train_loss)
    : null;
  const devHeldoutGap = finite(r25aoHeldout.heldout_loss) !== null && finite(r25aoRun.final_dev_loss) !== null
    ? finite(r25aoHeldout.heldout_loss) - finite(r25aoRun.final_dev_loss)
    : null;

  const mix = r25ao.actual_language_mix || {};
  const samplerHit = Number(mix.zh || 0) >= 0.7 && Number(mix.en || 0) <= 0.1;
  const heldoutRegressed = bestPrior?.heldout_loss !== undefined && Number(r25ao.heldout_loss) > Number(bestPrior.heldout_loss);
  const devChange = lossChange(r25aoRun.initial_dev_loss, r25aoRun.final_dev_loss);
  const classification = !r25aoRun.ok || !r25aoHeldout.ok
    ? "invalid"
    : heldoutRegressed && samplerHit
      ? "sampler_success_quality_regressed"
      : heldoutRegressed
        ? "train_improved_heldout_regressed"
        : samplerHit
          ? "expanded_chinese_personal_helped"
          : "data_issue_review";

  const report = {
    ok: true,
    skipped: false,
    training_ran: false,
    tokenizer_dry_run_ran: false,
    corpus_expansion_ran: false,
    phase4_approved: false,
    run_id: r25aoRun.run_id,
    variant_id: r25aoRun.variant_id,
    classification,
    r25ao,
    losses: {
      train: lossChange(r25aoRun.initial_train_loss, r25aoRun.final_train_loss),
      dev: lossChange(r25aoRun.initial_dev_loss, r25aoRun.final_dev_loss),
      heldout: finite(r25aoHeldout.heldout_loss),
      train_dev_gap: trainDevGap,
      train_heldout_gap: trainHeldoutGap,
      dev_heldout_gap: devHeldoutGap
    },
    sampler: {
      target_language_mix: r25aoDataset?.target_language_mix || r25aoBreakdown?.target_language_mix || null,
      actual_train_language_mix: r25ao.actual_language_mix,
      train_language_counts: r25aoDataset?.train_language_counts || null,
      hit_zh_first_target: samplerHit
    },
    language_bucket_losses: r25aoBreakdown?.by_language || null,
    personal_target_coverage: r25ao.personal_target_coverage,
    comparisons: {
      best_prior_by_heldout: bestPrior?.id || null,
      best_prior_heldout_loss: bestPrior?.heldout_loss ?? null,
      best_overall_by_heldout: bestOverall?.id || null,
      best_overall_heldout_loss: bestOverall?.heldout_loss ?? null,
      r25ao_heldout_minus_best_prior: bestPrior ? Number(r25ao.heldout_loss) - Number(bestPrior.heldout_loss) : null,
      prior_runs: prior.filter(Boolean)
    },
    interpretation: {
      expanded_corpus_and_sampler_helped: samplerHit && !heldoutRegressed,
      sampler_success_but_quality_regressed: samplerHit && heldoutRegressed,
      train_improved: r25aoRun.train_loss_decreased === true,
      dev_improved: Number(devChange?.absolute_decrease) > 0,
      heldout_generalization_not_proven: heldoutRegressed,
      phase4_still_not_approved: true,
      recommendation: "pause_for_review"
    }
  };

  await writeJson(OUT, report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
