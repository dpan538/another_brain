#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { profileBudgetBytes } from "./static_llm_policy.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = "training/from_scratch/small_decoder_pilot_config.json";
const TOKENIZER_REPORT_PATH = "artifacts/training_os/tokenizer_dryrun/r25l/r25j_tokenizer_report.json";
const CORPUS_FILES = [
  "training/llm_corpus/r25l_train.jsonl",
  "training/llm_corpus/r25l_dev.jsonl",
  "training/llm_corpus/r25l_heldout.jsonl"
];

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

async function readJsonIfPresent(path) {
  try {
    return await readJson(path);
  } catch {
    return null;
  }
}

async function readRows(path) {
  const text = await readFile(resolve(ROOT, path), "utf8");
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function estimateParameters(config, vocabSize) {
  const selected = config.selected_dryrun_config || {};
  const layers = Number(selected.layers || 0);
  const hidden = Number(selected.hidden_size || 0);
  const heads = Number(selected.attention_heads || 0);
  const intermediate = Number(selected.intermediate_size || 0);
  const tokenEmbedding = vocabSize * hidden;
  const positionEmbedding = Number(config.selected_max_context_tokens || 0) * hidden;
  const attentionPerLayer = hidden * hidden * 4;
  const mlpPerLayer = hidden * intermediate * 2;
  const normPerLayer = hidden * 4;
  const headBiasPerLayer = heads * 2;
  const layerParams = layers * (attentionPerLayer + mlpPerLayer + normPerLayer + headBiasPerLayer);
  const outputHead = vocabSize * hidden;
  return tokenEmbedding + positionEmbedding + layerParams + outputHead;
}

async function main() {
  const config = await readJson(CONFIG_PATH);
  const tokenizerReport = await readJsonIfPresent(TOKENIZER_REPORT_PATH);
  const vocabSize = Number(tokenizerReport?.vocab_size || 4096);
  const rows = (await Promise.all(CORPUS_FILES.map(readRows))).flat();
  const corpusChars = rows.reduce((sum, row) => {
    const values = [
      row.user_goal,
      row.target_answer,
      ...(Array.isArray(row.messages) ? row.messages.map((message) => message.content) : []),
      ...(Array.isArray(row.constraints) ? row.constraints : [])
    ];
    return sum + values.join("\n").length;
  }, 0);
  const parameterEstimate = estimateParameters(config, vocabSize);
  const estimatedFp32Bytes = parameterEstimate * 4;
  const estimatedQ8Bytes = parameterEstimate;
  const estimatedQ4Bytes = Math.ceil(parameterEstimate / 2);
  const profileMaxBytes = profileBudgetBytes(config.capacity_profile_target);
  const contextTokens = config.selected_max_context_tokens;
  const output = {
    ok: config.product_model === false &&
      config.training_allowed_by_default === false &&
      config.commit_weights_allowed === false &&
      estimatedQ4Bytes < profileMaxBytes,
    training_will_run: false,
    product_model: false,
    architecture_id: config.architecture_id,
    model_type: config.model_type,
    vocab_size: vocabSize,
    parameter_estimate: parameterEstimate,
    estimated_fp32_bytes: estimatedFp32Bytes,
    estimated_q8_bytes: estimatedQ8Bytes,
    estimated_q4_bytes: estimatedQ4Bytes,
    context_tokens: contextTokens,
    training_data_size: {
      rows: rows.length,
      chars: corpusChars,
      source_files: CORPUS_FILES
    },
    capacity_profile_fit: {
      profile: config.capacity_profile_target,
      profile_max_bytes: profileMaxBytes,
      fp32_fits_profile: estimatedFp32Bytes <= profileMaxBytes,
      q8_fits_profile: estimatedQ8Bytes <= profileMaxBytes,
      q4_fits_profile: estimatedQ4Bytes <= profileMaxBytes,
      browser_release_target: false
    },
    sequence_memory_risk: {
      selected_context_tokens: contextTokens,
      risk: contextTokens <= 128 ? "low_for_planning" : "review_required"
    },
    risks: [
      "pilot has not run and provides no model quality evidence",
      "held-out and R24/R25 gates must be checked before and after any future approved run",
      "static release would require later quantization, manifest hashes, and admission review"
    ],
    next_phase_requires_approval: true
  };
  await mkdir(resolve(ROOT, config.output_dir), { recursive: true });
  await writeFile(resolve(ROOT, config.output_dir, "r25l_small_decoder_pilot_plan.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(output, null, 2));
  if (!output.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
