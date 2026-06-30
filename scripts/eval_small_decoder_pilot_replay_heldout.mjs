#!/usr/bin/env node
import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const R25M_CHECKPOINT_PATH = "artifacts/training_os/small_decoder_pilot/r25m/r25m_small_decoder_checkpoint.json";
const FUTURE_REPLAYABLE_PATH = "artifacts/training_os/small_decoder_pilot/r25p/r25p_replayable_checkpoint.json";
const R25O_OUTPUT_PATH = "artifacts/training_os/small_decoder_pilot/r25o/r25o_replay_heldout_eval_report.json";
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

function argValue(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function checkpointReplayable(checkpoint) {
  return Boolean(
    checkpoint?.schema_version === "r25o_small_decoder_checkpoint_v1" &&
    Array.isArray(checkpoint.parameter_tensors) &&
    checkpoint.parameter_tensors.length > 0 &&
    checkpoint.product_model === false &&
    checkpoint.release_checkpoint === false &&
    checkpoint.commit_allowed === false
  );
}

function tokenSignature(sequence) {
  return Array.isArray(sequence?.token_ids) ? sequence.token_ids.join(",") : "";
}

function overlapExists(trainDataset, devDataset, heldoutDataset) {
  const trainIds = new Set((trainDataset?.sequences || []).map((row) => row.sample_id).filter(Boolean));
  const trainTokens = new Set((trainDataset?.sequences || []).map(tokenSignature).filter(Boolean));
  for (const row of heldoutDataset?.sequences || []) {
    if (trainIds.has(row.sample_id) || trainTokens.has(tokenSignature(row))) return true;
  }
  const devIds = new Set((devDataset?.sequences || []).map((row) => row.sample_id).filter(Boolean));
  for (const row of heldoutDataset?.sequences || []) {
    if (devIds.has(row.sample_id)) return true;
  }
  return false;
}

async function runDefaultScaffoldMode() {
  const trackedWeights = (await gitLines(["ls-files"])).filter((path) => MODEL_WEIGHT_RE.test(path));
  const trackedFuture = await gitLines(["ls-files", "--cached", FUTURE_REPLAYABLE_PATH]);
  const failures = [];
  if (trackedWeights.length) failures.push({ code: "tracked_model_like_weight_extension", trackedWeights });
  if (trackedFuture.length) failures.push({ code: "future_replayable_checkpoint_tracked_or_staged", trackedFuture });

  if (!(await exists(FUTURE_REPLAYABLE_PATH))) {
    let reason = "no_replayable_checkpoint_available";
    if (await exists(R25M_CHECKPOINT_PATH)) {
      const r25mCheckpoint = await readJson(R25M_CHECKPOINT_PATH);
      if (!checkpointReplayable(r25mCheckpoint)) reason = "r25m_checkpoint_not_replayable";
    }
    const skipped = {
      ok: failures.length === 0,
      skipped: true,
      reason,
      training_ran: false,
      heldout_source: "training/llm_corpus/r25l_heldout.jsonl",
      heldout_loss: null,
      product_model: false,
      release_checkpoint: false,
      replayable_checkpoint_used: false,
      failures
    };
    await writeJson(R25O_OUTPUT_PATH, skipped);
    console.log(JSON.stringify(skipped, null, 2));
    if (!skipped.ok) process.exit(2);
    return;
  }

  const checkpoint = await readJson(FUTURE_REPLAYABLE_PATH);
  if (!checkpointReplayable(checkpoint)) failures.push({ code: "future_checkpoint_not_replayable", path: FUTURE_REPLAYABLE_PATH });
  if (!(await isIgnored(FUTURE_REPLAYABLE_PATH))) failures.push({ code: "future_checkpoint_not_ignored", path: FUTURE_REPLAYABLE_PATH });

  const report = {
    ok: failures.length === 0,
    skipped: true,
    reason: failures.length ? "future_replayable_checkpoint_failed_structural_validation" : "r25p_replayable_checkpoint_available_use_r25p_eval_for_true_loss",
    training_ran: false,
    evaluation_type: "future_replayable_checkpoint_scaffold",
    replayable_checkpoint_used: false,
    checkpoint_path: FUTURE_REPLAYABLE_PATH,
    heldout_source: "training/llm_corpus/r25l_heldout.jsonl",
    heldout_loss: null,
    heldout_loss_status: "not_computed_in_r25o_scaffold_mode",
    product_model: false,
    release_checkpoint: false,
    notes: [
      "This default scaffold mode does not train.",
      "Use eval:small-decoder-pilot-heldout:r25p for true R25P replay loss.",
      "The checkpoint remains an ignored pilot artifact, not a release artifact."
    ],
    failures
  };
  await writeJson(R25O_OUTPUT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

async function runR25pReplayMode() {
  const configPath = argValue("--config", "training/from_scratch/small_decoder_pilot_run_config.r25p.json");
  const checkpointPath = argValue("--checkpoint", FUTURE_REPLAYABLE_PATH);
  const config = await readJson(configPath);
  const outputDir = config.output_dir.endsWith("/") ? config.output_dir : `${config.output_dir}/`;
  const outputPath = `${outputDir}r25p_heldout_eval_report.json`;
  const trainPath = `${outputDir}r25p_train_sequences.json`;
  const devPath = `${outputDir}r25p_dev_sequences.json`;
  const heldoutPath = `${outputDir}r25p_heldout_sequences.json`;
  const failures = [];

  if (config.run_id !== "r25p_more_sequences_128") failures.push({ code: "unexpected_r25p_run_id", actual: config.run_id });
  if (config.heldout_source !== "training/llm_corpus/r25l_heldout.jsonl") failures.push({ code: "unexpected_heldout_source", actual: config.heldout_source });
  if (!(await exists(checkpointPath))) failures.push({ code: "replayable_checkpoint_missing", checkpointPath });
  if (!(await exists(heldoutPath))) failures.push({ code: "heldout_sequences_missing", heldoutPath });
  if (!(await isIgnored(checkpointPath))) failures.push({ code: "checkpoint_not_ignored", checkpointPath });
  const trackedWeights = (await gitLines(["ls-files"])).filter((path) => MODEL_WEIGHT_RE.test(path));
  const trackedArtifacts = await gitLines(["ls-files", "--cached", outputDir]);
  if (trackedWeights.length) failures.push({ code: "tracked_model_like_weight_extension", trackedWeights });
  if (trackedArtifacts.length) failures.push({ code: "r25p_artifacts_tracked_or_staged", trackedArtifacts });

  let checkpoint = null;
  let trainDataset = null;
  let devDataset = null;
  let heldoutDataset = null;
  if (failures.length === 0) {
    checkpoint = await readJson(checkpointPath);
    trainDataset = await readJson(trainPath);
    devDataset = await readJson(devPath);
    heldoutDataset = await readJson(heldoutPath);
    if (!checkpointReplayable(checkpoint)) failures.push({ code: "checkpoint_not_replayable", checkpointPath });
    if (checkpoint.run_id !== config.run_id) failures.push({ code: "checkpoint_run_id_mismatch", expected: config.run_id, actual: checkpoint.run_id });
    if (checkpoint.product_model !== false) failures.push({ code: "checkpoint_product_model_true" });
    if (checkpoint.release_checkpoint !== false) failures.push({ code: "checkpoint_release_checkpoint_true" });
    if (checkpoint.commit_allowed !== false) failures.push({ code: "checkpoint_commit_allowed_true" });
    if (heldoutDataset.split !== "heldout" || heldoutDataset.not_used_for_training !== true) {
      failures.push({ code: "heldout_dataset_not_marked_eval_only" });
    }
  }

  let replay = null;
  if (failures.length === 0) {
    const { stdout } = await execFileAsync("python3", [
      "scripts/eval_small_decoder_replay_heldout.py",
      "--checkpoint",
      checkpointPath,
      "--heldout",
      heldoutPath
    ], {
      cwd: ROOT,
      timeout: 120000,
      maxBuffer: 8 * 1024 * 1024
    });
    replay = JSON.parse(stdout.trim().split(/\r?\n(?=\{)/).at(-1) || stdout);
    if (!replay.ok || !Number.isFinite(replay.heldout_loss)) failures.push({ code: "heldout_replay_loss_not_finite", replay });
  }

  const trainDevHeldoutOverlap = trainDataset && devDataset && heldoutDataset ? overlapExists(trainDataset, devDataset, heldoutDataset) : false;
  if (trainDevHeldoutOverlap) failures.push({ code: "train_dev_heldout_overlap_detected" });

  const report = {
    ok: failures.length === 0,
    run_id: "r25p_more_sequences_128",
    heldout_sequences: heldoutDataset?.sequences?.length || 0,
    heldout_pairs: replay?.heldout_pairs || 0,
    heldout_loss: replay?.heldout_loss ?? null,
    heldout_loss_finite: Number.isFinite(replay?.heldout_loss),
    train_dev_heldout_overlap: trainDevHeldoutOverlap,
    checkpoint_path: checkpointPath,
    replayable_checkpoint_used: failures.length === 0,
    training_ran: false,
    product_model: false,
    release_checkpoint: false,
    notes: [
      "R25P held-out replay evaluates an already-written ignored JSON checkpoint and does not train.",
      "Held-out rows come from the R25L heldout split only and are not used for training.",
      "The replayable checkpoint remains ignored and is not a release checkpoint."
    ],
    failures
  };
  await writeJson(outputPath, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

async function main() {
  const run = argValue("--run", "r25o");
  if (run === "r25p") {
    await runR25pReplayMode();
    return;
  }
  await runDefaultScaffoldMode();
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
