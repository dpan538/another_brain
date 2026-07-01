#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_PATH = "artifacts/training_os/small_decoder_pilot/r25x/r25x_r25s_best_rows.json";
const R25S_DATASET_PATH = "artifacts/training_os/small_decoder_pilot/r25s/r25s_dataset_report.json";
const R25S_PLAN_PATH = "artifacts/training_os/small_decoder_pilot/r25r/r25s_balanced_dataset_plan.json";
const R25P_DATASET_PATH = "artifacts/training_os/small_decoder_pilot/r25p/r25p_dataset_report.json";
const TRAIN_PATH = "training/llm_corpus/r25l_train.jsonl";
const DEV_PATH = "training/llm_corpus/r25l_dev.jsonl";
const HELDOUT_PATH = "training/llm_corpus/r25l_heldout.jsonl";
const WEAK_BUCKETS = new Set([
  "release_packaging_boundary",
  "toy_training_boundary",
  "verify_draft",
  "from_scratch_training_direction",
  "zh",
  "mixed"
]);

async function exists(path) {
  try {
    await access(resolve(ROOT, path));
    return true;
  } catch {
    return false;
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

async function readJsonIfPresent(path) {
  return (await exists(path)) ? readJson(path) : null;
}

async function readJsonl(path) {
  const text = await readFile(resolve(ROOT, path), "utf8");
  return text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
}

async function writeJson(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value = String(typeof key === "function" ? key(row) : row[key] || "unknown");
    counts[value] = (counts[value] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function selectedIdsFromPlan(plan, split) {
  const summary = plan?.split_summaries?.[split];
  if (Array.isArray(summary?.row_ids)) return summary.row_ids;
  if (Array.isArray(plan?.[`${split}_row_ids`])) return plan[`${split}_row_ids`];
  return [];
}

function rowBuckets(row) {
  return new Set([row.language, row.task_type, row.task_family, ...(row.policy_tags || [])].map(String));
}

function weakBucketCounts(rows) {
  const counts = {};
  for (const bucket of WEAK_BUCKETS) counts[bucket] = 0;
  for (const row of rows) {
    const buckets = rowBuckets(row);
    for (const bucket of WEAK_BUCKETS) {
      if (buckets.has(bucket)) counts[bucket] += 1;
    }
  }
  return counts;
}

function highValuePatterns(rows) {
  return rows
    .filter((row) => [...rowBuckets(row)].some((bucket) => WEAK_BUCKETS.has(bucket)))
    .slice(0, 16)
    .map((row) => ({
      sample_id: row.sample_id,
      language: row.language,
      task_type: row.task_type,
      task_family: row.task_family,
      target_chars: String(row.target_answer || "").length,
      rejected_answer_count: Array.isArray(row.rejected_answers) ? row.rejected_answers.length : 0,
      matching_focus_buckets: [...rowBuckets(row)].filter((bucket) => WEAK_BUCKETS.has(bucket))
    }));
}

function targetPattern(row) {
  return String(row.target_answer || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/r25l_[a-z0-9_]+_(?:train|dev|heldout)_\d+/g, "sample_id")
    .replace(/\b(?:train|dev|heldout)\/\d{3}\b/g, "split_marker")
    .replace(/\d+/g, "0")
    .replace(/\s+/g, " ")
    .trim();
}

function repeatedTemplateRisk(rows) {
  const patterns = new Map();
  for (const row of rows) {
    const key = targetPattern(row);
    if (!patterns.has(key)) patterns.set(key, []);
    patterns.get(key).push(row.sample_id);
  }
  const repeated = [...patterns.entries()]
    .filter(([, ids]) => ids.length > 4)
    .map(([pattern, ids]) => ({ normalized_pattern_preview: pattern.slice(0, 180), count: ids.length, sample_ids: ids.slice(0, 20) }))
    .sort((a, b) => b.count - a.count);
  return {
    repeated_pattern_groups: repeated.length,
    max_group_size: repeated[0]?.count || 0,
    top_groups: repeated.slice(0, 10)
  };
}

function compareCounts(current, baseline) {
  const keys = new Set([...Object.keys(current || {}), ...Object.keys(baseline || {})]);
  const out = {};
  for (const key of [...keys].sort()) {
    out[key] = {
      r25s: current?.[key] || 0,
      r25p: baseline?.[key] || 0,
      delta: (current?.[key] || 0) - (baseline?.[key] || 0)
    };
  }
  return out;
}

async function main() {
  const dataset = await readJsonIfPresent(R25S_DATASET_PATH);
  const plan = await readJsonIfPresent(R25S_PLAN_PATH);
  const r25pDataset = await readJsonIfPresent(R25P_DATASET_PATH);
  const trainRows = await readJsonl(TRAIN_PATH);
  const devRows = await readJsonl(DEV_PATH);
  const heldoutRows = await readJsonl(HELDOUT_PATH);
  const byId = new Map([...trainRows, ...devRows, ...heldoutRows].map((row) => [row.sample_id, row]));
  const trainIds = selectedIdsFromPlan(plan, "train");
  const devIds = selectedIdsFromPlan(plan, "dev");
  const heldoutIds = selectedIdsFromPlan(plan, "heldout");
  const trainSelected = trainIds.map((id) => byId.get(id)).filter(Boolean);
  const devSelected = devIds.map((id) => byId.get(id)).filter(Boolean);
  const heldoutSelected = heldoutIds.map((id) => byId.get(id)).filter(Boolean);
  const allSelected = [...trainSelected, ...devSelected, ...heldoutSelected];
  const fallbackUsed = trainIds.length === 0 || devIds.length === 0 || heldoutIds.length === 0;

  const r25sLanguage = countBy(trainSelected, "language");
  const r25sTaskType = countBy(trainSelected, "task_type");
  const r25sFamily = countBy(trainSelected, "task_family");
  const r25pComparison = r25pDataset ? {
    train_sequence_delta: Number(dataset?.train_sequences || trainSelected.length) - Number(r25pDataset.train_sequences || 0),
    dev_sequence_delta: Number(dataset?.dev_sequences || devSelected.length) - Number(r25pDataset.dev_sequences || 0),
    heldout_sequence_delta: Number(dataset?.heldout_sequences_prepared || heldoutSelected.length) - Number(r25pDataset.heldout_sequences_prepared || 0)
  } : null;

  const report = {
    ok: !fallbackUsed && allSelected.length > 0,
    skipped: false,
    training_ran: false,
    source: dataset?.ok ? "r25s_dataset_report_plus_r25r_sampling_plan" : "r25r_sampling_plan",
    run_id: "r25s_data_first_balanced_192",
    row_counts: {
      train: trainSelected.length,
      dev: devSelected.length,
      heldout: heldoutSelected.length
    },
    dataset_report_counts: dataset ? {
      train_rows_used: dataset.train_rows_used,
      dev_rows_used: dataset.dev_rows_used,
      heldout_rows_prepared: dataset.heldout_rows_prepared,
      train_sequences: dataset.train_sequences,
      dev_sequences: dataset.dev_sequences,
      heldout_sequences_prepared: dataset.heldout_sequences_prepared,
      balanced_sampling_used: dataset.balanced_sampling_used === true
    } : null,
    train_row_ids: trainIds,
    dev_row_ids: devIds,
    heldout_row_ids: heldoutIds,
    language_balance: r25sLanguage,
    task_type_balance: r25sTaskType,
    family_balance: r25sFamily,
    weak_bucket_counts: weakBucketCounts(trainSelected),
    high_value_row_patterns: highValuePatterns(trainSelected),
    repeated_template_risk: repeatedTemplateRisk(trainSelected),
    comparison_to_r25p_dataset: r25pComparison,
    comparison_to_r25p_focus_buckets: r25pComparison ? compareCounts(weakBucketCounts(trainSelected), {}) : null,
    split_overlap: {
      train_dev: trainIds.filter((id) => devIds.includes(id)),
      train_heldout: trainIds.filter((id) => heldoutIds.includes(id)),
      dev_heldout: devIds.filter((id) => heldoutIds.includes(id))
    },
    failures: fallbackUsed ? [{ code: "r25s_sampling_plan_row_ids_missing" }] : [],
    notes: [
      "R25X best-row analysis is read-only and does not train.",
      "R25S selected rows remain split-separated through the R25R balanced sampling plan.",
      "Future R25Y should preserve the R25S one-layer architecture while tightening repetition and regularization."
    ]
  };
  report.ok = report.ok && report.split_overlap.train_dev.length === 0 && report.split_overlap.train_heldout.length === 0 && report.split_overlap.dev_heldout.length === 0;
  await writeJson(OUTPUT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
