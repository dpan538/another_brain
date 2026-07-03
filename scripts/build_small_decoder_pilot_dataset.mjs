#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { encodeDryrun } from "./train_tokenizer_dryrun.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RUN_CONFIG_PATH = "training/from_scratch/small_decoder_pilot_run_config.json";
const PRIVATE_PATH_RE = /\/Users\/|\/private\/var\/|\/Volumes\/|[A-Za-z]:\\Users\\/;
const FORBIDDEN_MARKER_RE = /chain[_ -]?of[_ -]?thought|hidden_prompt|system_prompt|raw_private_data|private_memory|local_user_path|api_key|BEGIN PRIVATE KEY|secret/i;
const FORBIDDEN_SOURCE_RE = /^(evals\/|data\/public_ingestion\/|knowledge_sources\/)|(?:^|\/)heldout\.jsonl$|\.(pdf|docx)$/i;

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

async function writeJson(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readRows(path) {
  const text = await readFile(resolve(ROOT, path), "utf8");
  const rows = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    rows.push({ ...JSON.parse(line), __line: index + 1, __source: path });
  }
  return rows;
}

function argValue(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function runPrefix(config) {
  const runId = String(config.run_id || "");
  if (runId.startsWith("r25ao_")) return "r25ao";
  if (runId.startsWith("r25ac_")) return "r25ac";
  if (runId.startsWith("r25y_")) return "r25y";
  if (runId.startsWith("r25v_")) return "r25v";
  if (runId.startsWith("r25s_")) return "r25s";
  if (runId.startsWith("r25p_")) return "r25p";
  return "r25m";
}

const PERSONAL_TARGET_FAMILIES = {
  project_continuation: [
    "recovery_candidate_green",
    "training_progress_truth",
    "from_scratch_training_direction",
    "approval_marker_boundary",
    "small_pilot_planning"
  ],
  repair_after_weak_answer: [
    "repair_after_rejection",
    "rejected_answer_learning",
    "heldout_regression",
    "fallback_firewall"
  ],
  local_first_static_browser_reasoning: [
    "static_browser_runtime",
    "no_backend_policy",
    "same_origin_assets",
    "static_cache_boundary",
    "runtime_worker_boundary",
    "release_packaging_boundary"
  ],
  style_preference: [
    "dialogue_density",
    "mobile_response_shape",
    "reviewer_reportability",
    "bilingual_following",
    "mixed_context_followup"
  ],
  tool_status_honesty: [
    "no_claimed_execution",
    "training_progress_truth",
    "approval_marker_boundary",
    "checkpoint_hygiene",
    "artifact_admission"
  ],
  bounded_judgment: [
    "constraint_preservation",
    "evidence_absence_unknown",
    "fallback_firewall",
    "privacy_boundary",
    "provenance_review",
    "product_claim_boundary"
  ]
};

function normalizeText(value = "") {
  return String(value || "").normalize("NFC").replace(/\s+/g, " ").trim();
}

function shortText(value = "", maxChars = 420) {
  const normalized = normalizeText(value);
  return normalized.length > maxChars ? normalized.slice(0, maxChars).trim() : normalized;
}

function collectSafeText(row) {
  const out = [];
  for (const message of Array.isArray(row.messages) ? row.messages : []) {
    const role = typeof message?.role === "string" ? message.role : "message";
    if (typeof message?.content === "string") out.push(`<${role}> ${shortText(message.content)}`);
  }
  for (const item of Array.isArray(row.constraints) ? row.constraints : []) {
    if (typeof item === "string") out.push(`<constraint> ${shortText(item, 220)}`);
  }
  for (const evidence of Array.isArray(row.retrieved_evidence) ? row.retrieved_evidence : []) {
    if (evidence?.contains_private_data === false && typeof evidence?.text === "string") {
      out.push(`<evidence> ${shortText(evidence.text, 260)}`);
    }
  }
  if (typeof row.target_answer === "string") out.push(`<assistant> ${shortText(row.target_answer)}`);
  return out.map(normalizeText).filter(Boolean);
}

function rowPersonalTargets(row, targets = []) {
  const family = String(row.task_family || "");
  const tags = new Set(Array.isArray(row.policy_tags) ? row.policy_tags : []);
  const explicitTargets = new Set(Array.isArray(row.personal_color_targets) ? row.personal_color_targets : []);
  const matched = [];
  for (const target of targets) {
    const families = PERSONAL_TARGET_FAMILIES[target] || [];
    if (explicitTargets.has(target) || families.includes(family) || families.some((item) => tags.has(item))) matched.push(target);
  }
  return matched;
}

function scanText(text, source, failures) {
  if (PRIVATE_PATH_RE.test(text)) failures.push({ code: "private_path_marker", source });
  if (FORBIDDEN_MARKER_RE.test(text)) failures.push({ code: "forbidden_training_marker", source });
}

function splitSources(config, split) {
  const plural = config[`${split}_sources`];
  const singular = config[`${split}_source`];
  const sources = Array.isArray(plural) ? plural : singular ? [singular] : [];
  return sources.map(String);
}

function sourceForbiddenForSplit(path, split) {
  if (!path) return true;
  if (!path.startsWith("training/llm_corpus/")) return true;
  if (/^(evals\/|data\/public_ingestion\/|knowledge_sources\/)|\.(pdf|docx)$/i.test(path)) return true;
  if (split !== "heldout" && /(?:^|\/).*heldout.*\.jsonl$/i.test(path)) return true;
  return false;
}

async function readRowsFromSources(sources) {
  const rows = [];
  for (const path of sources) rows.push(...(await readRows(path)));
  return rows;
}

function fixedLength(ids, maxContextTokens, padTokenId) {
  const clipped = ids.slice(0, maxContextTokens);
  const length = clipped.length;
  while (clipped.length < maxContextTokens) clipped.push(padTokenId);
  return { token_ids: clipped, token_count: length };
}

function buildSequences(rows, split, limit, sourcePath, tokenizer, tokenizerConfig, config, failures) {
  const sequences = [];
  const maxContextTokens = Number(config.max_context_tokens || 64);
  const padTokenId = tokenizer.vocab?.["<pad>"] ?? 0;
  for (const row of rows) {
    if (sequences.length >= limit) break;
    const rowSource = row.__source || sourcePath;
    if (row.split !== split) {
      failures.push({ code: "unexpected_row_split", source: `${rowSource}:${row.__line}`, expected: split, actual: row.split });
      continue;
    }
    if (row.contains_private_data !== false || row.provenance?.contains_private_data !== false) {
      failures.push({ code: "row_private_data_flag_not_false", source: `${rowSource}:${row.__line}` });
      continue;
    }
    const texts = collectSafeText(row);
    const joined = texts.join("\n");
    scanText(joined, `${rowSource}:${row.__line}`, failures);
    const ids = encodeDryrun(`<bos> ${joined} <eos>`, tokenizer, tokenizerConfig);
    if (ids.length < 3) {
      failures.push({ code: "pilot_sequence_too_short", source: `${sourcePath}:${row.__line}` });
      continue;
    }
    const fixed = fixedLength(ids, maxContextTokens, padTokenId);
    sequences.push({
      sample_id: row.sample_id || `r25m_${split}_${sequences.length + 1}`,
      source: rowSource,
      source_line: row.__line,
      split,
      language: row.language || "unknown",
      task_family: row.task_family || row.transformation_type || "unknown",
      task_type: row.task_type || row.transformation_type || "unknown",
      policy_tags: Array.isArray(row.policy_tags) ? row.policy_tags : [],
      personal_targets: rowPersonalTargets(row, config.personal_color_targets || []),
      safe_fields: ["messages", "constraints", "retrieved_evidence", "target_answer"],
      token_count: fixed.token_count,
      token_ids: fixed.token_ids
    });
  }
  return sequences;
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = typeof key === "function" ? key(row) : row[key];
    out[value || "unknown"] = (out[value || "unknown"] || 0) + 1;
  }
  return out;
}

