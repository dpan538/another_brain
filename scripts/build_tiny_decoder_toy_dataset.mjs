#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { encodeDryrun } from "./train_tokenizer_dryrun.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TRAIN_SOURCE = "training/llm_corpus/train.jsonl";
const TOKENIZER_PATH = "artifacts/training_os/tokenizer_dryrun/r25j_tokenizer.json";
const TOKENIZER_REPORT_PATH = "artifacts/training_os/tokenizer_dryrun/r25j_tokenizer_report.json";
const TOKENIZER_CONFIG_PATH = "training/from_scratch/tokenizer_dry_run_config.json";
const TOY_CONFIG_PATH = "training/from_scratch/toy_decoder_config.json";
const ARTIFACT_DIR = "artifacts/training_os/tiny_decoder_toy";
const DATASET_PATH = `${ARTIFACT_DIR}/r25k_toy_train.json`;
const REPORT_PATH = `${ARTIFACT_DIR}/r25k_toy_dataset_report.json`;
const SAMPLE_LIMIT = 18;
const PRIVATE_PATH_RE = /\/Users\/|\/private\/var\/|\/Volumes\/|[A-Za-z]:\\Users\\/;
const FORBIDDEN_MARKER_RE = /chain[_ -]?of[_ -]?thought|hidden_prompt|system_prompt|raw_private_data|private_memory|local_user_path|api_key|BEGIN PRIVATE KEY|secret/i;
const FORBIDDEN_SOURCE_RE = /^(evals\/|data\/public_ingestion\/)|\.(pdf|docx)$/i;

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

function normalizeText(value = "") {
  return String(value || "").normalize("NFC").replace(/\s+/g, " ").trim();
}

function shortText(value = "", maxChars = 360) {
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
    if (typeof item === "string") out.push(`<constraint> ${shortText(item, 180)}`);
  }
  if (typeof row.target_answer === "string") out.push(`<assistant> ${shortText(row.target_answer)}`);
  return out.map(normalizeText).filter(Boolean);
}

function scanText(text, source, failures) {
  if (PRIVATE_PATH_RE.test(text)) failures.push({ code: "private_path_marker", source });
  if (FORBIDDEN_MARKER_RE.test(text)) failures.push({ code: "forbidden_training_marker", source });
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

async function main() {
  const forbidden_sources_touched = [];
  const notes = [
    "R25K tiny toy dataset uses only training/llm_corpus/train.jsonl.",
    "Only messages, constraints, and target_answer are extracted.",
    "No eval, dev, heldout, root document, public_ingestion, evidence, rejected answer, or chain-of-thought source is read for toy training."
  ];
  const failures = [];

  if (!(await exists(TOKENIZER_PATH))) failures.push({ code: "tokenizer_dryrun_artifact_missing", path: TOKENIZER_PATH });
  if (!(await exists(TOKENIZER_REPORT_PATH))) failures.push({ code: "tokenizer_dryrun_report_missing", path: TOKENIZER_REPORT_PATH });
  if (FORBIDDEN_SOURCE_RE.test(TRAIN_SOURCE)) forbidden_sources_touched.push(TRAIN_SOURCE);

  const tokenizerConfig = await readJson(TOKENIZER_CONFIG_PATH);
  const toyConfig = await readJson(TOY_CONFIG_PATH);
  const tokenizer = failures.length ? null : await readJson(TOKENIZER_PATH);
  const maxContextTokens = Number(toyConfig.max_context_tokens || 64);
  const rows = await readRows(TRAIN_SOURCE);
  const samples = [];

  for (const row of rows) {
    if (samples.length >= SAMPLE_LIMIT) break;
    if (row.split !== "train") {
      forbidden_sources_touched.push(`${TRAIN_SOURCE}:${row.__line}:split_${row.split}`);
      continue;
    }
    const texts = collectSafeText(row);
    const joined = texts.join("\n");
    scanText(joined, `${TRAIN_SOURCE}:${row.__line}`, failures);
    if (!joined || !tokenizer) continue;
    const ids = encodeDryrun(`<bos> ${joined} <eos>`, tokenizer, tokenizerConfig).slice(0, maxContextTokens);
    if (ids.length < 2) {
      failures.push({ code: "toy_sequence_too_short", source: `${TRAIN_SOURCE}:${row.__line}` });
      continue;
    }
    samples.push({
      sample_id: row.sample_id || `r25k_toy_sample_${samples.length + 1}`,
      source: TRAIN_SOURCE,
      source_line: row.__line,
      split: "train",
      safe_fields: ["messages", "constraints", "target_answer"],
      token_count: ids.length,
      text: joined,
      token_ids: ids
    });
  }

  if (samples.length < 12) failures.push({ code: "too_few_toy_samples", sample_count: samples.length });
  const dataset = {
    ok: failures.length === 0 && forbidden_sources_touched.length === 0,
    dataset_id: "r25k_tiny_decoder_toy_train_v0",
    purpose: "toy_overfit_sanity_only",
    formal_training: false,
    product_model: false,
    tokenizer_id: tokenizer?.tokenizer_id || tokenizerConfig.tokenizer_id,
    source_files: [TRAIN_SOURCE],
    forbidden_sources_not_used: [
      "evals/",
      "training/llm_corpus/dev.jsonl",
      "training/llm_corpus/heldout.jsonl",
      "root PDFs/DOCX",
      "data/public_ingestion/"
    ],
    max_context_tokens: maxContextTokens,
    samples
  };
  const report = {
    ok: dataset.ok,
    sample_count: samples.length,
    sequence_count: samples.length,
    max_context_tokens: maxContextTokens,
    tokenizer_id: dataset.tokenizer_id,
    forbidden_sources_touched,
    notes,
    failures
  };

  await writeJson(DATASET_PATH, dataset);
  await writeJson(REPORT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
