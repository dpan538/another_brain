#!/usr/bin/env node
import { execFile } from "node:child_process";
import { access, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { encodeDryrun } from "./train_tokenizer_dryrun.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const RUN_CONFIG_PATH = "training/from_scratch/small_decoder_pilot_run_config.json";
const TOKENIZER_CONFIG_PATH = "training/from_scratch/tokenizer_dry_run_config.r25l.json";
const CHECKPOINT_PATH = "artifacts/training_os/small_decoder_pilot/r25m/r25m_small_decoder_checkpoint.json";
const RUN_REPORT_PATH = "artifacts/training_os/small_decoder_pilot/r25m/r25m_small_decoder_run_report.json";
const OUTPUT_PATH = "artifacts/training_os/small_decoder_pilot/r25n/r25n_heldout_eval_report.json";
const HELDOUT_SOURCE = "training/llm_corpus/r25l_heldout.jsonl";
const TRAIN_SOURCE = "training/llm_corpus/r25l_train.jsonl";
const FORBIDDEN_MARKER_RE = /chain[_ -]?of[_ -]?thought|hidden_prompt|system_prompt|private_memory|raw_private_data|BEGIN PRIVATE KEY|api[_-]?key|secret|\/Users\/[^/\s]+|[A-Za-z]:\\Users\\/i;
const MODEL_WEIGHT_RE = /\.(safetensors|gguf|bin|pt|pth|onnx|mlmodel|mlpackage|ckpt)$/i;

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

async function readJsonl(path, limit = Infinity) {
  const text = await readFile(resolve(ROOT, path), "utf8");
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line));
    if (rows.length >= limit) break;
  }
  return rows;
}

async function gitLines(args) {
  const { stdout } = await execFileAsync("git", args, { cwd: ROOT, maxBuffer: 12 * 1024 * 1024 });
  return stdout.split(/\r?\n/).filter(Boolean);
}

async function walk(path) {
  const abs = resolve(ROOT, path);
  const info = await stat(abs).catch(() => null);
  if (!info) return [];
  if (info.isFile()) return [path];
  const out = [];
  for (const entry of await readdir(abs, { withFileTypes: true })) {
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await walk(child)));
    else out.push(child);
  }
  return out;
}

function safeText(row) {
  const parts = [];
  if (Array.isArray(row.messages)) {
    for (const message of row.messages) parts.push(String(message.content || ""));
  }
  if (row.target_answer) parts.push(String(row.target_answer));
  if (Array.isArray(row.constraints)) parts.push(...row.constraints.map(String));
  if (Array.isArray(row.retrieved_evidence)) {
    for (const item of row.retrieved_evidence) {
      const text = String(item.text || "");
      if (text.length <= 400 && item.contains_private_data === false) parts.push(text);
    }
  }
  return parts.join("\n").replace(/\s+/g, " ").trim();
}

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function tokenPairs(ids) {
  const pairs = [];
  for (let index = 0; index < ids.length - 1; index += 1) pairs.push(`${ids[index]}:${ids[index + 1]}`);
  return pairs;
}

async function evalLeakageTexts(heldoutTexts) {
  const evalFiles = await walk("evals");
  const distinctive = heldoutTexts
    .map((text) => normalizeText(text).slice(0, 180))
    .filter((text) => text.length >= 80);
  let matches = 0;
  for (const file of evalFiles) {
    const text = await readFile(resolve(ROOT, file), "utf8").catch(() => "");
    const normalized = normalizeText(text);
    for (const snippet of distinctive) {
      if (normalized.includes(snippet)) matches += 1;
    }
  }
  return matches;
}