function shareFromCounts(counts) {
  const total = Number(counts.total || 0);
  return {
    zh: total ? (counts.zh || 0) / total : 0,
    mixed: total ? (counts.mixed || 0) / total : 0,
    en: total ? (counts.en || 0) / total : 0,
    other: total ? (counts.other || 0) / total : 0
  };
}

function languageCounts(rows) {
  const counts = { zh: 0, mixed: 0, en: 0, other: 0, total: rows.length };
  for (const row of rows) {
    if (row.language === "zh") counts.zh += 1;
    else if (row.language === "mixed") counts.mixed += 1;
    else if (row.language === "en") counts.en += 1;
    else counts.other += 1;
  }
  return counts;
}

function targetLanguageCounts(limit, mixTarget) {
  const enMax = Math.floor(limit * Number(mixTarget?.en_max ?? 0.1));
  const zhMin = Math.ceil(limit * Number(mixTarget?.zh_min ?? 0.7));
  let mixedTarget = Math.round(limit * Number(mixTarget?.mixed_target ?? 0.2));
  if (zhMin + mixedTarget + enMax > limit) mixedTarget = Math.max(0, limit - zhMin - enMax);
  const zhTarget = limit - mixedTarget - enMax;
  return {
    zh: Math.max(zhMin, zhTarget),
    mixed: mixedTarget,
    en: enMax
  };
}

