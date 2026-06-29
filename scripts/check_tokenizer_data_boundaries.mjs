#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = "training/from_scratch/tokenizer_dry_run_config.json";
const ARTIFACT_REPORT = "artifacts/training_os/tokenizer_dryrun/r25j_tokenizer_corpus_report.json";
const FORBIDDEN_SOURCE_RE = /^(evals\/|data\/public_ingestion\/)|\.(pdf|docx)$/i;
const PRIVATE_PATH_RE = /\/Users\/|\/private\/var\/|\/Volumes\/|[A-Za-z]:\\Users\\/;
const FORBIDDEN_MARKER_RE = /chain[_ -]?of[_ -]?thought|hidden_prompt|system_prompt|raw_private_data|private_memory|local_user_path|api_key|BEGIN PRIVATE KEY/i;
const MODEL_WEIGHT_RE = /\.(safetensors|gguf|bin|pt|pth|onnx|mlmodel|mlpackage|ckpt)\b/i;

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

function collectStrings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, out));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectStrings(item, out));
  return out;
}

async function main() {
  const config = await readJson(CONFIG_PATH);
  const report = await readJson(ARTIFACT_REPORT).catch(() => null);
  const failures = [];
  for (const source of config.train_sources || []) {
    if (FORBIDDEN_SOURCE_RE.test(source)) failures.push({ code: "forbidden_train_source", source });
    if (source !== "training/llm_corpus/train.jsonl") failures.push({ code: "unexpected_train_source", source });
  }
  for (const source of config.eval_sources || []) {
    if (source === "training/llm_corpus/train.jsonl") failures.push({ code: "train_source_used_as_eval", source });
  }
  const strings = collectStrings(config);
  for (const text of strings) {
    if (PRIVATE_PATH_RE.test(text)) failures.push({ code: "private_path_in_config", text });
    if (MODEL_WEIGHT_RE.test(text)) failures.push({ code: "model_weight_reference_in_config", text });
  }
  if (!report) failures.push({ code: "tokenizer_corpus_report_missing" });
  else {
    for (const item of report.forbidden_sources_touched || []) failures.push({ code: "forbidden_source_touched", item });
    for (const item of report.private_data_markers || []) failures.push({ code: "private_data_marker", item });
    for (const item of report.chain_of_thought_markers || []) failures.push({ code: "forbidden_training_marker", item });
  }
  for (const file of [
    "artifacts/training_os/tokenizer_dryrun/r25j_tokenizer_train.txt",
    "artifacts/training_os/tokenizer_dryrun/r25j_tokenizer_eval_dev.txt",
    "artifacts/training_os/tokenizer_dryrun/r25j_tokenizer_eval_heldout.txt"
  ]) {
    const text = await readFile(resolve(ROOT, file), "utf8").catch(() => "");
    if (!text) failures.push({ code: "tokenizer_text_artifact_missing", file });
    if (PRIVATE_PATH_RE.test(text)) failures.push({ code: "private_path_in_tokenizer_text", file });
    if (FORBIDDEN_MARKER_RE.test(text)) failures.push({ code: "forbidden_marker_in_tokenizer_text", file });
    if (MODEL_WEIGHT_RE.test(text)) failures.push({ code: "model_weight_reference_in_tokenizer_text", file });
  }
  const output = { ok: failures.length === 0, tokenizer_train_sources: config.train_sources, tokenizer_eval_sources: config.eval_sources, failures };
  console.log(JSON.stringify(output, null, 2));
  if (!output.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
