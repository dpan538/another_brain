#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CONFIG_PATH = "training/from_scratch/tokenizer_dry_run_config.json";
const FORBIDDEN_SOURCE_RE = /^(evals\/|data\/public_ingestion\/)|\.(pdf|docx)$/i;
const PRIVATE_PATH_RE = /\/Users\/|\/private\/var\/|\/Volumes\/|[A-Za-z]:\\Users\\/;
const FORBIDDEN_MARKER_RE = /chain[_ -]?of[_ -]?thought|hidden_prompt|system_prompt|raw_private_data|private_memory|api_key|BEGIN PRIVATE KEY/i;

function normalizeText(value = "") {
  return String(value || "").normalize("NFC").replace(/\s+/g, " ").trim();
}

function collectText(row) {
  const out = [];
  for (const message of Array.isArray(row.messages) ? row.messages : []) {
    if (typeof message?.content === "string") out.push(`<${message.role}> ${message.content}`);
  }
  for (const item of Array.isArray(row.constraints) ? row.constraints : []) out.push(`<constraint> ${item}`);
  for (const evidence of Array.isArray(row.retrieved_evidence) ? row.retrieved_evidence : []) {
    if (typeof evidence?.text === "string") out.push(`<evidence> ${evidence.text}`);
  }
  if (typeof row.target_answer === "string") out.push(`<assistant> ${row.target_answer}`);
  return out.map(normalizeText).filter(Boolean);
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

function configPathFromArgs() {
  const index = process.argv.indexOf("--config");
  return index >= 0 ? process.argv[index + 1] || DEFAULT_CONFIG_PATH : DEFAULT_CONFIG_PATH;
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

async function writeText(path, text) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, text, "utf8");
}

async function main() {
  const configPath = configPathFromArgs();
  const config = await readJson(configPath);
  const artifactDir = config.artifact_dir || "artifacts/training_os/tokenizer_dryrun";
  const forbidden_sources_touched = [];
  const private_data_markers = [];
  const chain_of_thought_markers = [];

  for (const source of [...(config.train_sources || []), ...(config.eval_sources || [])]) {
    if (FORBIDDEN_SOURCE_RE.test(source)) forbidden_sources_touched.push(source);
  }

  const outputs = new Map([
    ["train", []],
    ["dev", []],
    ["heldout", []]
  ]);
  const sourceFiles = [];

  const trainSources = new Set(config.train_sources || []);
  const evalSources = new Set(config.eval_sources || []);
  for (const source of [...trainSources, ...evalSources]) {
    const rows = await readRows(source);
    sourceFiles.push(source);
    for (const row of rows) {
      const split = row.split;
      const isTrainingSource = trainSources.has(source);
      if (isTrainingSource && split !== "train") forbidden_sources_touched.push(`${source}:${row.__line}:split_${split}`);
      if (!isTrainingSource && split === "train") forbidden_sources_touched.push(`${source}:${row.__line}:train_in_eval_source`);
      const texts = collectText(row);
      const joined = texts.join("\n");
      if (PRIVATE_PATH_RE.test(joined)) private_data_markers.push({ source, line: row.__line });
      if (FORBIDDEN_MARKER_RE.test(joined)) chain_of_thought_markers.push({ source, line: row.__line });
      if (outputs.has(split)) outputs.get(split).push(...texts);
    }
  }

  const trainText = `${outputs.get("train").join("\n")}\n`;
  const devText = `${outputs.get("dev").join("\n")}\n`;
  const heldoutText = `${outputs.get("heldout").join("\n")}\n`;
  await writeText(`${artifactDir}/r25j_tokenizer_train.txt`, trainText);
  await writeText(`${artifactDir}/r25j_tokenizer_eval_dev.txt`, devText);
  await writeText(`${artifactDir}/r25j_tokenizer_eval_heldout.txt`, heldoutText);

  const report = {
    ok: forbidden_sources_touched.length === 0 && private_data_markers.length === 0 && chain_of_thought_markers.length === 0,
    config_path: configPath,
    train_chars: trainText.trim().length,
    dev_chars: devText.trim().length,
    heldout_chars: heldoutText.trim().length,
    source_files: sourceFiles,
    forbidden_sources_touched,
    private_data_markers,
    chain_of_thought_markers
  };
  await writeText(`${artifactDir}/r25j_tokenizer_corpus_report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