function stableScore(row, seed) {
  return stableHash(`${seed}:${row.sample_id || ""}:${row.__source || ""}:${row.__line || 0}`);
}

function personalScore(row, targets) {
  const matched = rowPersonalTargets(row, targets);
  const tagScore = Array.isArray(row.policy_tags) && row.policy_tags.includes("reviewer_note") ? 0.1 : 0;
  const reviewScore = row.review_status === "reviewed_for_training_corpus" ? 1 : 0;
  const provenanceSource = String(row.provenance?.source_type || row.provenance?.source || row.source_type || "");
  const repoScore = /repo_derived|project_authored/i.test(provenanceSource) ? 0.75 : 0;
  const repairScore = Array.isArray(row.rejected_answers) && row.rejected_answers.length ? 0.25 : 0;
  return matched.length + reviewScore + repoScore + repairScore + tagScore;
}

function rankRows(rows, targets, seed) {
  return [...rows].sort((left, right) => {
    const scoreDiff = personalScore(right, targets) - personalScore(left, targets);
    if (scoreDiff !== 0) return scoreDiff;
    return stableScore(left, seed).localeCompare(stableScore(right, seed));
  });
}

function selectRowsByChinesePersonalMix(rows, split, limit, config, failures) {
  const isChinesePersonalPilot = config.run_id?.startsWith("r25ac_") || config.run_id?.startsWith("r25ao_");
  if (!isChinesePersonalPilot) return rows;
  const targets = config.personal_color_targets || [];
  const mixTarget = config.sampler_target || config.language_mix_target || {};
  const desired = targetLanguageCounts(limit, mixTarget);
  const byLanguage = {
    zh: rows.filter((row) => row.language === "zh"),
    mixed: rows.filter((row) => row.language === "mixed"),
    en: rows.filter((row) => row.language === "en")
  };
  const enoughRows = Object.entries(desired).every(([language, count]) => byLanguage[language].length >= count);
  const selected = [];
  const selectedIds = new Set();
  const take = (language, count) => {
    for (const row of rankRows(byLanguage[language] || [], targets, config.seed ?? 29)) {
      if (selected.length >= limit || selectedIds.has(row.sample_id) || count <= 0) continue;
      selected.push(row);
      selectedIds.add(row.sample_id);
      count -= 1;
    }
    return count;
  };
  const missing = {
    zh: take("zh", desired.zh),
    mixed: take("mixed", desired.mixed),
    en: take("en", desired.en)
  };
  if (selected.length < limit) {
    for (const row of rankRows(rows, targets, config.seed ?? 29)) {
      if (selected.length >= limit) break;
      if (selectedIds.has(row.sample_id)) continue;
      selected.push(row);
      selectedIds.add(row.sample_id);
    }
  }
  const counts = languageCounts(selected);
  const share = shareFromCounts(counts);
  if (enoughRows) {
    if (share.zh < Number(mixTarget?.zh_min ?? 0.7)) failures.push({ code: `${runPrefix(config)}_zh_primary_target_not_met`, split, counts, share });
    if (share.en > Number(mixTarget?.en_max ?? 0.1)) failures.push({ code: `${runPrefix(config)}_en_cap_not_met`, split, counts, share });
  } else {
    failures.push({ code: `${runPrefix(config)}_language_pool_insufficient`, split, desired, available: Object.fromEntries(Object.entries(byLanguage).map(([language, list]) => [language, list.length])) });
  }
  return selected;
}

