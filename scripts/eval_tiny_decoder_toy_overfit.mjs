#!/usr/bin/env node
import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const ARTIFACT_DIR = "artifacts/training_os/tiny_decoder_toy/";
const RUN_REPORT_PATH = `${ARTIFACT_DIR}r25k_toy_run_report.json`;
const DATASET_REPORT_PATH = `${ARTIFACT_DIR}r25k_toy_dataset_report.json`;
const DATASET_PATH = `${ARTIFACT_DIR}r25k_toy_train.json`;
const EVAL_REPORT_PATH = `${ARTIFACT_DIR}r25k_toy_eval_report.json`;
const MODEL_WEIGHT_RE = /\.(safetensors|gguf|bin|pt|pth|onnx|mlmodel|mlpackage|ckpt)$/i;
const FORBIDDEN_SOURCE_RE = /^(evals\/|data\/public_ingestion\/)|(?:^|\/)(dev|heldout)\.jsonl$|\.(pdf|docx)$/i;

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

async function writeJson(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function exists(path) {
  try {
    await access(resolve(ROOT, path));
    return true;
  } catch {
    return false;
  }
}

async function gitLines(args) {
  const { stdout } = await execFileAsync("git", args, { cwd: ROOT, maxBuffer: 8 * 1024 * 1024 });
  return stdout.split(/\r?\n/).filter(Boolean);
}

async function isIgnored(path) {
  try {
    await execFileAsync("git", ["check-ignore", path], { cwd: ROOT });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const failures = [];
  const runReport = await readJson(RUN_REPORT_PATH).catch(() => null);
  const datasetReport = await readJson(DATASET_REPORT_PATH).catch(() => null);
  const dataset = await readJson(DATASET_PATH).catch(() => null);

  if (!runReport) failures.push({ code: "toy_run_report_missing", path: RUN_REPORT_PATH });
  if (!datasetReport?.ok) failures.push({ code: "toy_dataset_report_not_ok", path: DATASET_REPORT_PATH });
  if (!dataset?.ok) failures.push({ code: "toy_dataset_not_ok", path: DATASET_PATH });

  if (runReport) {
    if (runReport.toy_training_ran !== true) failures.push({ code: "toy_training_did_not_run" });
    if (runReport.formal_training !== false) failures.push({ code: "formal_training_must_be_false" });
    if (runReport.product_model !== false) failures.push({ code: "product_model_must_be_false" });
    if (runReport.loss_decreased !== true) failures.push({ code: "toy_loss_did_not_decrease", initial_loss: runReport.initial_loss, final_loss: runReport.final_loss });
    if (runReport.weights_tracked !== false) failures.push({ code: "toy_report_claims_weights_tracked" });
    if (runReport.formal_training_progress_percent !== 0) failures.push({ code: "formal_training_progress_must_remain_zero" });
    for (const path of runReport.artifact_paths || []) {
      if (!String(path).startsWith(ARTIFACT_DIR)) failures.push({ code: "artifact_path_outside_ignored_root", path });
      if (!(await exists(path))) failures.push({ code: "artifact_path_missing", path });
      if (!(await isIgnored(path))) failures.push({ code: "artifact_path_not_ignored", path });
    }
  }

  for (const source of dataset?.source_files || []) {
    if (source !== "training/llm_corpus/train.jsonl") failures.push({ code: "unexpected_toy_training_source", source });
    if (FORBIDDEN_SOURCE_RE.test(source)) failures.push({ code: "forbidden_toy_training_source", source });
  }
  for (const item of datasetReport?.forbidden_sources_touched || []) failures.push({ code: "forbidden_source_touched", item });

  const trackedToyArtifacts = await gitLines(["ls-files", "--cached", ARTIFACT_DIR]);
  if (trackedToyArtifacts.length) failures.push({ code: "toy_artifacts_tracked_or_staged", trackedToyArtifacts });
  const trackedWeights = (await gitLines(["ls-files"])).filter((path) => MODEL_WEIGHT_RE.test(path));
  if (trackedWeights.length) failures.push({ code: "tracked_model_like_weight_extension", trackedWeights });
  const trackedCheckpoint = trackedToyArtifacts.filter((path) => /r25k_toy_checkpoint\.json$/.test(path));
  if (trackedCheckpoint.length) failures.push({ code: "toy_checkpoint_tracked", trackedCheckpoint });

  const text = runReport ? JSON.stringify(runReport) : "";
  if (/"formal_training"\s*:\s*true/.test(text) || /formal decoder training has started/i.test(text)) failures.push({ code: "toy_output_claims_formal_training" });
  if (/"product_model"\s*:\s*true/.test(text) || /product model exists/i.test(text)) failures.push({ code: "toy_output_claims_product_model" });

  const output = {
    ok: failures.length === 0,
    toy_training_ran: runReport?.toy_training_ran === true,
    formal_training: false,
    product_model: false,
    loss_decreased: runReport?.loss_decreased === true,
    train_accuracy_proxy: runReport?.train_accuracy_proxy ?? null,
    artifacts_under_ignored_path: failures.every((failure) => failure.code !== "artifact_path_outside_ignored_root" && failure.code !== "artifact_path_not_ignored"),
    weights_tracked: trackedToyArtifacts.length > 0,
    tracked_model_like_files: trackedWeights,
    eval_sources_used: (dataset?.source_files || []).filter((source) => source !== "training/llm_corpus/train.jsonl" || FORBIDDEN_SOURCE_RE.test(source)),
    failures
  };
  await writeJson(EVAL_REPORT_PATH, output);
  console.log(JSON.stringify(output, null, 2));
  if (!output.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
