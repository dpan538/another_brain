#!/usr/bin/env node
import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const SCHEMA_PATH = "training/from_scratch/small_decoder_checkpoint.schema.json";
const R25M_CHECKPOINT_PATH = "artifacts/training_os/small_decoder_pilot/r25m/r25m_small_decoder_checkpoint.json";
const FUTURE_REPLAYABLE_PATH = "artifacts/training_os/small_decoder_pilot/r25p/r25p_replayable_checkpoint.json";
const OUTPUT_PATH = "artifacts/training_os/small_decoder_pilot/r25o/r25o_checkpoint_schema_report.json";
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

function validateSchemaShape(schema) {
  const failures = [];
  const required = [
    "schema_version",
    "run_id",
    "phase",
    "model_type",
    "architecture",
    "tokenizer_id",
    "vocab_size",
    "max_context_tokens",
    "parameter_count",
    "parameter_tensors",
    "training_config_digest",
    "dataset_digest",
    "tokenizer_digest",
    "metrics_digest",
    "product_model",
    "release_checkpoint",
    "commit_allowed",
    "created_for",
    "notes"
  ];
  for (const key of required) {
    if (!schema.required?.includes(key)) failures.push({ code: "schema_required_field_missing", key });
  }
  if (schema.properties?.product_model?.const !== false) failures.push({ code: "schema_product_model_not_const_false" });
  if (schema.properties?.release_checkpoint?.const !== false) failures.push({ code: "schema_release_checkpoint_not_const_false" });
  if (schema.properties?.commit_allowed?.const !== false) failures.push({ code: "schema_commit_allowed_not_const_false" });
  if (schema.properties?.created_for?.const !== "small_decoder_pilot_only") failures.push({ code: "schema_created_for_not_pilot_only" });
  return failures;
}

function validateReplayableCheckpoint(checkpoint, path) {
  const failures = [];
  if (checkpoint.schema_version !== "r25o_small_decoder_checkpoint_v1") failures.push({ code: "checkpoint_schema_version_invalid", path });
  if (checkpoint.product_model !== false) failures.push({ code: "checkpoint_claims_product_model", path });
  if (checkpoint.release_checkpoint !== false) failures.push({ code: "checkpoint_claims_release_checkpoint", path });
  if (checkpoint.commit_allowed !== false) failures.push({ code: "checkpoint_allows_commit", path });
  if (checkpoint.created_for !== "small_decoder_pilot_only") failures.push({ code: "checkpoint_created_for_invalid", path });
  if (!Array.isArray(checkpoint.parameter_tensors) || checkpoint.parameter_tensors.length === 0) failures.push({ code: "checkpoint_missing_parameter_tensors", path });
  if (MODEL_WEIGHT_RE.test(path)) failures.push({ code: "checkpoint_uses_forbidden_binary_extension", path });
  return failures;
}

async function main() {
  const schema = await readJson(SCHEMA_PATH);
  const failures = validateSchemaShape(schema);
  const trackedWeights = (await gitLines(["ls-files"])).filter((path) => MODEL_WEIGHT_RE.test(path));
  if (trackedWeights.length) failures.push({ code: "tracked_model_like_weight_extension", trackedWeights });

  let r25mCheckpointStatus = "missing";
  let r25mReplayable = false;
  if (await exists(R25M_CHECKPOINT_PATH)) {
    const checkpoint = await readJson(R25M_CHECKPOINT_PATH);
    r25mReplayable = Array.isArray(checkpoint.parameter_tensors) && checkpoint.parameter_tensors.length > 0;
    r25mCheckpointStatus = r25mReplayable ? "unexpected_replayable" : "legacy_digest_non_replayable";
    if (r25mReplayable) failures.push({ code: "r25m_checkpoint_unexpectedly_replayable", path: R25M_CHECKPOINT_PATH });
  }

  let futureCheckpointStatus = "not_present";
  let futureReplayable = false;
  if (await exists(FUTURE_REPLAYABLE_PATH)) {
    const checkpoint = await readJson(FUTURE_REPLAYABLE_PATH);
    const checkpointFailures = validateReplayableCheckpoint(checkpoint, FUTURE_REPLAYABLE_PATH);
    futureReplayable = checkpointFailures.length === 0;
    futureCheckpointStatus = futureReplayable ? "valid_replayable_checkpoint" : "invalid_replayable_checkpoint";
    failures.push(...checkpointFailures);
    if (!(await isIgnored(FUTURE_REPLAYABLE_PATH))) failures.push({ code: "future_replayable_checkpoint_not_ignored", path: FUTURE_REPLAYABLE_PATH });
    const trackedFuture = await gitLines(["ls-files", "--cached", FUTURE_REPLAYABLE_PATH]);
    if (trackedFuture.length) failures.push({ code: "future_replayable_checkpoint_tracked_or_staged", trackedFuture });
  }

  const report = {
    ok: failures.length === 0,
    schema_path: SCHEMA_PATH,
    schema_valid: failures.every((failure) => !String(failure.code).startsWith("schema_")),
    r25m_checkpoint_status: r25mCheckpointStatus,
    r25m_checkpoint_replayable: r25mReplayable,
    future_replayable_checkpoint_status: futureCheckpointStatus,
    future_replayable_checkpoint_replayable: futureReplayable,
    product_model: false,
    release_checkpoint: false,
    commit_allowed: false,
    tracked_model_like_files: trackedWeights,
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
