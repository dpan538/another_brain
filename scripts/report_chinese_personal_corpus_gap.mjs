#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const OUTPUT_PATH = "artifacts/training_os/small_decoder_pilot/r25ad/r25ad_chinese_personal_corpus_gap.json";
const SOURCES = [
  { split: "train", path: "training/llm_corpus/r25l_train.jsonl" },
  { split: "dev", path: "training/llm_corpus/r25l_dev.jsonl" },
  { split: "heldout", path: "training/llm_corpus/r25l_heldout.jsonl" }
];
const TARGET = { zh_min: 0.7, mixed_target: 0.2, en_max: 0.1 };
const SIZE_SCENARIOS = [3000, 5000, 10000];

function emptyCounts() {
  return { zh: 0, mixed: 0, en: 0, other: 0, total: 0 };
}

function add(counts, language) {
  const key = ["zh", "mixed", "en"].includes(language) ? language : "other";
  counts[key] += 1;
  counts.total += 1;
}

function share(counts) {
  const total = counts.total || 1;
  return {
    zh: counts.zh / total,
    mixed: counts.mixed / total,
    en: counts.en / total,
    other: counts.other / total
  };
}

async function readJsonl(path) {
  const text = await readFile(resolve(ROOT, path), "utf8");
  return text.split(/\r?\n/).filter((line) => line.trim()).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`${path}:${index + 1}: ${error.message}`);
    }
  });
}

async function writeJson(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function targetCounts(totalRows) {
  const zh = Math.ceil(totalRows * TARGET.zh_min);
  const en = Math.floor(totalRows * TARGET.en_max);
  const mixed = Math.max(0, totalRows - zh - en);
  return { zh, mixed, en, total: totalRows };
}

function selectedPoolScenario(totalRows, current) {
  const target = targetCounts(totalRows);
  return {
    total_rows: totalRows,
    target_counts: target,
    additional_reviewed_rows_needed_if_selecting_or_expanding_pool: {
      zh: Math.max(0, target.zh - current.zh),
      mixed: Math.max(0, target.mixed - current.mixed),
      en: Math.max(0, target.en - current.en)
    },
    current_rows_above_target_for_selected_pool: {
      zh: Math.max(0, current.zh - target.zh),
      mixed: Math.max(0, current.mixed - target.mixed),
      en: Math.max(0, current.en - target.en)
    },
    requires_en_downsample_or_cap_in_selected_training_pool: current.en > target.en
  };
}

function retainAllScenario(totalRows, current) {
  const target = targetCounts(totalRows);
  const feasible = current.zh <= target.zh && current.mixed <= target.mixed && current.en <= target.en && current.total <= totalRows;
  return {
    total_rows: totalRows,
    feasible_while_retaining_all_current_r25l_rows: feasible,
    target_counts: target,
    additional_rows_needed_if_feasible: feasible
      ? {
          zh: Math.max(0, target.zh - current.zh),
          mixed: Math.max(0, target.mixed - current.mixed),
          en: Math.max(0, target.en - current.en)
        }
      : null,
    infeasible_reason: feasible ? null : "current R25L en/mixed balance exceeds the selected-pool cap for this total; future sampling must cap or downselect en rather than retain all rows"
  };
}

async function main() {
  const bySplit = {};
  const current = emptyCounts();
  const failures = [];

  for (const source of SOURCES) {
    const rows = await readJsonl(source.path);
    const counts = emptyCounts();
    for (const row of rows) {
      add(counts, row.language);
      add(current, row.language);
      if (row.contains_private_data === true) failures.push({ code: "private_data_flagged_in_r25l_row", split: source.split, sample_id: row.sample_id || null });
    }
    bySplit[source.split] = { path: source.path, counts, share: share(counts) };
  }

  const currentShare = share(current);
  const currentMeetsTarget = currentShare.zh >= TARGET.zh_min && currentShare.en <= TARGET.en_max;
  const minTotalIfRetainingAllEn = Math.ceil(current.en / TARGET.en_max);
  const minimumRetainAllTarget = targetCounts(minTotalIfRetainingAllEn);
  const minimumRetainAllAdditional = {
    zh: Math.max(0, minimumRetainAllTarget.zh - current.zh),
    mixed: Math.max(0, minimumRetainAllTarget.mixed - current.mixed),
    en: Math.max(0, minimumRetainAllTarget.en - current.en),
    total: Math.max(0, minTotalIfRetainingAllEn - current.total)
  };

  const report = {
    ok: failures.length === 0,
    report_id: "r25ad_chinese_personal_corpus_gap",
    training_ran: false,
    corpus_rewritten: false,
    corpus_generated: false,
    sources_read: SOURCES.map((source) => source.path),
    target_distribution: TARGET,
    current_r25l_distribution: {
      counts: current,
      share: currentShare
    },
    by_split: bySplit,
    current_r25l_meets_chinese_first_target: currentMeetsTarget,
    current_r25l_is_balanced_thirds: Math.abs(currentShare.zh - 1 / 3) < 0.04 && Math.abs(currentShare.mixed - 1 / 3) < 0.04 && Math.abs(currentShare.en - 1 / 3) < 0.04,
    current_r25l_insufficient_for_chinese_personal_target: !currentMeetsTarget,
    selected_pool_scenarios: SIZE_SCENARIOS.map((totalRows) => selectedPoolScenario(totalRows, current)),
    retain_all_current_rows_scenarios: SIZE_SCENARIOS.map((totalRows) => retainAllScenario(totalRows, current)),
    minimum_expansion_if_retaining_all_current_en_rows: {
      minimum_total_rows: minTotalIfRetainingAllEn,
      target_counts_at_minimum_total: minimumRetainAllTarget,
      additional_reviewed_rows_needed: minimumRetainAllAdditional
    },
    upsampling_repetition_risk: "high_without_new_reviewed_zh_and_mixed_rows",
    recommendation: "r25ae_expand_reviewed_chinese_personal_corpus_before_any_new_microcycle",
    notes: [
      "R25L is valuable project-authored history, but its one-third language balance is not the new Chinese-first target.",
      "R25AC already met the sampled language mix; the loss regression points to corpus quality and coverage depth, not automatic scale.",
      "R25AE should be a corpus-expansion review pass only; it should not train or authorize training."
    ],
    failures
  };

  await writeJson(OUTPUT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
