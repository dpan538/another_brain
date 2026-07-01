#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
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
  if (runId.startsWith("r25v_")) return "r25v";
  if (runId.startsWith("r25s_")) return "r25s";
  if (runId.startsWith("r25p_")) return "r25p";
  return "r25m";
}

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

function scanText(text, source, failures) {
  if (PRIVATE_PATH_RE.test(text)) failures.push({ code: "private_path_marker", source });
  if (FORBIDDEN_MARKER_RE.test(text)) failures.push({ code: "forbidden_training_marker", source });
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
    if (row.split !== split) {
      failures.push({ code: "unexpected_row_split", source: `${sourcePath}:${row.__line}`, expected: split, actual: row.split });
      continue;
    }
    if (row.contains_private_data !== false || row.provenance?.contains_private_data !== false) {
      failures.push({ code: "row_private_data_flag_not_false", source: `${sourcePath}:${row.__line}` });
      continue;
    }
    const texts = collectSafeText(row);
    const joined = texts.join("\n");
    scanText(joined, `${sourcePath}:${row.__line}`, failures);
    const ids = encodeDryrun(`<bos> ${joined} <eos>`, tokenizer, tokenizerConfig);
    if (ids.length < 3) {
      failures.push({ code: "pilot_sequence_too_short", source: `${sourcePath}:${row.__line}` });
      continue;
    }
    const fixed = fixedLength(ids, maxContextTokens, padTokenId);
    sequences.push({
      sample_id: row.sample_id || `r25m_${split}_${sequences.length + 1}`,
      source: sourcePath,
      source_line: row.__line,
      split,
      safe_fields: ["messages", "constraints", "retrieved_evidence", "target_answer"],
      token_count: fixed.token_count,
      token_ids: fixed.token_ids
    });
  }
  return sequences;
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
  for (const path of [config.train_source, config.dev_source]) {
    if (FORBIDDEN_SOURCE_RE.test(path)) forbidden_sources_touched.push(path);
  }
  if (config.heldout_source && FORBIDDEN_SOURCE_RE.test(config.heldout_source)) {
    if (config.heldout_source !== "training/llm_corpus/r25l_heldout.jsonl") forbidden_sources_touched.push(config.heldout_source);
  }
  if (config.train_source !== "training/llm_corpus/r25l_train.jsonl") failures.push({ code: "unexpected_train_source", path: config.train_source });
  if (config.dev_source !== "training/llm_corpus/r25l_dev.jsonl") failures.push({ code: "unexpected_dev_source", path: config.dev_source });
  if (config.heldout_source && config.heldout_source !== "training/llm_corpus/r25l_heldout.jsonl") failures.push({ code: "unexpected_heldout_source", path: config.heldout_source });

  const tokenizer = failures.length ? null : await readJson(tokenizerPath);
  const tokenizerReport = failures.length ? null : await readJson(tokenizerReportPath);
  const trainRows = await readRows(config.train_source);
  const devRows = await readRows(config.dev_source);
  const heldoutRows = config.heldout_source ? await readRows(config.heldout_source) : [];
  const selectedTrainRows = rowsFromPlan(trainRows, "train", samplingPlan, failures);
  const selectedDevRows = rowsFromPlan(devRows, "dev", samplingPlan, failures);
  const selectedHeldoutRows = rowsFromPlan(heldoutRows, "heldout", samplingPlan, failures);
  const trainSequences = tokenizer ? buildSequences(selectedTrainRows, "train", Number(config.max_train_rows || 64), config.train_source, tokenizer, tokenizerConfig, config, failures) : [];
  const devSequences = tokenizer ? buildSequences(selectedDevRows, "dev", Number(config.max_dev_rows || 32), config.dev_source, tokenizer, tokenizerConfig, config, failures) : [];
  const heldoutSequences = tokenizer && config.heldout_source
    ? buildSequences(selectedHeldoutRows, "heldout", Number(config.max_heldout_rows || 0), config.heldout_source, tokenizer, tokenizerConfig, config, failures)
    : [];
  if (trainSequences.length < Number(config.max_train_rows || 64)) failures.push({ code: "too_few_train_sequences", count: trainSequences.length });
  if (devSequences.length < Number(config.max_dev_rows || 32)) failures.push({ code: "too_few_dev_sequences", count: devSequences.length });
  if (config.heldout_source && heldoutSequences.length < Number(config.max_heldout_rows || 0)) failures.push({ code: "too_few_heldout_sequences", count: heldoutSequences.length });

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
    source_files: [config.train_source],
    sequences: trainSequences
  };
  const devDataset = {
    ...datasetBase,
    ok: failures.length === 0 && forbidden_sources_touched.length === 0,
    split: "dev",
    source_files: [config.dev_source],
    sequences: devSequences
  };
  const heldoutDataset = {
    ...datasetBase,
    ok: failures.length === 0 && forbidden_sources_touched.length === 0,
    split: "heldout",
    source_files: config.heldout_source ? [config.heldout_source] : [],
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
    train_rows_used: trainSequences.length,
    dev_rows_used: devSequences.length,
    heldout_rows_prepared: heldoutSequences.length,
    train_sequences: trainSequences.length,
    dev_sequences: devSequences.length,
    heldout_sequences_prepared: heldoutSequences.length,
    max_context_tokens: datasetBase.max_context_tokens,
    tokenizer_id: datasetBase.tokenizer_id,
    forbidden_sources_touched,
    notes: [
      `${config.run_id || "R25M"} pilot dataset reads only approved R25L JSONL files.`,
      "Training uses R25L train rows only; dev rows are used for bounded sanity evaluation only.",
      "Heldout rows, when present, are prepared only for replay evaluation and are not used for training.",
      "No evals, heldout training, root documents, public ingestion data, knowledge cards, or private data are read."
    ],
    failures
  };

  await writeJson(`${config.output_dir}${prefix}_train_sequences.json`, trainDataset);
  await writeJson(`${config.output_dir}${prefix}_dev_sequences.json`, devDataset);
  if (config.heldout_source) await writeJson(`${config.output_dir}${prefix}_heldout_sequences.json`, heldoutDataset);
  await writeJson(`${config.output_dir}${prefix}_dataset_report.json`, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
