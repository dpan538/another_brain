#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const OUTPUT_PATH = "artifacts/training_os/small_decoder_pilot/r25ad/r25ad_personal_target_coverage.json";
const SOURCES = [
  { split: "train", path: "training/llm_corpus/r25l_train.jsonl" },
  { split: "dev", path: "training/llm_corpus/r25l_dev.jsonl" },
  { split: "heldout", path: "training/llm_corpus/r25l_heldout.jsonl" }
];
const TARGETS = [
  "project_continuation",
  "repair_after_weak_answer",
  "local_first_static_browser_reasoning",
  "style_preference",
  "tool_status_honesty",
  "bounded_judgment"
];
const TARGET_MAP = {
  project_continuation: new Set(["training_progress_truth", "approval_marker_boundary", "project_continuation"]),
  repair_after_weak_answer: new Set(["fallback_firewall", "heldout_regression", "repair_after_rejection", "rejected_answer_learning", "repair_draft"]),
  local_first_static_browser_reasoning: new Set(["static_browser_runtime", "no_backend_policy", "runtime_worker_boundary", "same_origin_assets", "static_cache_boundary", "static_release_disabled", "static_browser_release"]),
  style_preference: new Set(["mobile_response_shape", "dialogue_density", "bilingual_following", "mixed_context_followup", "reviewer_reportability", "short_direct", "mobile_compact", "boundary_first", "evidence_first", "repair_mode", "reviewer_note"]),
  tool_status_honesty: new Set(["training_progress_truth", "approval_marker_boundary", "no_claimed_execution"]),
  bounded_judgment: new Set(["fallback_firewall", "approval_marker_boundary", "privacy_boundary", "heldout_regression", "constraint_preservation", "provenance_review", "evidence_absence_unknown", "anti_answer_bank"])
};

function emptyLanguageCounts() {
  return { zh: 0, mixed: 0, en: 0, other: 0, total: 0 };
}

function countLanguage(counts, language) {
  const key = ["zh", "mixed", "en"].includes(language) ? language : "other";
  counts[key] += 1;
  counts.total += 1;
}

async function readJsonIfPresent(path) {
  try {
    return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
  } catch {
    return null;
  }
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

function valuesForTargeting(row) {
  return [
    row.task_family,
    row.task_type,
    row.style_variant,
    ...(Array.isArray(row.policy_tags) ? row.policy_tags : []),
    ...(Array.isArray(row.constraints) ? row.constraints : [])
  ].filter(Boolean).map((value) => String(value));
}

function rowTargets(row) {
  const values = valuesForTargeting(row);
  return TARGETS.filter((target) => values.some((value) => TARGET_MAP[target].has(value)));
}

function collectKeyViolations(value, path = []) {
  const violations = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => violations.push(...collectKeyViolations(item, [...path, String(index)])));
    return violations;
  }
  if (!value || typeof value !== "object") return violations;
  for (const [key, item] of Object.entries(value)) {
    if (/^(chain_of_thought|hidden_prompt|system_prompt|private_memory|raw_private_data)$/i.test(key)) {
      violations.push({ key, path: path.concat(key).join(".") });
    }
    violations.push(...collectKeyViolations(item, [...path, key]));
  }
  return violations;
}

function collectStrings(value, out = []) {
  if (typeof value === "string") {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, out));
    return out;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectStrings(item, out));
  }
  return out;
}

function summarizeLengths(rows) {
  const lengths = rows.map((row) => String(row.target_answer || "").length).filter((length) => length > 0);
  if (!lengths.length) return { min: 0, mean: 0, max: 0 };
  return {
    min: Math.min(...lengths),
    mean: lengths.reduce((sum, value) => sum + value, 0) / lengths.length,
    max: Math.max(...lengths)
  };
}