function splitOverlap(trainRows, devRows, heldoutRows) {
  const trainIds = new Set(trainRows.map((row) => row.sample_id).filter(Boolean));
  const devIds = new Set(devRows.map((row) => row.sample_id).filter(Boolean));
  const heldoutIds = new Set(heldoutRows.map((row) => row.sample_id).filter(Boolean));
  const trainDev = [...trainIds].filter((id) => devIds.has(id));
  const trainHeldout = [...trainIds].filter((id) => heldoutIds.has(id));
  const devHeldout = [...devIds].filter((id) => heldoutIds.has(id));
  return {
    train_dev_count: trainDev.length,
    train_heldout_count: trainHeldout.length,
    dev_heldout_count: devHeldout.length,
    any_overlap: trainDev.length + trainHeldout.length + devHeldout.length > 0
  };
}

function personalCoverage(rows, targets = []) {
  const coverage = {};
  for (const target of targets) {
    const matchedRows = rows.filter((row) => rowPersonalTargets(row, [target]).length > 0);
    coverage[target] = {
      rows: matchedRows.length,
      sample_ids: matchedRows.slice(0, 12).map((row) => row.sample_id),
      source: "task_family_or_policy_tags",
      fabricated: false
    };
  }
  return coverage;
}

async function readSamplingPlan(config, configPath) {
  const explicit = argValue("--sampling-plan", null);
  const planPath = explicit || config.sampling_plan || null;
  if (!planPath) return { planPath: null, plan: null };
  const plan = await readJson(planPath);
  if (config.run_id?.startsWith("r25s_") && plan.run_id !== config.run_id) {
    throw new Error(`Sampling plan run_id ${plan.run_id} does not match ${config.run_id} from ${configPath}`);
  }
  if (config.run_id?.startsWith("r25v_") && plan.run_id !== "r25s_data_first_balanced_192") {
    throw new Error(`R25V reuses the R25S balanced sampling plan; found ${plan.run_id} in ${planPath}`);
  }
  if (config.run_id?.startsWith("r25y_") && plan.run_id !== "r25s_data_first_balanced_192") {
    throw new Error(`R25Y data regularization reuses the R25S balanced sampling plan; found ${plan.run_id} in ${planPath}`);
  }
  return { planPath, plan };
}

function rowsFromPlan(rows, split, plan, failures) {
  if (!plan) return rows;
  const ids = plan.split_summaries?.[split]?.row_ids;
  if (!Array.isArray(ids)) {
    failures.push({ code: "sampling_plan_missing_split_row_ids", split });
    return rows;
  }
  const byId = new Map(rows.map((row) => [row.sample_id, row]));
  const selected = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      failures.push({ code: "sampling_plan_row_id_missing_from_source", split, sample_id: id });
      continue;
    }
    selected.push(row);
  }
  return selected;
}

function stableHash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function normalizeTarget(row) {
  return normalizeText(row.target_answer || "").toLowerCase();
}

function hasRejectedAnswer(row) {
  return Array.isArray(row.rejected_answers) && row.rejected_answers.length > 0;
}

