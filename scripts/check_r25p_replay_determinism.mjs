#!/usr/bin/env node
import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const OUTPUT_DIR = "artifacts/training_os/small_decoder_pilot/r25q/";
const OUTPUT_PATH = `${OUTPUT_DIR}r25q_replay_determinism_report.json`;
const CHECKPOINT_PATH = "artifacts/training_os/small_decoder_pilot/r25p/r25p_replayable_checkpoint.json";
const DEV_SEQUENCES_PATH = "artifacts/training_os/small_decoder_pilot/r25p/r25p_dev_sequences.json";
const HELDOUT_SEQUENCES_PATH = "artifacts/training_os/small_decoder_pilot/r25p/r25p_heldout_sequences.json";
const TOLERANCE = 1e-10;

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

function finite(value) {
  return Number.isFinite(Number(value));
}

async function replay(label, sequencePath) {
  const { stdout } = await execFileAsync("python3", [
    "scripts/eval_small_decoder_replay_heldout.py",
    "--checkpoint",
    CHECKPOINT_PATH,
    "--heldout",
    sequencePath
  ], {
    cwd: ROOT,
    timeout: 120000,
    maxBuffer: 12 * 1024 * 1024
  });
  const output = JSON.parse(stdout.trim().split(/\r?\n(?=\{)/).at(-1) || stdout);
  return {
    label,
    ok: output.ok === true,
    loss: output.heldout_loss,
    pairs: output.heldout_pairs,
    finite: output.heldout_loss_finite === true
  };
}

function comparePair(first, second) {
  const delta = Math.abs(Number(first.loss) - Number(second.loss));
  return {
    label: first.label,
    first_loss: first.loss,
    second_loss: second.loss,
    absolute_delta: delta,
    deterministic: finite(first.loss) && finite(second.loss) && delta <= TOLERANCE && first.pairs === second.pairs
  };
}

function reusableHistoricalReport(report) {
  if (report?.ok !== true) return false;
  if (report?.skipped === true) return false;
  if (report?.training_ran !== false) return false;
  if (report?.checkpoint_path !== CHECKPOINT_PATH) return false;
  if (report?.product_model !== false) return false;
  if (report?.release_checkpoint !== false) return false;
  if (report?.deterministic !== true) return false;
  for (const item of [report?.dev, report?.heldout]) {
    if (!item || item.deterministic !== true) return false;
    if (!finite(item.first_loss) || !finite(item.second_loss)) return false;
    if (Number(item.absolute_delta) > TOLERANCE) return false;
  }
  return true;
}

async function main() {
  const required = [CHECKPOINT_PATH, DEV_SEQUENCES_PATH, HELDOUT_SEQUENCES_PATH];
  const missing = [];
  for (const path of required) {
    if (!(await exists(path))) missing.push(path);
  }
  if (missing.length) {
    const report = {
      ok: true,
      skipped: true,
      reason: "ignored_artifacts_missing",
      missing,
      training_ran: false,
      notes: ["Replay determinism is skipped because local ignored artifacts are absent."]
    };
    await writeJson(OUTPUT_PATH, report);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (await exists(OUTPUT_PATH)) {
    const historicalReport = await readJson(OUTPUT_PATH);
    if (reusableHistoricalReport(historicalReport)) {
      const report = {
        ...historicalReport,
        reused_existing_ignored_report: true,
        notes: [
          ...(historicalReport.notes || []),
          "Routine R25Q/R25W gates reuse this valid ignored determinism report instead of recomputing replay."
        ]
      };
      console.log(JSON.stringify(report, null, 2));
      return;
    }
  }

  const checkpoint = await readJson(CHECKPOINT_PATH);
  const failures = [];
  if (checkpoint.product_model !== false) failures.push({ code: "checkpoint_product_model_true" });
  if (checkpoint.release_checkpoint !== false) failures.push({ code: "checkpoint_release_checkpoint_true" });
  if (checkpoint.commit_allowed !== false) failures.push({ code: "checkpoint_commit_allowed_true" });

  const devFirst = await replay("dev", DEV_SEQUENCES_PATH);
  const devSecond = await replay("dev", DEV_SEQUENCES_PATH);
  const heldoutFirst = await replay("heldout", HELDOUT_SEQUENCES_PATH);
  const heldoutSecond = await replay("heldout", HELDOUT_SEQUENCES_PATH);
  const comparisons = [comparePair(devFirst, devSecond), comparePair(heldoutFirst, heldoutSecond)];
  for (const item of [...comparisons, devFirst, devSecond, heldoutFirst, heldoutSecond]) {
    if (item.finite === false || item.ok === false) failures.push({ code: "replay_metric_not_finite_or_not_ok", item });
  }
  for (const item of comparisons) {
    if (!item.deterministic) failures.push({ code: "replay_metric_nondeterministic", item });
  }

  const report = {
    ok: failures.length === 0,
    skipped: false,
    training_ran: false,
    checkpoint_path: CHECKPOINT_PATH,
    tolerance: TOLERANCE,
    dev: comparisons[0],
    heldout: comparisons[1],
    replay_runs: [devFirst, devSecond, heldoutFirst, heldoutSecond],
    product_model: false,
    release_checkpoint: false,
    deterministic: failures.length === 0,
    status: failures.length === 0 ? "deterministic" : "failed",
    notes: [
      "This check replays an ignored checkpoint twice on dev and heldout sequences.",
      "It does not train and does not mutate the checkpoint."
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
