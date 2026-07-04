#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = "artifacts/training_os/small_decoder_pilot/r25aq/r25aq_mixed_en_weakness.json";
const DOC = "docs/R25AQ_MIXED_EN_WEAKNESS_REVIEW.md";

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

function loss(breakdown, language) {
  const n = Number(breakdown?.by_language?.[language]?.average_next_token_loss);
  return Number.isFinite(n) ? n : null;
}

function gap(a, b) {
  return a === null || b === null ? null : a - b;
}

function risk(value, moderate, high) {
  if (value === null) return "unknown";
  if (value >= high) return "high";
  if (value >= moderate) return "moderate";
  return "low";
}

function countCoverage(rows = [], target) {
  return rows.filter((row) => {
    const targets = Array.isArray(row.personal_color_targets) ? row.personal_color_targets : [];
    const tags = Array.isArray(row.policy_tags) ? row.policy_tags : [];
    const family = String(row.task_family || row.transformation_type || row.task_type || "");
    return targets.includes(target) || tags.includes(target) || family.includes(target);
  }).length;
}

async function readJsonl(path) {
  try {
    const text = await readFile(resolve(ROOT, path), "utf8");
    return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

async function main() {
  const dataset = await readJson("artifacts/training_os/small_decoder_pilot/r25ao/r25ao_dataset_report.json");
  const breakdown = await readJson("artifacts/training_os/small_decoder_pilot/r25ao/r25ao_chinese_personal_breakdown.json");
  if (!dataset?.ok || !breakdown?.ok) {
    const skipped = {
      ok: true,
      skipped: true,
      reason: "r25ao_language_reports_missing",
      training_ran_in_r25aq: false,
      phase4_approved: false
    };
    await writeJson(OUT, skipped);
    await writeText(DOC, "# R25AQ Mixed/EN Weakness Review\n\nR25AQ does not train. The mixed/en weakness review skipped because R25AO language reports were missing.\n");
    console.log(JSON.stringify(skipped, null, 2));
    return;
  }

  const trainRows = [
    ...(await readJsonl("training/llm_corpus/r25ak_repo_derived_train.jsonl")),
    ...(await readJsonl("training/llm_corpus/r25am_second_chinese_train.jsonl")),
    ...(await readJsonl("training/llm_corpus/r25l_train.jsonl")),
    ...(await readJsonl("training/llm_corpus/train.jsonl"))
  ];
  const mixedRows = trainRows.filter((row) => row.language === "mixed");
  const enRows = trainRows.filter((row) => row.language === "en");
  const targets = ["project_continuation", "repair_after_weak_answer", "local_first_static_browser_reasoning", "style_preference", "tool_status_honesty", "bounded_judgment"];
  const mixedTargetCoverage = Object.fromEntries(targets.map((target) => [target, countCoverage(mixedRows, target)]));
  const enTargetCoverage = Object.fromEntries(targets.map((target) => [target, countCoverage(enRows, target)]));

  const zhLoss = loss(breakdown, "zh");
  const mixedLoss = loss(breakdown, "mixed");
  const enLoss = loss(breakdown, "en");
  const mixedMinusZh = gap(mixedLoss, zhLoss);
  const enMinusZh = gap(enLoss, zhLoss);
  const report = {
    ok: true,
    skipped: false,
    training_ran_in_r25aq: false,
    tokenizer_dry_run_ran: false,
    corpus_expansion_ran: false,
    phase4_approved: false,
    language_counts: {
      train: dataset.train_language_counts,
      dev: dataset.dev_language_counts,
      heldout: dataset.heldout_language_counts
    },
    language_mix: {
      train: dataset.actual_train_language_mix,
      dev: dataset.actual_dev_language_mix,
      heldout: dataset.actual_heldout_language_mix
    },
    heldout_language_losses: {
      zh: zhLoss,
      mixed: mixedLoss,
      en: enLoss
    },
    loss_gaps: {
      mixed_minus_zh: mixedMinusZh,
      en_minus_zh: enMinusZh
    },
    mixed_bucket_risk: risk(mixedMinusZh, 0.4, 0.8),
    en_bucket_risk: risk(enMinusZh, 0.8, 1.4),
    product_priority: {
      zh: "highest",
      mixed: "higher_than_en",
      en: "secondary_boundary_not_benchmark_target"
    },
    train_pool_personal_target_coverage_estimate: {
      mixed: mixedTargetCoverage,
      en: enTargetCoverage
    },
    recommendation: [
      "increase mixed share before increasing English",
      "keep English capped at or below 10%",
      "improve mixed technical-boundary coverage rather than optimizing generic English fluency",
      "keep Chinese as the primary behavior target"
    ]
  };

  await writeJson(OUT, report);
  await writeText(DOC, `# R25AQ Mixed/EN Weakness Review\n\nR25AQ does not train, generate datasets, or modify \`training/llm_corpus\`. This review uses existing R25AO language-bucket reports and aggregate corpus metadata.\n\n## Finding\n\nR25AO met the zh-first sampler target, but mixed/en buckets are weaker than zh:\n\n- zh heldout loss: ${zhLoss?.toFixed(4) || "n/a"}.\n- mixed heldout loss: ${mixedLoss?.toFixed(4) || "n/a"}; mixed-minus-zh ${mixedMinusZh?.toFixed(4) || "n/a"}; risk \`${report.mixed_bucket_risk}\`.\n- en heldout loss: ${enLoss?.toFixed(4) || "n/a"}; en-minus-zh ${enMinusZh?.toFixed(4) || "n/a"}; risk \`${report.en_bucket_risk}\`.\n\n## Product Priority\n\nChinese remains the highest priority. Mixed Chinese/English is higher priority than English because repo work naturally includes code terms, config names, and technical boundaries. English remains capped support, not a generic benchmark-fluency target.\n\n## Recommended Change\n\nR25AR should bias toward a repaired mix around zh >= 65%, mixed about 25%, en <= 10%, with lower training intensity. The aim is mixed boundary robustness without letting English dominate.\n\nR25AR is not approved by R25AQ. Any future pilot requires fresh reviewer approval. Phase_4 remains blocked, product/formal training remains 0%, and no weights are committed.\n`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
