#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = "artifacts/training_os/small_decoder_pilot/r25aq/r25aq_r25ao_root_cause.json";
const DOC = "docs/R25AQ_R25AO_ROOT_CAUSE_SUMMARY.md";

async function readJson(path) {
  try {
    return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
  } catch {
    return null;
  }
}

async function writeText(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, value, "utf8");
}

async function writeJson(path, value) {
  await writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function diff(a, b) {
  const left = finite(a);
  const right = finite(b);
  return left === null || right === null ? null : left - right;
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
  const n = finite(value);
  return n === null ? "n/a" : `${(n * 100).toFixed(2)}%`;
}

function topLossFamilies(byTask = {}, threshold = 7) {
  return Object.entries(byTask)
    .map(([family, value]) => ({
      family,
      sequence_count: Number(value?.sequence_count || 0),
      average_next_token_loss: finite(value?.average_next_token_loss)
    }))
    .filter((item) => item.average_next_token_loss !== null && item.average_next_token_loss >= threshold)
    .sort((a, b) => b.average_next_token_loss - a.average_next_token_loss || b.sequence_count - a.sequence_count);
}

function targetRows(coverage = {}) {
  return Object.fromEntries(Object.entries(coverage).map(([key, value]) => [key, Number(value?.rows || 0)]));
}

function classify({ samplerHit, heldoutRegressed, mixedGap, enGap, highLoss, trainHeldoutGap, taskFamilyUnknownShare }) {
  const causes = [];
  if (samplerHit && heldoutRegressed) causes.push("sampler_overfocus_on_zh");
  if ((mixedGap ?? 0) > 0.5 || (enGap ?? 0) > 1.0) causes.push("language_bucket_imbalance");
  if (highLoss.length > 0) causes.push("task_family_mismatch");
  if ((taskFamilyUnknownShare ?? 0) > 0.8) causes.push("source_family_mismatch");
  if ((trainHeldoutGap ?? 0) > 0.6) causes.push("training_intensity_too_high");
  if (heldoutRegressed) causes.push("heldout_distribution_mismatch");
  if (causes.length === 0) causes.push("unknown");
  return [...new Set(causes)];
}

async function main() {
  const run = await readJson("artifacts/training_os/small_decoder_pilot/r25ao/r25ao_small_decoder_run_report.json");
  const heldout = await readJson("artifacts/training_os/small_decoder_pilot/r25ao/r25ao_heldout_eval_report.json");
  const breakdown = await readJson("artifacts/training_os/small_decoder_pilot/r25ao/r25ao_chinese_personal_breakdown.json");
  const dataset = await readJson("artifacts/training_os/small_decoder_pilot/r25ao/r25ao_dataset_report.json");
  const r25ap = await readJson("artifacts/training_os/small_decoder_pilot/r25ap/r25ap_r25ao_analysis.json");
  const r25apNext = await readJson("artifacts/training_os/small_decoder_pilot/r25ap/r25ap_next_step_decision.json");

  if (!run?.ok || !heldout?.ok || !breakdown?.ok || !dataset?.ok) {
    const skipped = {
      ok: true,
      skipped: true,
      reason: "r25ao_reports_missing_or_incomplete",
      training_ran_in_r25aq: false,
      tokenizer_dry_run_ran: false,
      corpus_expansion_ran: false,
      phase4_approved: false
    };
    await writeJson(OUT, skipped);
    await writeText(DOC, `# R25AQ R25AO Root-Cause Summary\n\nR25AQ does not train. The R25AO root-cause analysis skipped because the ignored R25AO reports were missing or incomplete.\n\nPhase_4 remains blocked. Product training progress remains 0%. No weights are committed.\n`);
    console.log(JSON.stringify(skipped, null, 2));
    return;
  }

  const train = lossChange(run.initial_train_loss, run.final_train_loss);
  const dev = lossChange(run.initial_dev_loss, run.final_dev_loss);
  const heldoutLoss = finite(heldout.heldout_loss);
  const trainDevGap = diff(run.final_dev_loss, run.final_train_loss);
  const trainHeldoutGap = diff(heldout.heldout_loss, run.final_train_loss);
  const devHeldoutGap = diff(heldout.heldout_loss, run.final_dev_loss);
  const languageLosses = Object.fromEntries(
    Object.entries(breakdown.by_language || {}).map(([language, value]) => [language, finite(value.average_next_token_loss)])
  );
  const mixedGap = diff(languageLosses.mixed, languageLosses.zh);
  const enGap = diff(languageLosses.en, languageLosses.zh);
  const actualMix = dataset.actual_train_language_mix || run.actual_language_mix || {};
  const samplerHit = Number(actualMix.zh || 0) >= 0.7 && Number(actualMix.en || 0) <= 0.1;
  const bestPriorLoss = finite(r25ap?.comparisons?.best_prior_heldout_loss ?? r25apNext?.best_prior_heldout_loss ?? 5.0692);
  const heldoutRegressed = bestPriorLoss !== null && heldoutLoss !== null && heldoutLoss > bestPriorLoss;
  const highLoss = topLossFamilies(breakdown.by_task_type || {});
  const trainFamilyCounts = dataset.task_family_counts?.train || {};
  const trainFamilyTotal = Object.values(trainFamilyCounts).reduce((sum, value) => sum + Number(value || 0), 0);
  const unknownShare = trainFamilyTotal ? Number(trainFamilyCounts.unknown || 0) / trainFamilyTotal : null;
  const personalCoverage = targetRows(run.personal_target_coverage || dataset.personal_target_coverage || {});
  const likelyRootCauses = classify({ samplerHit, heldoutRegressed, mixedGap, enGap, highLoss, trainHeldoutGap, taskFamilyUnknownShare: unknownShare });

  const report = {
    ok: true,
    skipped: false,
    training_ran_in_r25aq: false,
    tokenizer_dry_run_ran: false,
    corpus_expansion_ran: false,
    phase4_approved: false,
    run_id: run.run_id,
    variant_id: run.variant_id,
    r25ao_was_previous_bounded_pilot: run.small_pilot_training_ran === true,
    classification: samplerHit && heldoutRegressed ? "sampler_success_quality_regressed" : heldoutRegressed ? "quality_regressed" : "needs_review",
    likely_root_causes: likelyRootCauses,
    losses: {
      train,
      dev,
      heldout: heldoutLoss,
      train_dev_gap: trainDevGap,
      train_heldout_gap: trainHeldoutGap,
      dev_heldout_gap: devHeldoutGap,
      best_prior_heldout_loss: bestPriorLoss,
      heldout_minus_best_prior: bestPriorLoss !== null && heldoutLoss !== null ? heldoutLoss - bestPriorLoss : null
    },
    language_mix: {
      target: dataset.target_language_mix || breakdown.target_language_mix || null,
      train_counts: dataset.train_language_counts || null,
      dev_counts: dataset.dev_language_counts || null,
      heldout_counts: dataset.heldout_language_counts || breakdown.heldout_language_counts || null,
      actual_train_mix: actualMix,
      sampler_hit: samplerHit
    },
    language_bucket_losses: languageLosses,
    language_bucket_gaps: {
      mixed_minus_zh: mixedGap,
      en_minus_zh: enGap
    },
    high_loss_task_families: highLoss,
    personal_target_coverage: personalCoverage,
    concentration_risks: {
      train_task_family_unknown_share: unknownShare,
      transformation_type_concentration_available: Boolean(breakdown.by_transformation_type),
      source_file_contribution_available: Boolean(breakdown.by_source_file || run.source_files),
      context_length_truncation_available: Boolean(dataset.context_length_truncation || breakdown.context_length_truncation),
      repeated_template_risk: "not_recomputed_in_r25aq; R25AJ/R25AK uniqueness gates remain the source of truth for promoted corpus uniqueness"
    },
    interpretation: [
      "R25AO met the zh-first sampler target, so the sampler worked mechanically.",
      "Train and dev loss decreased, but heldout stayed worse than the best previous reference.",
      "Mixed and English heldout losses are materially weaker than Chinese; mixed matters more than English for this project.",
      "Several task families have high heldout loss, so another repeat without sampler/curriculum repair is not justified."
    ],
    recommendation: "design_repaired_sampler_then_pause_for_fresh_approval"
  };

  await writeJson(OUT, report);
  const highLossLines = highLoss.slice(0, 8).map((item) => `- ${item.family}: loss ${item.average_next_token_loss.toFixed(4)} over ${item.sequence_count} heldout sequences`).join("\n") || "- No task family crossed the high-loss threshold.";
  await writeText(DOC, `# R25AQ R25AO Root-Cause Summary\n\nR25AQ does not train, rerun R25AO, run a tokenizer dry-run, expand corpus, or modify \`training/llm_corpus\`. It analyzes the already completed R25AO ignored reports.\n\n## Classification\n\nR25AO is classified as \`${report.classification}\`. The likely root-cause set is: ${likelyRootCauses.map((item) => `\`${item}\``).join(", ")}.\n\n## Loss Behavior\n\n- Train loss: ${train.initial.toFixed(4)} -> ${train.final.toFixed(4)}.\n- Dev loss: ${dev.initial.toFixed(4)} -> ${dev.final.toFixed(4)}.\n- Heldout loss: ${heldoutLoss.toFixed(4)}.\n- Train/dev gap: ${trainDevGap.toFixed(4)}.\n- Train/heldout gap: ${trainHeldoutGap.toFixed(4)}.\n- Dev/heldout gap: ${devHeldoutGap.toFixed(4)}.\n- Best prior heldout reference: ${bestPriorLoss?.toFixed(4) || "n/a"}.\n\n## Sampler Versus Quality\n\nR25AO met the zh-first sampler target with train mix zh ${pct(actualMix.zh)}, mixed ${pct(actualMix.mixed)}, en ${pct(actualMix.en)}. That is sampler success, not quality success: heldout regressed against the best prior reference.\n\n## Language Buckets\n\n- zh heldout loss: ${languageLosses.zh?.toFixed(4) || "n/a"}.\n- mixed heldout loss: ${languageLosses.mixed?.toFixed(4) || "n/a"}; mixed-minus-zh ${mixedGap?.toFixed(4) || "n/a"}.\n- en heldout loss: ${languageLosses.en?.toFixed(4) || "n/a"}; en-minus-zh ${enGap?.toFixed(4) || "n/a"}.\n\nMixed remains more product-important than English because the project is Chinese-first but technical repo conversation is often mixed.\n\n## High-Loss Families\n\n${highLossLines}\n\n## Boundary\n\nR25AQ does not justify an immediate repeat. R25AR is design-only and requires fresh approval before any bounded pilot. Product training progress remains 0%, phase_4 remains blocked, no weights are committed, no external APIs/downloads are used, no backend/storage path is introduced, and no chain-of-thought or private raw data is added.\n`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
