#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const CONFIG_PATH = "training/from_scratch/small_decoder_pilot_config.json";
const RUN_CONFIG_PATH = "training/from_scratch/small_decoder_pilot_run_config.json";
const APPROVAL_PATH = "training/from_scratch/APPROVE_R25M_SMALL_DECODER_PILOT.json";
const BACKEND_REPORT_PATH = "artifacts/training_os/small_decoder_pilot/r25m/r25m_numeric_backend_report.json";
const DATASET_REPORT_PATH = "artifacts/training_os/small_decoder_pilot/r25m/r25m_dataset_report.json";
const RUN_REPORT_PATH = "artifacts/training_os/small_decoder_pilot/r25m/r25m_small_decoder_run_report.json";
const CONSUMED_SKIP_REPORT_PATH = "artifacts/training_os/small_decoder_pilot/r25m/r25n_r25m_consumed_approval_skip_report.json";

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

async function writeJson(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function runNodeScript(script) {
  const { stdout } = await execFileAsync("node", [script], {
    cwd: ROOT,
    timeout: 30000,
    maxBuffer: 4 * 1024 * 1024
  });
  return stdout;
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

function argValue(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

async function main() {
  const config = await readJson(CONFIG_PATH);
  const allow = process.argv.includes("--allow-small-pilot-training");
  await mkdir(resolve(ROOT, config.output_dir), { recursive: true });

  if (!allow) {
    const report = {
      ok: true,
      skipped: true,
      reason: "explicit_phase_3_approval_required",
      training_ran: false,
      formal_decoder_training: false,
      product_model: false,
      weights_written: false,
      weights_committed: false,
      output_dir: config.output_dir
    };
    await writeJson(`${config.output_dir}r25l_small_decoder_pilot_skip_report.json`, report);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const failures = [];
  const runConfig = await readJson(RUN_CONFIG_PATH).catch(() => null);
  const approvalPath = argValue("--approval-marker", APPROVAL_PATH);
  const requestedRunId = argValue("--run-id", runConfig?.run_id || "r25m_small_decoder_pilot_v0");
  const approval = await readJson(approvalPath).catch(() => null);

  if (approval?.consumed === true) {
    const report = {
      ok: true,
      skipped: true,
      reason: "approval_marker_consumed_new_approval_required",
      approval_marker: approvalPath,
      requested_run_id: requestedRunId,
      small_pilot_training_ran: false,
      formal_product_training: false,
      long_term_training: false,
      product_model: false,
      release_checkpoint: false,
      weights_written: false,
      weights_committed: false,
      notes: [
        "The historical R25M one-shot approval has already been consumed.",
        "R25N must not rerun small decoder pilot training.",
        "A future pilot run requires a separate unconsumed approval marker with a matching run_id."
      ]
    };
    await writeJson(CONSUMED_SKIP_REPORT_PATH, report);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (!runConfig) failures.push({ code: "r25m_run_config_missing", path: RUN_CONFIG_PATH });
  if (approvalPath.endsWith(".template.json")) failures.push({ code: "approval_template_cannot_authorize_training", path: approvalPath });
  if (!approval?.approved) failures.push({ code: "r25m_approval_missing_or_not_approved", path: APPROVAL_PATH });
  if (approvalPath === APPROVAL_PATH) failures.push({ code: "historical_r25m_approval_marker_cannot_be_reused", path: APPROVAL_PATH });
  if (approval?.consumed !== false) failures.push({ code: "fresh_r25m_approval_must_mark_consumed_false", consumed: approval?.consumed });
  if (approval?.allow_additional_runs === true) failures.push({ code: "fresh_r25m_approval_must_not_allow_additional_runs" });
  if (approval?.run_id !== requestedRunId) failures.push({ code: "fresh_r25m_approval_run_id_mismatch", expected: requestedRunId, actual: approval?.run_id });
  if (approval?.scope !== "small_decoder_pilot_only") failures.push({ code: "r25m_approval_scope_invalid", scope: approval?.scope });
  if (approval?.phase !== "phase_3_small_decoder_pilot") failures.push({ code: "r25m_approval_phase_invalid", phase: approval?.phase });
  if (approval?.allow_small_pilot_training !== true) failures.push({ code: "r25m_approval_must_allow_small_pilot_training" });
  if (approval?.allow_long_term_training !== false) failures.push({ code: "r25m_approval_must_not_allow_long_term_training" });
  if (approval?.allow_product_model_training !== false) failures.push({ code: "r25m_approval_must_not_allow_product_model_training" });
  if (approval?.allow_release_checkpoint !== false) failures.push({ code: "r25m_approval_must_not_allow_release_checkpoint" });
  if (approval?.allow_weight_commit !== false) failures.push({ code: "r25m_approval_must_not_allow_weight_commit" });
  if (approval?.allow_artifacts_write !== true) failures.push({ code: "r25m_approval_must_allow_ignored_artifact_write" });
  if (approval?.is_template === true || approval?.template === true) failures.push({ code: "approval_template_flag_cannot_authorize_training" });
  if (approval?.artifact_output_root !== config.output_dir) failures.push({ code: "r25m_artifact_root_mismatch", approval_root: approval?.artifact_output_root, config_root: config.output_dir });
  if (runConfig) {
    if (runConfig.product_model !== false) failures.push({ code: "r25m_run_config_must_not_be_product" });
    if (runConfig.release_checkpoint !== false) failures.push({ code: "r25m_run_config_must_not_be_release_checkpoint" });
    if (runConfig.commit_weights_allowed !== false) failures.push({ code: "r25m_run_config_must_not_allow_weight_commit" });
    if (!String(runConfig.output_dir || "").startsWith(config.output_dir)) failures.push({ code: "r25m_output_dir_outside_pilot_root", output_dir: runConfig.output_dir });
    if (!(await isIgnored(`${runConfig.output_dir}probe`))) failures.push({ code: "r25m_output_dir_not_ignored", output_dir: runConfig.output_dir });
  }

  if (failures.length) {
    const report = {
      ok: false,
      skipped: false,
      small_pilot_training_ran: false,
      formal_product_training: false,
      long_term_training: false,
      product_model: false,
      release_checkpoint: false,
      failures
    };
    await writeJson(RUN_REPORT_PATH, report);
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  await mkdir(resolve(ROOT, runConfig.output_dir), { recursive: true });
  let backendReport = await readJson(BACKEND_REPORT_PATH).catch(() => null);
  if (!backendReport?.ok) {
    await runNodeScript("scripts/check_small_decoder_numeric_backend.mjs");
    backendReport = await readJson(BACKEND_REPORT_PATH);
  }
  if (!backendReport.can_run_small_pilot) {
    const blocked = {
      ok: true,
      skipped: true,
      reason: `numeric_backend_unavailable:${backendReport.reason}`,
      small_pilot_training_ran: false,
      formal_product_training: false,
      long_term_training: false,
      product_model: false,
      release_checkpoint: false,
      backend: backendReport.backend,
      steps: 0,
      artifact_paths: [RUN_REPORT_PATH, BACKEND_REPORT_PATH],
      weights_tracked: false,
      notes: [
        "R25M did not run because no local numeric backend was available.",
        "No pilot progress or training-readiness increase should be claimed from blocked mode."
      ]
    };
    await writeJson(RUN_REPORT_PATH, blocked);
    console.log(JSON.stringify(blocked, null, 2));
    return;
  }

  const datasetReport = await readJson(DATASET_REPORT_PATH).catch(() => null);
  if (!datasetReport?.ok) {
    const report = {
      ok: false,
      skipped: false,
      reason: "r25m_dataset_artifacts_missing_or_not_ok",
      small_pilot_training_ran: false,
      formal_product_training: false,
      long_term_training: false,
      product_model: false,
      release_checkpoint: false,
      backend: backendReport.backend,
      failures: [{ code: "dataset_report_missing_or_not_ok", path: DATASET_REPORT_PATH }]
    };
    await writeJson(RUN_REPORT_PATH, report);
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  await execFileAsync("python3", [
    "scripts/train_small_decoder_pilot.py",
    "--config",
    RUN_CONFIG_PATH,
    "--backend",
    backendReport.backend
  ], {
    cwd: ROOT,
    timeout: 120000,
    maxBuffer: 12 * 1024 * 1024
  });

  const report = await readJson(RUN_REPORT_PATH);
  const trackedArtifacts = await gitLines(["ls-files", "--cached", runConfig.output_dir]);
  if (trackedArtifacts.length) {
    report.ok = false;
    report.weights_tracked = true;
    report.failures = [...(report.failures || []), { code: "pilot_artifacts_tracked_or_staged", trackedArtifacts }];
    await writeJson(RUN_REPORT_PATH, report);
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
