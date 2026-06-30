#!/usr/bin/env node
import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const ARTIFACT_DIR = "artifacts/training_os/tiny_decoder_toy/";
const RUN_REPORT_PATH = `${ARTIFACT_DIR}r25k_toy_run_report.json`;
const EVAL_REPORT_PATH = `${ARTIFACT_DIR}r25k_toy_eval_report.json`;
const DATASET_REPORT_PATH = `${ARTIFACT_DIR}r25k_toy_dataset_report.json`;
const APPROVAL_PATH = "training/from_scratch/APPROVE_R25K_TOY_OVERFIT.json";
const MODEL_WEIGHT_RE = /\.(safetensors|gguf|bin|pt|pth|onnx|mlmodel|mlpackage|ckpt)$/i;

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
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
  const { stdout } = await execFileAsync("git", args, { cwd: ROOT, maxBuffer: 12 * 1024 * 1024 });
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
  const approval = await readJson(APPROVAL_PATH).catch(() => null);
  if (approval?.consumed !== true) failures.push({ code: "r25k_approval_marker_not_consumed" });
  if (approval?.allow_additional_runs !== false) failures.push({ code: "r25k_approval_allows_additional_runs" });

  const artifactsPresent = await exists(RUN_REPORT_PATH);
  const trackedArtifacts = await gitLines(["ls-files", "--cached", ARTIFACT_DIR]);
  const trackedWeights = (await gitLines(["ls-files"])).filter((path) => MODEL_WEIGHT_RE.test(path));
  if (trackedArtifacts.length) failures.push({ code: "toy_artifact_tracked_or_staged", trackedArtifacts });
  if (trackedWeights.length) failures.push({ code: "tracked_model_like_file", trackedWeights });

  let status = "blocked_no_local_ignored_artifacts";
  let runReport = null;
  let evalReport = null;
  let datasetReport = null;
  if (artifactsPresent) {
    status = "history_artifacts_found";
    runReport = await readJson(RUN_REPORT_PATH).catch(() => null);
    evalReport = await readJson(EVAL_REPORT_PATH).catch(() => null);
    datasetReport = await readJson(DATASET_REPORT_PATH).catch(() => null);
    if (!runReport?.ok) failures.push({ code: "toy_run_report_missing_or_not_ok", path: RUN_REPORT_PATH });
    if (!evalReport?.ok) failures.push({ code: "toy_eval_report_missing_or_not_ok", path: EVAL_REPORT_PATH });
    if (!datasetReport?.ok) failures.push({ code: "toy_dataset_report_missing_or_not_ok", path: DATASET_REPORT_PATH });
    if (runReport?.toy_training_ran !== true) failures.push({ code: "historical_toy_training_not_recorded" });
    if (runReport?.formal_training !== false) failures.push({ code: "toy_history_claims_formal_training" });
    if (runReport?.product_model !== false) failures.push({ code: "toy_history_claims_product_model" });
    if (runReport?.loss_decreased !== true) failures.push({ code: "toy_history_loss_did_not_decrease" });
    for (const path of runReport?.artifact_paths || []) {
      if (!String(path).startsWith(ARTIFACT_DIR)) failures.push({ code: "toy_artifact_outside_ignored_root", path });
      if (!(await isIgnored(path))) failures.push({ code: "toy_artifact_not_ignored", path });
    }
  }

  const report = {
    ok: failures.length === 0,
    gate: "check:r25k-toy-overfit-history",
    status,
    artifacts_present: artifactsPresent,
    training_rerun: false,
    formal_training: false,
    product_model: false,
    active_training_approval: false,
    toy_loss_decreased: runReport?.loss_decreased === true,
    tracked_artifacts: trackedArtifacts,
    tracked_model_like_files: trackedWeights,
    failures
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