async function main() {
  const config = await readJson(RUN_CONFIG_PATH);
  const tokenizerConfig = await readJson(TOKENIZER_CONFIG_PATH);
  const tokenizerPath = `${tokenizerConfig.artifact_dir}/r25j_tokenizer.json`;
  const missing = [];
  for (const path of [CHECKPOINT_PATH, RUN_REPORT_PATH, tokenizerPath]) {
    if (!(await exists(path))) missing.push(path);
  }
  if (missing.length) {
    const skipped = {
      ok: true,
      skipped: true,
      reason: "ignored_artifacts_missing",
      missing,
      training_ran: false,
      product_model: false,
      release_checkpoint: false
    };
    await writeJson(OUTPUT_PATH, skipped);
    console.log(JSON.stringify(skipped, null, 2));
    return;
  }

  const checkpoint = await readJson(CHECKPOINT_PATH);
  const runReport = await readJson(RUN_REPORT_PATH);
  const tokenizer = await readJson(tokenizerPath);
  const heldoutRows = await readJsonl(HELDOUT_SOURCE, 64);
  const trainRows = await readJsonl(TRAIN_SOURCE);
  const failures = [];
  const heldoutTexts = heldoutRows.map(safeText);
  const trainTexts = trainRows.map((row) => normalizeText(safeText(row)));
  const trainTextSet = new Set(trainTexts);
  const heldoutExactTrainOverlap = heldoutTexts.filter((text) => trainTextSet.has(normalizeText(text))).length;
  const forbiddenHeldoutRows = heldoutTexts
    .map((text, index) => ({ index, forbidden: FORBIDDEN_MARKER_RE.test(text) }))
    .filter((item) => item.forbidden);

  const trainPairSet = new Set();
  for (const text of trainTexts) {
    const ids = encodeDryrun(text, tokenizer, tokenizerConfig).slice(0, config.max_context_tokens);
    for (const pair of tokenPairs(ids)) trainPairSet.add(pair);
  }

  const unkId = tokenizer.vocab["<unk>"];
  let tokenCount = 0;
  let unknownCount = 0;
  let pairCount = 0;
  let heldoutPairSeenInTrain = 0;
  let maxSequenceLength = 0;
  for (const text of heldoutTexts) {
    const ids = encodeDryrun(text, tokenizer, tokenizerConfig).slice(0, config.max_context_tokens);
    maxSequenceLength = Math.max(maxSequenceLength, ids.length);
    tokenCount += ids.length;
    unknownCount += ids.filter((id) => id === unkId).length;
    for (const pair of tokenPairs(ids)) {
      pairCount += 1;
      if (trainPairSet.has(pair)) heldoutPairSeenInTrain += 1;
    }
  }

  const unknownRate = tokenCount ? unknownCount / tokenCount : 0;
  const pairCoverage = pairCount ? heldoutPairSeenInTrain / pairCount : 0;
  const evalPromptLeakageMatches = await evalLeakageTexts(heldoutTexts);
  const trackedArtifacts = await gitLines(["ls-files", "--cached", config.output_dir]);
  const trackedWeights = (await gitLines(["ls-files"])).filter((path) => MODEL_WEIGHT_RE.test(path));

  if (checkpoint.product_model !== false) failures.push({ code: "checkpoint_claims_product_model" });
  if (checkpoint.release_checkpoint !== false) failures.push({ code: "checkpoint_claims_release_checkpoint" });
  if (runReport.product_model !== false) failures.push({ code: "run_report_claims_product_model" });
  if (runReport.release_checkpoint !== false) failures.push({ code: "run_report_claims_release_checkpoint" });
  if (!Number.isFinite(unknownRate) || !Number.isFinite(pairCoverage)) failures.push({ code: "heldout_metric_not_finite" });
  if (heldoutExactTrainOverlap > 0) failures.push({ code: "heldout_exact_train_overlap", count: heldoutExactTrainOverlap });
  if (evalPromptLeakageMatches > 0) failures.push({ code: "eval_prompt_leakage_match", count: evalPromptLeakageMatches });
  if (forbiddenHeldoutRows.length) failures.push({ code: "forbidden_private_or_hidden_marker_in_heldout", rows: forbiddenHeldoutRows });
  if (trackedArtifacts.length) failures.push({ code: "pilot_artifacts_tracked_or_staged", trackedArtifacts });
  if (trackedWeights.length) failures.push({ code: "tracked_model_like_file", trackedWeights });

  const metricName = checkpoint.weights_serialized === true ? "heldout_model_loss" : "heldout_next_token_pair_coverage";
  const heldoutLoss = checkpoint.weights_serialized === true ? null : null;
  const baselineUniformLoss = Math.log(Math.max(1, Number(tokenizer.vocab_size || Object.keys(tokenizer.vocab || {}).length)));
  const report = {
    ok: failures.length === 0,
    skipped: false,
    training_ran: false,
    evaluation_type: checkpoint.weights_serialized === true ? "model_loss_requested_but_not_implemented_for_json_digest" : "structural_bounded_metric_no_serialized_weights",
    checkpoint_weights_serialized: checkpoint.weights_serialized === true,
    heldout_source: HELDOUT_SOURCE,
    heldout_rows_used: heldoutRows.length,
    heldout_sequences: heldoutRows.length,
    max_context_tokens: config.max_context_tokens,
    heldout_loss: heldoutLoss,
    baseline_uniform_loss: baselineUniformLoss,
    metric_name: metricName,
    heldout_metric: pairCoverage,
    heldout_unknown_rate: unknownRate,
    heldout_token_count: tokenCount,
    heldout_pair_count: pairCount,
    dev_loss_reference: runReport.final_dev_loss,
    dev_loss_comparison_meaningful: false,
    memorization_risk: heldoutExactTrainOverlap > 0 ? "high_exact_overlap" : pairCoverage > 0.98 ? "review_high_pair_coverage" : "low_no_exact_overlap",
    heldout_exact_train_overlap: heldoutExactTrainOverlap,
    eval_prompt_leakage_matches: evalPromptLeakageMatches,
    private_or_hidden_marker_rows: forbiddenHeldoutRows,
    product_model: false,
    release_checkpoint: false,
    tracked_artifacts: trackedArtifacts,
    tracked_model_like_files: trackedWeights,
    notes: [
      "R25N held-out evaluation does not train.",
      "The R25M checkpoint records a digest and parameter summaries only; no serialized weights are available for true model-loss replay.",
      "The reported held-out metric is bounded structural next-token-pair coverage, not a product benchmark."
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