function applyR25yRegularization(rows, split, config) {
  if (!config.run_id?.startsWith("r25y_") || split !== "train") {
    return { rows, stats: null };
  }
  const requested = Number(config.max_train_rows || rows.length);
  const plan = config.regularization_plan || {};
  let working = [...rows];
  const stats = {
    lower_learning_rate_than_r25s: Boolean(plan.lower_learning_rate_than_r25s),
    shuffle_train_rows: false,
    cap_repeated_targets: false,
    require_rejected_answer_examples: false,
    balance_focus_buckets: Boolean(plan.balance_focus_buckets),
    stop_if_dev_loss_worsens: "unsupported_by_current_bounded_runner_reported_only",
    compare_to_r25s: Boolean(plan.compare_to_r25s),
    unsupported: []
  };

  if (plan.shuffle_train_rows) {
    const seed = config.seed ?? 28;
    working.sort((left, right) => stableHash(`${seed}:${left.sample_id}`).localeCompare(stableHash(`${seed}:${right.sample_id}`)));
    stats.shuffle_train_rows = true;
  }

  if (plan.require_rejected_answer_examples) {
    working.sort((left, right) => Number(hasRejectedAnswer(right)) - Number(hasRejectedAnswer(left)));
    stats.require_rejected_answer_examples = true;
  }

  if (plan.cap_repeated_targets) {
    const selected = [];
    const counts = new Map();
    const pushIfUnder = (row, cap) => {
      const key = normalizeTarget(row) || `missing:${row.sample_id}`;
      const current = counts.get(key) || 0;
      if (current >= cap || selected.includes(row)) return;
      selected.push(row);
      counts.set(key, current + 1);
    };
    for (const row of working) pushIfUnder(row, 1);
    if (selected.length < requested) {
      for (const row of working) {
        if (selected.length >= requested) break;
        pushIfUnder(row, 2);
      }
    }
    working = selected;
    stats.cap_repeated_targets = true;
    stats.max_target_repeat_after_cap = Math.max(0, ...counts.values());
    stats.unique_target_answers_after_cap = counts.size;
  }

  if (plan.stop_if_dev_loss_worsens) {
    stats.unsupported.push("stop_if_dev_loss_worsens");
  }

  stats.rows_after_regularization = Math.min(working.length, requested);
  return { rows: working, stats };
}

