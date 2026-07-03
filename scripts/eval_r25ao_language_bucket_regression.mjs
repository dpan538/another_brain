#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = "artifacts/training_os/small_decoder_pilot/r25ap/r25ap_r25ao_language_bucket_regression.json";

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

function lossFor(breakdown, language) {
  const bucket = breakdown?.by_language?.[language];
  const loss = Number(bucket?.average_next_token_loss);
  return Number.isFinite(loss) ? loss : null;
}

async function main() {
  const breakdown = await readJson("artifacts/training_os/small_decoder_pilot/r25ao/r25ao_chinese_personal_breakdown.json");
  if (!breakdown?.ok) {
    const skipped = {
      ok: true,
      skipped: true,
      reason: "r25ao_breakdown_missing_or_not_ok",
      training_ran: false,
      tokenizer_dry_run_ran: false,
      phase4_approved: false
    };
    await writeJson(OUT, skipped);
    console.log(JSON.stringify(skipped, null, 2));
    return;
  }

  const zh = lossFor(breakdown, "zh");
  const mixed = lossFor(breakdown, "mixed");
  const en = lossFor(breakdown, "en");
  const mixedMinusZh = mixed !== null && zh !== null ? mixed - zh : null;
  const enMinusZh = en !== null && zh !== null ? en - zh : null;
  const weakBuckets = [
    mixedMinusZh !== null && mixedMinusZh > 0.5 ? "mixed" : null,
    enMinusZh !== null && enMinusZh > 1.0 ? "en" : null
  ].filter(Boolean);

  const older = {};
  for (const id of ["r25ac", "r25y", "r25s"]) {
    const candidate = await readJson(`artifacts/training_os/small_decoder_pilot/${id}/${id}_chinese_personal_breakdown.json`)
      || await readJson(`artifacts/training_os/small_decoder_pilot/${id}/${id}_heldout_breakdown.json`)
      || await readJson(`artifacts/training_os/small_decoder_pilot/r25t/r25t_${id}_heldout_breakdown.json`)
      || await readJson(`artifacts/training_os/small_decoder_pilot/r25z/r25z_${id}_heldout_breakdown.json`);
    older[id.toUpperCase()] = candidate?.by_language ? {
      zh: lossFor(candidate, "zh"),
      mixed: lossFor(candidate, "mixed"),
      en: lossFor(candidate, "en")
    } : "comparison_unavailable";
  }

  const report = {
    ok: true,
    skipped: false,
    training_ran: false,
    tokenizer_dry_run_ran: false,
    phase4_approved: false,
    run_id: breakdown.run_id,
    heldout_loss: breakdown.heldout_loss,
    heldout_language_counts: breakdown.heldout_language_counts,
    heldout_language_share: breakdown.heldout_language_share,
    language_bucket_losses: { zh, mixed, en },
    gaps: {
      mixed_minus_zh: mixedMinusZh,
      en_minus_zh: enMinusZh
    },
    weak_buckets: weakBuckets,
    zh_only_better_than_full_heldout: zh !== null && Number(breakdown.heldout_loss) > zh,
    comparison_against_prior_bucket_reports: older,
    classification: weakBuckets.length > 0 ? "language_bucket_regression" : "no_bucket_regression_detected",
    recommendation: weakBuckets.length > 0 ? "review_mixed_en_sampling_and_examples_before_next_training" : "pause_for_review"
  };
  await writeJson(OUT, report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
