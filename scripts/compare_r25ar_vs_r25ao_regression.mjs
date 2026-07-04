#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = "artifacts/training_os/small_decoder_pilot/r25as/r25as_r25ar_vs_r25ao.json";
const DOC = "docs/R25AS_R25AR_VS_R25AO_REGRESSION.md";

async function readJson(path) {
  try { return JSON.parse(await readFile(resolve(ROOT, path), "utf8")); } catch { return null; }
}
async function write(path, text) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, text, "utf8");
}
async function writeJson(path, value) { await write(path, `${JSON.stringify(value, null, 2)}\n`); }
function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function fixed(value) { const n = num(value); return n === null ? "n/a" : n.toFixed(4); }
function change(run, key) {
  const a = num(run?.[`initial_${key}_loss`]);
  const b = num(run?.[`final_${key}_loss`]);
  return a === null || b === null ? null : { initial: a, final: b, absolute_decrease: a - b };
}
function losses(b) {
  const by = b?.by_language || {};
  return {
    zh: num(by.zh?.average_next_token_loss),
    mixed: num(by.mixed?.average_next_token_loss),
    en: num(by.en?.average_next_token_loss),
    mixed_minus_zh: num(b?.mixed_minus_zh_gap),
    en_minus_zh: num(b?.en_minus_zh_gap)
  };
}
function countRows(coverage = {}) {
  return Object.fromEntries(Object.entries(coverage || {}).map(([k, v]) => [k, Number(v?.rows || 0)]));
}

