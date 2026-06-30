#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = "training/from_scratch/small_decoder_r25s_sampling_config.json";
const R25Q_BREAKDOWN_PATH = "artifacts/training_os/small_decoder_pilot/r25q/r25q_heldout_breakdown.json";
const OUTPUT_PATH = "artifacts/training_os/small_decoder_pilot/r25r/r25s_balanced_dataset_plan.json";

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

function hashString(value, seed) {
  let hash = Number(seed) || 0;
  for (const ch of String(value)) {
    hash = ((hash << 5) - hash + ch.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = String(row[key] || "unknown");
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function intersectCount(a, b) {
  const bSet = new Set(b);
  return a.filter((item) => bSet.has(item)).length;
}

function targetByLanguage(total, languages) {
  const base = Math.floor(total / languages.length);
  let remainder = total % languages.length;
  return Object.fromEntries(languages.map((language) => {
    const target = base + (remainder > 0 ? 1 : 0);
    remainder -= 1;
    return [language, target];
  }));
}

function rowSort(seed, weakTaskTypes, weakFamilies) {
  const weakTasks = new Set(weakTaskTypes);
  const weakFamilySet = new Set(weakFamilies);
  return (a, b) => {
    const aWeakFamily = weakFamilySet.has(a.task_family) ? 0 : 1;
    const bWeakFamily = weakFamilySet.has(b.task_family) ? 0 : 1;
    if (aWeakFamily !== bWeakFamily) return aWeakFamily - bWeakFamily;
    const aWeakTask = weakTasks.has(a.task_type) ? 0 : 1;
    const bWeakTask = weakTasks.has(b.task_type) ? 0 : 1;
    if (aWeakTask !== bWeakTask) return aWeakTask - bWeakTask;
    return hashString(a.sample_id, seed) - hashString(b.sample_id, seed);
  };
}

function pickFromPool({ pool, chosen, used, limit, predicate, sort }) {
  const candidates = pool.filter((row) => !used.has(row.sample_id) && predicate(row)).sort(sort);
  for (const row of candidates) {
    if (chosen.length >= limit) return;
    chosen.push(row);
    used.add(row.sample_id);
  }
}

function fillBalanced({ pool, chosen, used, limit, seed }) {
  while (chosen.length < limit) {
    const taskCounts = countBy(chosen, "task_type");
    const familyCounts = countBy(chosen, "task_family");
    const candidates = pool
      .filter((row) => !used.has(row.sample_id))
      .sort((a, b) => {
        const taskDelta = (taskCounts[a.task_type] || 0) - (taskCounts[b.task_type] || 0);
        if (taskDelta !== 0) return taskDelta;
        const familyDelta = (familyCounts[a.task_family] || 0) - (familyCounts[b.task_family] || 0);
        if (familyDelta !== 0) return familyDelta;
        return hashString(a.sample_id, seed) - hashString(b.sample_id, seed);
      });
    if (!candidates.length) break;
    chosen.push(candidates[0]);
    used.add(candidates[0].sample_id);
  }
}

function selectForLanguage({ rows, language, quota, weakTaskTypes, weakFamilies, seed, split }) {
  const pool = rows.filter((row) => row.language === language);
  const chosen = [];
  const used = new Set();
  const sort = rowSort(seed, weakTaskTypes, weakFamilies);
  const weakTaskTarget = split === "train" ? Math.max(1, Math.floor(quota / 8)) : Math.max(1, Math.floor(quota / 8));
  const weakFamilyTarget = split === "train" ? Math.max(1, Math.floor(quota / 8)) : Math.max(1, Math.floor(quota / 8));

  for (const taskType of weakTaskTypes) {
    pickFromPool({
      pool,
      chosen,
      used,
      limit: Math.min(quota, chosen.length + weakTaskTarget),
      predicate: (row) => row.task_type === taskType,
      sort
    });
  }

  for (const family of weakFamilies) {
    pickFromPool({
      pool,
      chosen,
      used,
      limit: Math.min(quota, chosen.length + weakFamilyTarget),
      predicate: (row) => row.task_family === family,
      sort
    });
  }

  fillBalanced({ pool, chosen, used, limit: quota, seed });
  return chosen;
}

function selectRows({ rows, total, languages, weakTaskTypes, weakFamilies, seed, split }) {
  const languageTargets = targetByLanguage(total, languages);
  const selected = [];
  for (const language of languages) {
    selected.push(...selectForLanguage({
      rows,
      language,
      quota: languageTargets[language],
      weakTaskTypes,
      weakFamilies,
      seed,
      split
    }));
  }

  if (selected.length < total) {
    const used = new Set(selected.map((row) => row.sample_id));
    const remaining = rows
      .filter((row) => !used.has(row.sample_id))
      .sort((a, b) => hashString(a.sample_id, seed) - hashString(b.sample_id, seed));
    for (const row of remaining) {
      if (selected.length >= total) break;
      selected.push(row);
      used.add(row.sample_id);
    }
  }

  return selected.slice(0, total).sort((a, b) => a.sample_id.localeCompare(b.sample_id));
}

function splitOverlap(train, dev, heldout) {
  const trainIds = train.map((row) => row.sample_id);
  const devIds = dev.map((row) => row.sample_id);
  const heldoutIds = heldout.map((row) => row.sample_id);
  const trainTargets = train.map((row) => row.target_answer);
  const devTargets = dev.map((row) => row.target_answer);
  const heldoutTargets = heldout.map((row) => row.target_answer);
  return {
    train_dev_row_id_overlap_count: intersectCount(trainIds, devIds),
    train_heldout_row_id_overlap_count: intersectCount(trainIds, heldoutIds),
    dev_heldout_row_id_overlap_count: intersectCount(devIds, heldoutIds),
    train_dev_target_answer_overlap_count: intersectCount(trainTargets, devTargets),
    train_heldout_target_answer_overlap_count: intersectCount(trainTargets, heldoutTargets),
    dev_heldout_target_answer_overlap_count: intersectCount(devTargets, heldoutTargets)
  };
}

function summarize(selected) {
  return {
    language_counts: countBy(selected, "language"),
    task_type_counts: countBy(selected, "task_type"),
    family_counts: countBy(selected, "task_family"),
    row_ids: selected.map((row) => row.sample_id)
  };
}

async function main() {
  const config = await readJson(CONFIG_PATH);
  const breakdown = await readJsonIfPresent(R25Q_BREAKDOWN_PATH);
  const trainRows = await readJsonl(config.train_source);
  const devRows = await readJsonl(config.dev_source);
  const heldoutRows = await readJsonl(config.heldout_source);
  const failures = [];

  for (const row of trainRows) if (row.split !== "train") failures.push({ code: "train_source_contains_non_train_row", sample_id: row.sample_id });
  for (const row of devRows) if (row.split !== "dev") failures.push({ code: "dev_source_contains_non_dev_row", sample_id: row.sample_id });
  for (const row of heldoutRows) if (row.split !== "heldout") failures.push({ code: "heldout_source_contains_non_heldout_row", sample_id: row.sample_id });

  const strategy = config.sampling_strategy || {};
  const languages = strategy.balance_languages || ["zh", "mixed", "en"];
  const weakTaskTypes = strategy.upweight_task_types || [];
  const weakFamilies = strategy.upweight_families || [];
  const seed = Number(config.seed || 0);
  const train = selectRows({
    rows: trainRows,
    total: Number(config.max_train_rows),
    languages,
    weakTaskTypes,
    weakFamilies,
    seed,
    split: "train"
  });
  const dev = selectRows({
    rows: devRows,
    total: Number(config.max_dev_rows),
    languages,
    weakTaskTypes,
    weakFamilies,
    seed: seed + 1,
    split: "dev"
  });
  const heldout = selectRows({
    rows: heldoutRows,
    total: Number(config.max_heldout_rows),
    languages,
    weakTaskTypes,
    weakFamilies,
    seed: seed + 2,
    split: "heldout"
  });

  const overlap = splitOverlap(train, dev, heldout);
  if (Object.values(overlap).some((value) => value !== 0)) failures.push({ code: "split_overlap_detected", overlap });
  if (train.length !== Number(config.max_train_rows)) failures.push({ code: "train_row_count_mismatch", actual: train.length, expected: config.max_train_rows });
  if (dev.length !== Number(config.max_dev_rows)) failures.push({ code: "dev_row_count_mismatch", actual: dev.length, expected: config.max_dev_rows });
  if (heldout.length !== Number(config.max_heldout_rows)) failures.push({ code: "heldout_row_count_mismatch", actual: heldout.length, expected: config.max_heldout_rows });

  const trainSummary = summarize(train);
  const devSummary = summarize(dev);
  const heldoutSummary = summarize(heldout);
  const report = {
    ok: failures.length === 0,
    run_id: config.run_id,
    variant_id: config.variant_id,
    training_will_run: false,
    train_row_count: train.length,
    dev_row_count: dev.length,
    heldout_row_count: heldout.length,
    language_counts: trainSummary.language_counts,
    task_type_counts: trainSummary.task_type_counts,
    family_counts: trainSummary.family_counts,
    split_summaries: {
      train: trainSummary,
      dev: devSummary,
      heldout: heldoutSummary
    },
    weak_bucket_targets: {
      upweight_task_types: weakTaskTypes,
      upweight_families: weakFamilies,
      r25q_breakdown_available: Boolean(breakdown?.ok),
      r25q_overfit_context: breakdown?.heldout_loss ? "uses_r25q_heldout_breakdown_for_review_context_only" : "not_available_or_not_needed"
    },
    overlap,
    sources: {
      train_source: config.train_source,
      dev_source: config.dev_source,
      heldout_source: config.heldout_source,
      evals_read: false,
      root_documents_read: false,
      public_ingestion_read: false
    },
    product_model: false,
    release_checkpoint: false,
    notes: [
      "This is a deterministic sampling plan only and does not build a training dataset.",
      "Candidate train ids come only from the R25L train split.",
      "Candidate dev and heldout ids remain split-separated and are not used for training.",
      "Weak R25Q buckets are upweighted from train rows only for future reviewer consideration."
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
