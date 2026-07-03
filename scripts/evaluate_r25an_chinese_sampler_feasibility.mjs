#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS_DIR = resolve(ROOT, "training/llm_corpus");
const REPORT_PATH = "artifacts/training_os/corpus_review/r25an/r25an_chinese_sampler_feasibility.json";
const SUMMARY_PATH = "docs/R25AN_CHINESE_SAMPLER_FEASIBILITY_SUMMARY.md";
const PLANS = [
  { name: "256_64_64", train: 256, dev: 64, heldout: 64 },
  { name: "384_96_96", train: 384, dev: 96, heldout: 96 },
  { name: "512_128_128", train: 512, dev: 128, heldout: 128 }
];

function normalizeTarget(text = "") {
  return String(text || "")
    .normalize("NFC")
    .replace(/[，。！？；：、,.!?;:()[\]{}"'“”‘’]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase()
    .trim();
}

function hash(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

function countKey(map, key, inc = 1) {
  const value = key === undefined || key === null || key === "" ? "unspecified" : String(key);
  map[value] = (map[value] || 0) + inc;
}

async function readRows() {
  const files = (await readdir(CORPUS_DIR)).filter((file) => file.endsWith(".jsonl")).sort();
  const rows = [];
  for (const file of files) {
    const text = await readFile(join(CORPUS_DIR, file), "utf8");
    for (const [index, line] of text.split(/\r?\n/).entries()) {
      if (!line.trim()) continue;
      rows.push({ ...JSON.parse(line), __file: file, __line: index + 1 });
    }
  }
  return rows;
}

async function writeJson(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(path, text) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, text, "utf8");
}

function languageNeed(total) {
  const zh = Math.ceil(total * 0.7);
  const mixed = Math.round(total * 0.2);
  const en = total - zh - mixed;
  return { zh, mixed, en };
}

function uniqueRows(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const key = normalizeTarget(row.target_answer || "") || `${row.sample_id}:${row.__file}:${row.__line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out.sort((a, b) => hash(`${a.sample_id}:${a.target_answer}`).localeCompare(hash(`${b.sample_id}:${b.target_answer}`)));
}

function selectRows(pool, count) {
  return pool.slice(0, count);
}

function summarizeSelection(rows) {
  const transformationCounts = {};
  const personalTargetCounts = {};
  const provenanceCounts = {};
  const sourceCategoryCounts = {};
  for (const row of rows) {
    countKey(transformationCounts, row.transformation_type || row.task_family || "legacy_task_family");
    for (const target of Array.isArray(row.personal_color_targets) ? row.personal_color_targets : []) countKey(personalTargetCounts, target);
    countKey(provenanceCounts, row.provenance?.source_type || "unknown");
    countKey(sourceCategoryCounts, row.source_category || "legacy_or_unspecified");
  }
  return { transformationCounts, personalTargetCounts, provenanceCounts, sourceCategoryCounts };
}

function evaluateSplit(rows, split, total) {
  const need = languageNeed(total);
  const available = {};
  const selected = [];
  const missing = {};
  for (const language of ["zh", "mixed", "en"]) {
    const pool = uniqueRows(rows.filter((row) => row.split === split && row.language === language));
    available[language] = pool.length;
    const chosen = selectRows(pool, need[language]);
    selected.push(...chosen);
    if (pool.length < need[language]) missing[language] = need[language] - pool.length;
  }
  const summary = summarizeSelection(selected);
  return {
    split,
    requested_rows: total,
    required_language_counts: need,
    available_unique_rows_by_language: available,
    selected_rows: selected.length,
    repeated_row_risk_without_replacement: Object.keys(missing).length ? "high" : "low",
    missing_language_rows: missing,
    personal_target_counts: summary.personalTargetCounts,
    transformation_type_counts: summary.transformationCounts,
    provenance_counts: summary.provenanceCounts,
    source_category_counts: summary.sourceCategoryCounts,
    selected_target_hashes: selected.map((row) => hash(normalizeTarget(row.target_answer || "")))
  };
}

function overlapCount(left, right) {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item)).length;
}

async function main() {
  const rows = await readRows();
  const bySplitLanguage = {};
  for (const split of ["train", "dev", "heldout"]) {
    bySplitLanguage[split] = {};
    for (const language of ["zh", "mixed", "en"]) {
      bySplitLanguage[split][language] = uniqueRows(rows.filter((row) => row.split === split && row.language === language)).length;
    }
  }

  const planReports = [];
  for (const plan of PLANS) {
    const train = evaluateSplit(rows, "train", plan.train);
    const dev = evaluateSplit(rows, "dev", plan.dev);
    const heldout = evaluateSplit(rows, "heldout", plan.heldout);
    const overlaps = {
      train_dev_target_overlap: overlapCount(train.selected_target_hashes, dev.selected_target_hashes),
      train_heldout_target_overlap: overlapCount(train.selected_target_hashes, heldout.selected_target_hashes),
      dev_heldout_target_overlap: overlapCount(dev.selected_target_hashes, heldout.selected_target_hashes)
    };
    const splitLeakageRisk = Object.values(overlaps).some((count) => count > 0) ? "review_needed" : "low";
    const repeatedRisk = [train, dev, heldout].some((item) => item.repeated_row_risk_without_replacement !== "low") ? "high" : "low";
    planReports.push({
      plan: plan.name,
      requested_counts: { train: plan.train, dev: plan.dev, heldout: plan.heldout },
      splits: { train, dev, heldout },
      split_leakage_risk: splitLeakageRisk,
      split_target_overlaps: overlaps,
      repeated_row_risk: repeatedRisk,
      feasible_without_replacement: repeatedRisk === "low" && splitLeakageRisk === "low"
    });
  }

  let recommendation = "sampler_ready_for_bounded_microcycle";
  if (planReports.some((plan) => !plan.feasible_without_replacement)) recommendation = "sampler_ready_but_needs_cap";
  if (!planReports[0]?.feasible_without_replacement) recommendation = "corpus_needs_more_zh_rows";

  const report = {
    ok: planReports.every((plan) => plan.feasible_without_replacement),
    phase: "R25AN",
    sampler_target: { zh_min: 0.7, mixed_target: 0.2, en_max: 0.1 },
    available_unique_rows_by_split_language: bySplitLanguage,
    plans: planReports.map((plan) => {
      const { splits, ...safe } = plan;
      return {
        ...safe,
        splits: Object.fromEntries(Object.entries(splits).map(([key, value]) => {
          const { selected_target_hashes, ...rest } = value;
          return [key, rest];
        }))
      };
    }),
    recommendation,
    safety: {
      decoder_training_ran: false,
      small_pilot_training_ran: false,
      phase4_scaled_training_ran: false,
      training_dataset_written: false,
      private_sources_read: false,
      root_pdf_docx_parsed: false,
      data_public_ingestion_parsed: false
    }
  };

  await writeJson(REPORT_PATH, report);
  const rowsFor = (plan, split) => plan.splits[split];
  const summary = `# R25AN Chinese Sampler Feasibility Summary

R25AN simulated zh-first sampling plans from tracked \`training/llm_corpus/*.jsonl\` only. It did not write training datasets and did not train a decoder.

## Recommendation

- ${recommendation}

## Plans

${report.plans.map((plan) => `- ${plan.plan}: train ${plan.requested_counts.train}, dev ${plan.requested_counts.dev}, heldout ${plan.requested_counts.heldout}; feasible without replacement: ${plan.feasible_without_replacement}; train need zh/mixed/en ${rowsFor(plan, "train").required_language_counts.zh}/${rowsFor(plan, "train").required_language_counts.mixed}/${rowsFor(plan, "train").required_language_counts.en}`).join("\n")}

## Boundary

Sampler readiness is not training approval. Any R25AO micro-cycle still requires a fresh explicit approval, and phase_4 remains blocked.
`;
  await writeText(SUMMARY_PATH, summary);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
