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
const OUTPUT_PATH = "artifacts/training_os/small_decoder_pilot/r25o/r25o_replay_heldout_eval_report.json";
const HELDOUT_SOURCE = "training/llm_corpus/r25l_heldout.jsonl";
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

async function main() {
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
      heldout_source: HELDOUT_SOURCE,
      heldout_loss: null,
      product_model: false,
      release_checkpoint: false,
      replayable_checkpoint_used: false,
      failures
    };
    await writeJson(OUTPUT_PATH, skipped);
    console.log(JSON.stringify(skipped, null, 2));
    if (!skipped.ok) process.exit(2);
    return;
  }

  const checkpoint = await readJson(FUTURE_REPLAYABLE_PATH);
  if (!checkpointReplayable(checkpoint)) failures.push({ code: "future_checkpoint_not_replayable", path: FUTURE_REPLAYABLE_PATH });
  if (!(await isIgnored(FUTURE_REPLAYABLE_PATH))) failures.push({ code: "future_checkpoint_not_ignored", path: FUTURE_REPLAYABLE_PATH });

  const report = {
    ok: failures.length === 0,
    skipped: failures.length > 0,
    reason: failures.length ? "future_replayable_checkpoint_failed_structural_validation" : null,
    training_ran: false,
    evaluation_type: "future_replayable_checkpoint_scaffold",
    replayable_checkpoint_used: failures.length === 0,
    checkpoint_path: FUTURE_REPLAYABLE_PATH,
    heldout_source: HELDOUT_SOURCE,
    heldout_loss: null,
    heldout_loss_status: "not_computed_until_r25p_training_writes_supported_tensor_layout",
    product_model: false,
    release_checkpoint: false,
    notes: [
      "R25O does not train.",
      "True held-out replay loss is prepared for R25P replayable checkpoints.",
      "The first replayable tensor layout should be validated before any product claim."
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
