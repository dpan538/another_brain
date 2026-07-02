#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const OUTPUT_PATH = "artifacts/training_os/small_decoder_pilot/r25ab/r25ab_chinese_first_corpus_audit.json";
const SOURCES = [
  { split: "train", path: "training/llm_corpus/r25l_train.jsonl" },
  { split: "dev", path: "training/llm_corpus/r25l_dev.jsonl" },
  { split: "heldout", path: "training/llm_corpus/r25l_heldout.jsonl" }
];
const TARGET = { zh_min: 0.7, mixed_target: 0.2, en_max: 0.1 };

function emptyCounts() {
  return { zh: 0, mixed: 0, en: 0, other: 0, total: 0 };
}

function add(counts, language) {
  const key = ["zh", "mixed", "en"].includes(language) ? language : "other";
  counts[key] += 1;
  counts.total += 1;
}

function percentages(counts) {
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

async function main() {
  const bySplit = {};
  const overall = emptyCounts();
  const failures = [];

  for (const source of SOURCES) {
    const rows = await readJsonl(source.path);
    const counts = emptyCounts();
    for (const row of rows) {
      add(counts, row.language);
      add(overall, row.language);
      if (row.contains_private_data === true) {
        failures.push({ code: "private_data_flagged_in_r25l_row", split: source.split, sample_id: row.sample_id || null });
      }
    }
    bySplit[source.split] = {
      path: source.path,
      counts,
      share: percentages(counts)
    };
  }

  const share = percentages(overall);
  const nearBalancedThirds = Math.abs(share.zh - (1 / 3)) < 0.04 &&
    Math.abs(share.mixed - (1 / 3)) < 0.04 &&
    Math.abs(share.en - (1 / 3)) < 0.04;
  const meetsChineseFirstTarget = share.zh >= TARGET.zh_min && share.en <= TARGET.en_max;

  const report = {
    ok: failures.length === 0,
    audit_id: "r25ab_chinese_first_corpus_audit",
    training_ran: false,
    corpus_rewritten: false,
    corpus_generated: false,
    sources_read: SOURCES.map((source) => source.path),
    target_distribution: {
      zh_min: TARGET.zh_min,
      mixed_target: TARGET.mixed_target,
      en_max: TARGET.en_max
    },
    current_distribution: {
      counts: overall,
      share
    },
    by_split: bySplit,
    chinese_first_target_met: meetsChineseFirstTarget,
    current_r25l_is_balanced_thirds: nearBalancedThirds,
    current_r25l_insufficient_for_new_chinese_first_target: !meetsChineseFirstTarget,
    recommendation: meetsChineseFirstTarget
      ? "current_mix_meets_chinese_first_target"
      : "future_r25ac_sampling_should_upsample_zh_and_mixed_and_cap_en",
    notes: [
      "R25AB audit reads R25L corpus files only.",
      "The audit does not train, rewrite corpus, generate corpus, or create weights.",
      "If R25L remains near one third per language bucket, it is useful history but insufficient for the new Chinese-first target."
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