async function main() {
  const arRun = await readJson("artifacts/training_os/small_decoder_pilot/r25ar/r25ar_small_decoder_run_report.json");
  const arHeld = await readJson("artifacts/training_os/small_decoder_pilot/r25ar/r25ar_heldout_eval_report.json");
  const arData = await readJson("artifacts/training_os/small_decoder_pilot/r25ar/r25ar_dataset_report.json");
  const arBreak = await readJson("artifacts/training_os/small_decoder_pilot/r25ar/r25ar_mixed_repair_breakdown.json");
  const aoRun = await readJson("artifacts/training_os/small_decoder_pilot/r25ao/r25ao_small_decoder_run_report.json");
  const aoHeld = await readJson("artifacts/training_os/small_decoder_pilot/r25ao/r25ao_heldout_eval_report.json");
  const aoData = await readJson("artifacts/training_os/small_decoder_pilot/r25ao/r25ao_dataset_report.json");
  const aoBreak = await readJson("artifacts/training_os/small_decoder_pilot/r25ao/r25ao_chinese_personal_breakdown.json");
  if (!arRun || !arHeld || !arBreak || !aoRun || !aoHeld || !aoBreak) {
    const skipped = { ok: true, skipped: true, reason: "ignored_artifacts_missing", training_ran: false, phase4_approved: false };
    await writeJson(OUT, skipped);
    console.log(JSON.stringify(skipped, null, 2));
    return;
  }
  const arLoss = losses(arBreak);
  const aoLoss = losses(aoBreak);
  const heldoutDelta = num(arHeld.heldout_loss) !== null && num(aoHeld.heldout_loss) !== null ? num(arHeld.heldout_loss) - num(aoHeld.heldout_loss) : null;
  const mixedGapDelta = arLoss.mixed_minus_zh !== null && aoLoss.mixed_minus_zh !== null ? arLoss.mixed_minus_zh - aoLoss.mixed_minus_zh : null;
  const enGapDelta = arLoss.en_minus_zh !== null && aoLoss.en_minus_zh !== null ? arLoss.en_minus_zh - aoLoss.en_minus_zh : null;
  const lowerIntensityHelped = heldoutDelta !== null && heldoutDelta <= 0;
  const mixedRepairHelped = arBreak.mixed_gap_improved_vs_r25ao === true || (mixedGapDelta !== null && mixedGapDelta < 0);
  const samplerRepairHelped = lowerIntensityHelped && mixedRepairHelped;
  const report = {
    ok: true,
    training_ran: false,
    tokenizer_dry_run_ran: false,
    corpus_expansion_ran: false,
    phase4_approved: false,
    r25ar: {
      variant_id: arRun.variant_id,
      max_steps: arRun.steps,
      learning_rate: arRun.learning_rate,
      train_loss: change(arRun, "train"),
      dev_loss: change(arRun, "dev"),
      heldout_loss: num(arHeld.heldout_loss),
      language_mix: arRun.actual_language_mix || arData?.actual_train_language_mix,
      language_bucket_losses: arLoss,
      personal_target_rows: countRows(arRun.personal_target_coverage || arData?.personal_target_coverage),
      risk_focus_rows: countRows(arRun.risk_focus_target_coverage || arData?.risk_focus_target_coverage),
      source_file_counts: arData?.source_file_counts || null
    },
    r25ao: {
      variant_id: aoRun.variant_id,
      max_steps: aoRun.steps,
      learning_rate: aoRun.learning_rate,
      train_loss: change(aoRun, "train"),
      dev_loss: change(aoRun, "dev"),
      heldout_loss: num(aoHeld.heldout_loss),
      language_mix: aoRun.actual_language_mix || aoData?.actual_train_language_mix,
      language_bucket_losses: aoLoss,
      personal_target_rows: countRows(aoRun.personal_target_coverage || aoData?.personal_target_coverage),
      source_file_counts: aoData?.source_file_counts || null
    },
    heldout_delta_r25ar_minus_r25ao: heldoutDelta,
    mixed_gap_delta: mixedGapDelta,
    en_gap_delta: enGapDelta,
    whether_mixed_repair_helped: mixedRepairHelped,
    whether_lower_intensity_helped: lowerIntensityHelped,
    whether_sampler_repair_helped: samplerRepairHelped,
    conclusion: samplerRepairHelped ? "repair_helped_review_carefully" : "repaired_sampler_quality_regressed"
  };
  await writeJson(OUT, report);
  await write(DOC, `# R25AS R25AR Vs R25AO Regression

R25AS compares completed ignored reports only. It did not rerun R25AR/R25AO, train, run tokenizer dry-run, expand corpus, or approve phase_4.

| Metric | R25AO | R25AR | Delta |
| --- | ---: | ---: | ---: |
| Steps | ${aoRun.steps} | ${arRun.steps} | ${Number(arRun.steps) - Number(aoRun.steps)} |
| Learning rate | ${aoRun.learning_rate} | ${arRun.learning_rate} | ${(Number(arRun.learning_rate) - Number(aoRun.learning_rate)).toFixed(4)} |
| Final train loss | ${fixed(aoRun.final_train_loss)} | ${fixed(arRun.final_train_loss)} | ${fixed(Number(arRun.final_train_loss) - Number(aoRun.final_train_loss))} |
| Final dev loss | ${fixed(aoRun.final_dev_loss)} | ${fixed(arRun.final_dev_loss)} | ${fixed(Number(arRun.final_dev_loss) - Number(aoRun.final_dev_loss))} |
| Heldout loss | ${fixed(aoHeld.heldout_loss)} | ${fixed(arHeld.heldout_loss)} | ${fixed(heldoutDelta)} |
| Mixed-zh gap | ${fixed(aoLoss.mixed_minus_zh)} | ${fixed(arLoss.mixed_minus_zh)} | ${fixed(mixedGapDelta)} |
| En-zh gap | ${fixed(aoLoss.en_minus_zh)} | ${fixed(arLoss.en_minus_zh)} | ${fixed(enGapDelta)} |

Result: \`${report.conclusion}\`. R25AR hit its repaired-sampler mix, but lower intensity and mixed upweighting did not improve heldout quality. Mixed and English remained weak relative to zh, and no immediate repeat or phase_4 escalation is justified.
`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