function duplicateRisk(rows) {
  const counts = new Map();
  for (const row of rows) {
    const key = String(row.target_answer || "");
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const duplicates = [...counts.values()].filter((count) => count > 1);
  const maxExactDuplicateCount = duplicates.length ? Math.max(...duplicates) : 1;
  return {
    exact_duplicate_answers: duplicates.reduce((sum, count) => sum + count, 0),
    max_exact_duplicate_count: maxExactDuplicateCount,
    max_exact_duplicate_share: rows.length ? maxExactDuplicateCount / rows.length : 0
  };
}

async function main() {
  const rowsBySplit = {};
  const allRows = [];
  const hardFailures = [];
  const warnings = [];

  for (const source of SOURCES) {
    const rows = await readJsonl(source.path);
    rowsBySplit[source.split] = rows;
    allRows.push(...rows.map((row) => ({ ...row, source_path: source.path })));
  }

  const splitSampleIds = Object.fromEntries(Object.entries(rowsBySplit).map(([split, rows]) => [
    split,
    new Set(rows.map((row) => row.sample_id).filter(Boolean))
  ]));
  for (const [left, right] of [["train", "dev"], ["train", "heldout"], ["dev", "heldout"]]) {
    const overlap = [...splitSampleIds[left]].filter((id) => splitSampleIds[right].has(id));
    if (overlap.length) hardFailures.push({ code: "sample_id_overlap_across_splits", left, right, count: overlap.length, examples: overlap.slice(0, 10) });
  }

  for (const row of allRows) {
    if (row.contains_private_data === true) hardFailures.push({ code: "private_data_flagged_in_row", sample_id: row.sample_id || null });
    if (row.split && row.sample_id && !String(row.sample_id).includes(`_${row.split}_`)) {
      hardFailures.push({ code: "sample_id_split_mismatch", split: row.split, sample_id: row.sample_id });
    }
    for (const violation of collectKeyViolations(row)) {
      hardFailures.push({ code: "forbidden_private_or_reasoning_key_present", sample_id: row.sample_id || null, ...violation });
    }
    for (const text of collectStrings(row)) {
      if (/\/Users\/|BEGIN PRIVATE KEY|api[_-]?key|password|secret/i.test(text)) {
        hardFailures.push({ code: "private_path_or_secret_like_text_present", sample_id: row.sample_id || null });
        break;
      }
      if (/(^|\/)evals\//i.test(text)) {
        hardFailures.push({ code: "eval_prompt_source_reference_present", sample_id: row.sample_id || null });
        break;
      }
    }
  }

  const coverageBySplit = {};
  for (const [split, rows] of Object.entries(rowsBySplit)) {
    const languageCounts = emptyLanguageCounts();
    const targetCounts = Object.fromEntries(TARGETS.map((target) => [target, { rows: 0, zh: 0, mixed: 0, en: 0, other: 0 }]));
    for (const row of rows) {
      countLanguage(languageCounts, row.language);
      for (const target of rowTargets(row)) {
        targetCounts[target].rows += 1;
        const lang = ["zh", "mixed", "en"].includes(row.language) ? row.language : "other";
        targetCounts[target][lang] += 1;
      }
    }
    for (const [target, counts] of Object.entries(targetCounts)) {
      if (split === "train" && counts.rows < 20) warnings.push({ code: "low_train_personal_target_count", target, rows: counts.rows });
      if (split !== "train" && counts.rows === 0) warnings.push({ code: "missing_eval_personal_target_bucket", split, target });
    }
    coverageBySplit[split] = {
      row_count: rows.length,
      language_counts: languageCounts,
      target_counts: targetCounts,
      target_answer_length: summarizeLengths(rows),
      repetition_risk: duplicateRisk(rows)
    };
  }

  const r25acDataset = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25ac/r25ac_dataset_report.json");
  const r25acRun = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25ac/r25ac_small_decoder_run_report.json");
  const actualCoverage = r25acRun?.personal_target_coverage || r25acDataset?.personal_target_coverage || {};
  const actualTargetCoverage = Object.fromEntries(TARGETS.map((target) => [
    target,
    {
      rows: Number(actualCoverage[target]?.rows || 0),
      fabricated: actualCoverage[target]?.fabricated === true,
      sample_ids_preview: Array.isArray(actualCoverage[target]?.sample_ids) ? actualCoverage[target].sample_ids.slice(0, 12) : []
    }
  ]));
  for (const [target, value] of Object.entries(actualTargetCoverage)) {
    if (value.rows <= 0) hardFailures.push({ code: "r25ac_actual_target_missing", target });
    if (value.fabricated) hardFailures.push({ code: "r25ac_actual_target_fabricated", target });
  }

  const report = {
    ok: hardFailures.length === 0,
    report_id: "r25ad_personal_target_coverage",
    training_ran: false,
    corpus_rewritten: false,
    corpus_generated: false,
    sources_read: SOURCES.map((source) => source.path),
    target_policy: {
      personal_color_sources_must_be_reviewed_public_or_project_authored: true,
      private_raw_data_allowed: false,
      chain_of_thought_allowed: false,
      exact_eval_prompt_copies_allowed: false
    },
    r25ac_actual_personal_target_coverage: actualTargetCoverage,
    r25ac_actual_personal_target_coverage_complete: Object.values(actualTargetCoverage).every((value) => value.rows > 0 && value.fabricated === false),
    r25l_structural_coverage_by_split: coverageBySplit,
    hard_failures: hardFailures,
    warnings,
    status: hardFailures.length === 0 ? "passed_no_private_raw_data_or_eval_prompt_overlap_detected" : "failed",
    recommendation: warnings.length
      ? "expand_reviewed_zh_and_mixed_personal_style_rows_before_next_microcycle"
      : "coverage_ready_for_reviewed_corpus_expansion_design",
    notes: [
      "This audit reads R25L corpus files and existing ignored R25AC reports only.",
      "It checks structural personal target coverage; it does not claim private memory or personal knowledge exists.",
      "R25AE should add reviewed Chinese-first project/style rows rather than repeating the same sampled rows."
    ]
  };

  await writeJson(OUTPUT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