async function main() {
  const failures = [];
  const forbidden_sources_touched = [];
  const configPath = argValue("--config", RUN_CONFIG_PATH);
  const config = await readJson(configPath);
  const prefix = runPrefix(config);
  const { planPath: samplingPlanPath, plan: samplingPlan } = await readSamplingPlan(config, configPath);
  const tokenizerConfig = await readJson(config.tokenizer_config);
  const artifactDir = tokenizerConfig.artifact_dir || "artifacts/training_os/tokenizer_dryrun/r25l";
  const tokenizerPath = `${artifactDir}/r25j_tokenizer.json`;
  const tokenizerReportPath = `${artifactDir}/r25j_tokenizer_report.json`;

  if (!(await exists(tokenizerPath))) failures.push({ code: "r25l_tokenizer_artifact_missing", path: tokenizerPath });
  if (!(await exists(tokenizerReportPath))) failures.push({ code: "r25l_tokenizer_report_missing", path: tokenizerReportPath });
  const trainSources = splitSources(config, "train");
  const devSources = splitSources(config, "dev");
  const heldoutSources = splitSources(config, "heldout");
  const allSourceEntries = [
    ...trainSources.map((path) => ({ path, split: "train" })),
    ...devSources.map((path) => ({ path, split: "dev" })),
    ...heldoutSources.map((path) => ({ path, split: "heldout" }))
  ];
  for (const { path, split } of allSourceEntries) {
    if (sourceForbiddenForSplit(path, split)) forbidden_sources_touched.push(path);
  }
  if (!config.run_id?.startsWith("r25ao_")) {
    if (config.train_source !== "training/llm_corpus/r25l_train.jsonl") failures.push({ code: "unexpected_train_source", path: config.train_source });
    if (config.dev_source !== "training/llm_corpus/r25l_dev.jsonl") failures.push({ code: "unexpected_dev_source", path: config.dev_source });
    if (config.heldout_source && config.heldout_source !== "training/llm_corpus/r25l_heldout.jsonl") failures.push({ code: "unexpected_heldout_source", path: config.heldout_source });
  } else {
    if (trainSources.length < 2 || devSources.length < 2 || heldoutSources.length < 2) failures.push({ code: "r25ao_requires_expanded_split_source_arrays" });
  }

  const tokenizer = failures.length ? null : await readJson(tokenizerPath);
  const tokenizerReport = failures.length ? null : await readJson(tokenizerReportPath);
  const trainRows = await readRowsFromSources(trainSources);
  const devRows = await readRowsFromSources(devSources);
  const heldoutRows = heldoutSources.length ? await readRowsFromSources(heldoutSources) : [];
  const selectedTrainRows = rowsFromPlan(trainRows, "train", samplingPlan, failures);
  const selectedDevRows = rowsFromPlan(devRows, "dev", samplingPlan, failures);
  const selectedHeldoutRows = rowsFromPlan(heldoutRows, "heldout", samplingPlan, failures);
  const trainLimit = Number(config.max_train_rows || 64);
  const devLimit = Number(config.max_dev_rows || 32);
  const heldoutLimit = Number(config.max_heldout_rows || 0);
  const trainRegularization = applyR25yRegularization(selectedTrainRows, "train", config);
  const trainRowsForSelection = selectRowsByChinesePersonalMix(trainRegularization.rows, "train", trainLimit, config, failures);
  const devRowsForSelection = selectRowsByChinesePersonalMix(selectedDevRows, "dev", devLimit, config, failures);
  const heldoutRowsForSelection = selectRowsByChinesePersonalMix(selectedHeldoutRows, "heldout", heldoutLimit, config, failures);
  const trainSequences = tokenizer ? buildSequences(trainRowsForSelection, "train", trainLimit, trainSources.join(","), tokenizer, tokenizerConfig, config, failures) : [];
  const devSequences = tokenizer ? buildSequences(devRowsForSelection, "dev", devLimit, devSources.join(","), tokenizer, tokenizerConfig, config, failures) : [];
  const heldoutSequences = tokenizer && heldoutSources.length
    ? buildSequences(heldoutRowsForSelection, "heldout", heldoutLimit, heldoutSources.join(","), tokenizer, tokenizerConfig, config, failures)
    : [];
  if (trainSequences.length < Number(config.max_train_rows || 64)) failures.push({ code: "too_few_train_sequences", count: trainSequences.length });
  if (devSequences.length < Number(config.max_dev_rows || 32)) failures.push({ code: "too_few_dev_sequences", count: devSequences.length });
  if (heldoutSources.length && heldoutSequences.length < Number(config.max_heldout_rows || 0)) failures.push({ code: "too_few_heldout_sequences", count: heldoutSequences.length });
  const overlap = splitOverlap(trainRowsForSelection, devRowsForSelection, heldoutRowsForSelection);
  if (overlap.any_overlap) failures.push({ code: "split_overlap_detected", overlap });
  const trainLanguageCounts = languageCounts(trainRowsForSelection);
  const devLanguageCounts = languageCounts(devRowsForSelection);
  const heldoutLanguageCounts = languageCounts(heldoutRowsForSelection);

  const datasetBase = {
    dataset_id: `${config.run_id || "r25m_small_decoder_pilot_v0"}_sequences_v0`,
    purpose: "small_decoder_pilot_only",
    product_model: false,
    release_checkpoint: false,
    formal_product_training: false,
    tokenizer_id: tokenizerReport?.tokenizer_id || tokenizerConfig.tokenizer_id,
    tokenizer_path: tokenizerPath,
    max_context_tokens: Number(config.max_context_tokens || 64),
    pad_token_id: tokenizer?.vocab?.["<pad>"] ?? 0,
    forbidden_sources_not_used: [
      "evals/",
      "training/llm_corpus/r25l_heldout.jsonl as training",
      "root PDFs/DOCX",
      "data/public_ingestion/",
      "knowledge source cards",
      "private data"
    ]
  };
  const trainDataset = {
    ...datasetBase,
    ok: failures.length === 0 && forbidden_sources_touched.length === 0,
    split: "train",
    source_files: trainSources,
    source_file_counts: countBy(trainRowsForSelection, "__source"),
    sequences: trainSequences
  };
  const devDataset = {
    ...datasetBase,
    ok: failures.length === 0 && forbidden_sources_touched.length === 0,
    split: "dev",
    source_files: devSources,
    source_file_counts: countBy(devRowsForSelection, "__source"),
    sequences: devSequences
  };
  const heldoutDataset = {
    ...datasetBase,
    ok: failures.length === 0 && forbidden_sources_touched.length === 0,
    split: "heldout",
    source_files: heldoutSources,
    source_file_counts: countBy(heldoutRowsForSelection, "__source"),
    evaluation_only: true,
    not_used_for_training: true,
    sequences: heldoutSequences
  };
  const report = {
    ok: trainDataset.ok && devDataset.ok,
    run_id: config.run_id || "r25m_small_decoder_pilot_v0",
    variant_id: config.variant_id || null,
    config_path: configPath,
    sampling_plan_path: samplingPlanPath,
    balanced_sampling_used: Boolean(samplingPlan),
    chinese_personal_sampling_used: prefix === "r25ac" || prefix === "r25ao",
    expanded_corpus_sampling_used: prefix === "r25ao",
    data_regularization_used: prefix === "r25y",
    regularization_stats: trainRegularization.stats,
    train_rows: trainSequences.length,
    dev_rows: devSequences.length,
    heldout_rows: heldoutSequences.length,
    train_rows_used: trainSequences.length,
    dev_rows_used: devSequences.length,
    heldout_rows_prepared: heldoutSequences.length,
    train_language_counts: trainLanguageCounts,
    dev_language_counts: devLanguageCounts,
    heldout_language_counts: heldoutLanguageCounts,
    actual_train_language_mix: shareFromCounts(trainLanguageCounts),
    actual_dev_language_mix: shareFromCounts(devLanguageCounts),
    actual_heldout_language_mix: shareFromCounts(heldoutLanguageCounts),
    target_language_mix: config.sampler_target || config.language_mix_target || null,
    personal_target_coverage: personalCoverage(trainRowsForSelection, config.personal_color_targets || []),
    split_overlap: overlap,
    task_family_counts: {
      train: countBy(trainRowsForSelection, "task_family"),
      dev: countBy(devRowsForSelection, "task_family"),
      heldout: countBy(heldoutRowsForSelection, "task_family")
    },
    train_sequences: trainSequences.length,
    dev_sequences: devSequences.length,
    heldout_sequences_prepared: heldoutSequences.length,
    max_context_tokens: datasetBase.max_context_tokens,
    tokenizer_id: datasetBase.tokenizer_id,
    forbidden_sources_touched,
    notes: [
      prefix === "r25ao"
        ? "R25AO pilot dataset reads only configured tracked training/llm_corpus JSONL split files."
        : `${config.run_id || "R25M"} pilot dataset reads only approved R25L JSONL files.`,
      prefix === "r25ao"
        ? "Training uses configured train split sources only; dev rows are used for bounded sanity evaluation only."
        : "Training uses R25L train rows only; dev rows are used for bounded sanity evaluation only.",
      "Heldout rows, when present, are prepared only for replay evaluation and are not used for training.",
      "No evals, heldout training, root documents, public ingestion data, knowledge cards, or private data are read."
    ],
    failures
  };

  await writeJson(`${config.output_dir}${prefix}_train_sequences.json`, trainDataset);
  await writeJson(`${config.output_dir}${prefix}_dev_sequences.json`, devDataset);
  if (heldoutSources.length) await writeJson(`${config.output_dir}${prefix}_heldout_sequences.json`, heldoutDataset);
  await writeJson(`${config.output_dir}${prefix}_dataset_report.json`, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
