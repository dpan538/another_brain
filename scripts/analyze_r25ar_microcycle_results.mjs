#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = "artifacts/training_os/small_decoder_pilot/r25as/r25as_r25ar_analysis.json";
const DOC = "docs/R25AS_R25AR_ANALYSIS_SUMMARY.md";
const DECISION_DOC = "docs/R25AS_R25AR_ANALYSIS_AND_DECISION.md";

async function readJson(path) {
  try {
    return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
  } catch {
    return null;
  }
}

async function writeText(path, text) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, text, "utf8");
}

async function writeJson(path, value) {
  await writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
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

function pct(value) {
  const number = finite(value);
  return number === null ? "n/a" : `${(number * 100).toFixed(2)}%`;
}

function fixed(value) {
  const number = finite(value);
  return number === null ? "n/a" : number.toFixed(4);
}

function bucketLosses(breakdown) {
  const byLanguage = breakdown?.by_language || {};
  return {
    zh: finite(byLanguage.zh?.average_next_token_loss),
    mixed: finite(byLanguage.mixed?.average_next_token_loss),
    en: finite(byLanguage.en?.average_next_token_loss),
    mixed_minus_zh: finite(breakdown?.mixed_minus_zh_gap),
    en_minus_zh: finite(breakdown?.en_minus_zh_gap)
  };
}

function summarizeRun(id, run, heldout, dataset, breakdown) {
  if (!run && !heldout && !dataset) return null;
  return {
    id,
    run_id: run?.run_id || dataset?.run_id || null,
    variant_id: run?.variant_id || dataset?.variant_id || null,
    train_rows: finite(dataset?.train_rows ?? run?.train_sequences),
    dev_rows: finite(dataset?.dev_rows ?? run?.dev_sequences),
    heldout_rows: finite(dataset?.heldout_rows ?? heldout?.heldout_sequences),
    steps: finite(run?.steps),
    learning_rate: finite(run?.learning_rate),
    train_loss: lossChange(run?.initial_train_loss, run?.final_train_loss),
    dev_loss: lossChange(run?.initial_dev_loss, run?.final_dev_loss),
    heldout_loss: finite(heldout?.heldout_loss),
    actual_language_mix: run?.actual_language_mix || dataset?.actual_train_language_mix || null,
    train_language_counts: dataset?.train_language_counts || null,
    language_bucket_losses: bucketLosses(breakdown),
    personal_target_coverage: run?.personal_target_coverage || dataset?.personal_target_coverage || breakdown?.personal_target_coverage || null,
    risk_focus_target_coverage: run?.risk_focus_target_coverage || dataset?.risk_focus_target_coverage || breakdown?.risk_focus_target_coverage || null,
    source_file_counts: dataset?.source_file_counts || null,
    training_ran_in_analysis: false,
    tokenizer_dry_run_ran_in_analysis: false,
    corpus_expansion_ran_in_analysis: false
  };
}

function bestByHeldout(runs) {
  return runs.filter((run) => run && Number.isFinite(run.heldout_loss))
    .sort((a, b) => a.heldout_loss - b.heldout_loss)[0] || null;
}

function coverageRows(coverage = {}) {
  return Object.fromEntries(Object.entries(coverage || {}).map(([key, value]) => [key, Number(value?.rows || 0)]));
}

function markdown(report) {
  const r = report.r25ar;
  const ao = report.comparisons.r25ao;
  return `# R25AS R25AR Analysis Summary

R25AS is analysis-only. It did not run decoder training, rerun R25AR, run tokenizer dry-run, expand corpus, modify \`training/llm_corpus\`, approve phase_4, or commit artifacts/weights.

## Classification

- Classification: \`${report.classification}\`
- Recommendation: \`${report.recommendation}\`
- Best pilot by heldout: \`${report.comparisons.best_by_heldout?.id || "unknown"}\`
- Phase_4 scaled training approved: \`false\`
- Product/formal training progress: \`0%\`

## R25AR Metrics

- Train loss: ${fixed(r.train_loss?.initial)} -> ${fixed(r.train_loss?.final)} (${fixed(r.train_loss?.absolute_decrease)} decrease)
- Dev loss: ${fixed(r.dev_loss?.initial)} -> ${fixed(r.dev_loss?.final)} (${fixed(r.dev_loss?.absolute_decrease)} decrease)
- Heldout loss: ${fixed(r.heldout_loss)}
- Train/dev gap: ${fixed(report.gaps.train_dev)}
- Train/heldout gap: ${fixed(report.gaps.train_heldout)}
- Dev/heldout gap: ${fixed(report.gaps.dev_heldout)}
- Train language mix: zh ${pct(r.actual_language_mix?.zh)}, mixed ${pct(r.actual_language_mix?.mixed)}, en ${pct(r.actual_language_mix?.en)}
- Bucket loss: zh ${fixed(r.language_bucket_losses.zh)}, mixed ${fixed(r.language_bucket_losses.mixed)}, en ${fixed(r.language_bucket_losses.en)}
- Bucket gaps: mixed-zh ${fixed(r.language_bucket_losses.mixed_minus_zh)}, en-zh ${fixed(r.language_bucket_losses.en_minus_zh)}

## Regression Read

- R25AR heldout minus R25AO heldout: ${fixed(report.comparisons.r25ar_minus_r25ao_heldout)}
- R25AR mixed gap minus R25AO mixed gap: ${fixed(report.comparisons.r25ar_minus_r25ao_mixed_gap)}
- R25AR en gap minus R25AO en gap: ${fixed(report.comparisons.r25ar_minus_r25ao_en_gap)}
- Mixed repair helped: \`${report.comparisons.mixed_repair_helped}\`
- Lower intensity helped: \`${report.comparisons.lower_intensity_helped}\`
- Repaired sampler helped: \`${report.comparisons.repaired_sampler_helped}\`

R25AR met the repaired sampler mix and reduced train/dev loss, but heldout regressed from R25AO and the mixed/en buckets remained weaker than zh. R25AS therefore does not justify an immediate repeat, tokenizer run, corpus expansion, phase_4 review, or product/formal training.

## Coverage

- Personal target rows: \`${JSON.stringify(coverageRows(r.personal_target_coverage))}\`
- Risk focus rows: \`${JSON.stringify(coverageRows(r.risk_focus_target_coverage))}\`
- Source contribution: \`${JSON.stringify(r.source_file_counts || {})}\`
- R25AO reference heldout: ${fixed(ao?.heldout_loss)}
`;
}

async function main() {
  const r25arRun = await readJson("artifacts/training_os/small_decoder_pilot/r25ar/r25ar_small_decoder_run_report.json");
  const r25arHeldout = await readJson("artifacts/training_os/small_decoder_pilot/r25ar/r25ar_heldout_eval_report.json");
  const r25arDataset = await readJson("artifacts/training_os/small_decoder_pilot/r25ar/r25ar_dataset_report.json");
  const r25arBreakdown = await readJson("artifacts/training_os/small_decoder_pilot/r25ar/r25ar_mixed_repair_breakdown.json");

  if (!r25arRun || !r25arHeldout || !r25arDataset || !r25arBreakdown) {
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

  const priorIds = ["r25p", "r25s", "r25v", "r25y", "r25ac", "r25ao"];
  const prior = [];
  for (const id of priorIds) {
    const breakdownName = id === "r25ac" ? "r25ac_chinese_personal_breakdown.json"
      : id === "r25ao" ? "r25ao_chinese_personal_breakdown.json"
        : id === "r25s" ? "r25s_heldout_breakdown.json"
          : id === "r25y" ? "r25y_heldout_breakdown.json"
            : id === "r25v" ? "r25v_heldout_breakdown.json"
              : "r25p_heldout_breakdown.json";
    prior.push(summarizeRun(
      id.toUpperCase(),
      await readJson(`artifacts/training_os/small_decoder_pilot/${id}/${id}_small_decoder_run_report.json`),
      await readJson(`artifacts/training_os/small_decoder_pilot/${id}/${id}_heldout_eval_report.json`),
      await readJson(`artifacts/training_os/small_decoder_pilot/${id}/${id}_dataset_report.json`),
      await readJson(`artifacts/training_os/small_decoder_pilot/${id}/${breakdownName}`)
    ));
  }

  const r25ar = summarizeRun("R25AR", r25arRun, r25arHeldout, r25arDataset, r25arBreakdown);
  const r25ao = prior.find((run) => run?.id === "R25AO") || null;
  const allRuns = [...prior, r25ar].filter(Boolean);
  const best = bestByHeldout(allRuns);
  const trainDev = finite(r25ar.dev_loss?.final) !== null && finite(r25ar.train_loss?.final) !== null ? r25ar.dev_loss.final - r25ar.train_loss.final : null;
  const trainHeldout = finite(r25ar.heldout_loss) !== null && finite(r25ar.train_loss?.final) !== null ? r25ar.heldout_loss - r25ar.train_loss.final : null;
  const devHeldout = finite(r25ar.heldout_loss) !== null && finite(r25ar.dev_loss?.final) !== null ? r25ar.heldout_loss - r25ar.dev_loss.final : null;
  const r25aoBuckets = r25ao?.language_bucket_losses || {};
  const r25arMinusR25ao = Number.isFinite(r25ar.heldout_loss) && Number.isFinite(r25ao?.heldout_loss)
    ? r25ar.heldout_loss - r25ao.heldout_loss
    : null;
  const mixedGapDelta = Number.isFinite(r25ar.language_bucket_losses.mixed_minus_zh) && Number.isFinite(r25aoBuckets.mixed_minus_zh)
    ? r25ar.language_bucket_losses.mixed_minus_zh - r25aoBuckets.mixed_minus_zh
    : null;
  const enGapDelta = Number.isFinite(r25ar.language_bucket_losses.en_minus_zh) && Number.isFinite(r25aoBuckets.en_minus_zh)
    ? r25ar.language_bucket_losses.en_minus_zh - r25aoBuckets.en_minus_zh
    : null;
  const samplerHit = Number(r25ar.actual_language_mix?.zh || 0) >= 0.65 &&
    Number(r25ar.actual_language_mix?.mixed || 0) >= 0.24 &&
    Number(r25ar.actual_language_mix?.en || 0) <= 0.1;
  const lowerIntensityHelped = Number.isFinite(r25arMinusR25ao) && r25arMinusR25ao <= 0;
  const mixedRepairHelped = r25arBreakdown.mixed_gap_improved_vs_r25ao === true;
  const repairedSamplerHelped = lowerIntensityHelped && mixedRepairHelped;
  const classification = !r25arRun.ok || !r25arHeldout.ok ? "invalid"
    : Number(r25arRun.steps) < 100 && !lowerIntensityHelped ? "repaired_sampler_quality_regressed"
      : repairedSamplerHelped ? "repaired_sampler_helped"
        : samplerHit ? "repaired_sampler_neutral"
          : "small_pilot_not_informative";

  const report = {
    ok: true,
    skipped: false,
    training_ran: false,
    tokenizer_dry_run_ran: false,
    corpus_expansion_ran: false,
    training_corpus_changed: false,
    phase4_approved: false,
    classification,
    recommendation: "pause_phase3_training",
    r25ar,
    gaps: {
      train_dev: trainDev,
      train_heldout: trainHeldout,
      dev_heldout: devHeldout
    },
    comparisons: {
      r25ao,
      prior_runs: prior.filter(Boolean),
      best_by_heldout: best,
      best_by_project_direction: "R25AR met sampler intent but regressed; R25S remains the loss reference",
      r25ar_minus_r25ao_heldout: r25arMinusR25ao,
      r25ar_minus_r25ao_mixed_gap: mixedGapDelta,
      r25ar_minus_r25ao_en_gap: enGapDelta,
      mixed_repair_helped: mixedRepairHelped,
      lower_intensity_helped: lowerIntensityHelped,
      repaired_sampler_helped: repairedSamplerHelped
    },
    interpretation: {
      sampler_mix_met: samplerHit,
      train_dev_loss_decreased: r25arRun.train_loss_decreased === true && r25arRun.dev_loss_finite === true,
      heldout_regressed_vs_r25ao: Number(r25arMinusR25ao) > 0,
      mixed_en_buckets_repaired: mixedRepairHelped && r25arBreakdown.en_gap_improved_vs_r25ao === true,
      phase4_still_not_approved: true,
      immediate_repeat_supported: false
    }
  };

  await writeJson(OUT, report);
  const md = markdown(report);
  await writeText(DOC, md);
  await writeText(DECISION_DOC, md.replace("# R25AS R25AR Analysis Summary", "# R25AS R25AR Analysis And Decision"));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
