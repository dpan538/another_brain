#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const PLAN_CONFIG_PATH = "training/from_scratch/small_decoder_pilot_config.json";
const DEFAULT_RUN_CONFIG_PATH = "training/from_scratch/small_decoder_pilot_run_config.json";
const DEFAULT_APPROVAL_PATH = "training/from_scratch/APPROVE_R25M_SMALL_DECODER_PILOT.json";
const R25P_APPROVAL_PATH = "training/from_scratch/APPROVE_R25P_SECOND_SMALL_PILOT.json";

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

async function writeJson(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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

function normalizedDir(path) {
  return String(path || "").endsWith("/") ? String(path || "") : `${path}/`;
}

function runPrefix(runConfig) {
  return String(runConfig?.run_id || "").startsWith("r25p_") ? "r25p" : "r25m";
}

function expectedScope(runConfig) {
  return runPrefix(runConfig) === "r25p" ? "second_small_decoder_pilot_only" : "small_decoder_pilot_only";
}

function defaultApproval(runConfig) {
  return runPrefix(runConfig) === "r25p" ? R25P_APPROVAL_PATH : DEFAULT_APPROVAL_PATH;
}

function reportPaths(runConfig) {
  const outputDir = normalizedDir(runConfig.output_dir);
  const prefix = runPrefix(runConfig);
  return {
    outputDir,
    prefix,
    backend: `${outputDir}${prefix}_numeric_backend_report.json`,
    dataset: `${outputDir}${prefix}_dataset_report.json`,
    run: `${outputDir}${prefix}_small_decoder_run_report.json`,
    consumedSkip: `${outputDir}r25n_${prefix}_consumed_approval_skip_report.json`,
    approvalFailure: `${outputDir}${prefix}_approval_failure_report.json`
  };
}

function validateFreshApproval({ approval, approvalPath, runConfig, configPath }) {
  const failures = [];
  const prefix = runPrefix(runConfig);
  const scope = expectedScope(runConfig);
  const requestedRunId = runConfig.run_id;
  const requestedVariantId = runConfig.variant_id || requestedRunId;

  if (approvalPath.endsWith(".template.json")) failures.push({ code: "approval_template_cannot_authorize_training", path: approvalPath });
  if (!approval?.approved) failures.push({ code: "approval_missing_or_not_approved", path: approvalPath });
  if (approval?.is_template === true || approval?.template === true) failures.push({ code: "approval_template_flag_cannot_authorize_training" });
  if (approval?.consumed !== false) failures.push({ code: "fresh_approval_must_mark_consumed_false", consumed: approval?.consumed });
  if (approval?.allow_additional_runs === true) failures.push({ code: "fresh_approval_must_not_allow_additional_runs" });
  if (approval?.scope !== scope) failures.push({ code: "approval_scope_invalid", expected: scope, actual: approval?.scope });
  if (approval?.phase !== "phase_3_small_decoder_pilot") failures.push({ code: "approval_phase_invalid", phase: approval?.phase });
  if (approval?.run_id !== requestedRunId) failures.push({ code: "approval_run_id_mismatch", expected: requestedRunId, actual: approval?.run_id });
  if (prefix === "r25p" && approval?.variant_id !== requestedVariantId) {
    failures.push({ code: "approval_variant_id_mismatch", expected: requestedVariantId, actual: approval?.variant_id });
  }
  if (prefix === "r25p" && requestedVariantId !== "r25p_more_sequences_128") {
    failures.push({ code: "r25p_only_more_sequences_128_is_approved", actual: requestedVariantId });
  }
  if (approval?.allow_small_pilot_training !== true) failures.push({ code: "approval_must_allow_small_pilot_training" });
  if (approval?.allow_long_term_training !== false) failures.push({ code: "approval_must_not_allow_long_term_training" });
  if (approval?.allow_product_model_training !== false) failures.push({ code: "approval_must_not_allow_product_model_training" });
  if (approval?.allow_release_checkpoint !== false) failures.push({ code: "approval_must_not_allow_release_checkpoint" });
  if (approval?.allow_weight_commit !== false) failures.push({ code: "approval_must_not_allow_weight_commit" });
  if (approval?.allow_artifacts_write !== true) failures.push({ code: "approval_must_allow_ignored_artifact_write" });
  if (approval?.artifact_output_root !== normalizedDir(runConfig.output_dir)) {
    failures.push({
      code: "artifact_root_mismatch",
      approval_root: approval?.artifact_output_root,
      config_root: normalizedDir(runConfig.output_dir)
    });
  }
  if (runConfig.product_model !== false) failures.push({ code: "run_config_must_not_be_product" });
  if (runConfig.release_checkpoint !== false) failures.push({ code: "run_config_must_not_be_release_checkpoint" });
  if (runConfig.formal_product_training === true) failures.push({ code: "run_config_must_not_enable_formal_product_training" });
  if (runConfig.long_term_training === true) failures.push({ code: "run_config_must_not_enable_long_term_training" });
  if (runConfig.commit_weights_allowed !== false) failures.push({ code: "run_config_must_not_allow_weight_commit" });
  if (!normalizedDir(runConfig.output_dir).startsWith("artifacts/training_os/small_decoder_pilot/")) {
    failures.push({ code: "output_dir_outside_ignored_small_pilot_root", output_dir: runConfig.output_dir });
  }
  if (prefix === "r25p" && configPath !== "training/from_scratch/small_decoder_pilot_run_config.r25p.json") {
    failures.push({ code: "r25p_must_use_r25p_run_config", configPath });
  }
  return failures;
}

async function consumeR25pApproval(approvalPath, approval) {
  if (approvalPath !== R25P_APPROVAL_PATH) return;
  const consumed = {
    ...approval,
    consumed: true,
    allow_additional_runs: false,
    consumed_by_commit: "pending_r25p_commit",
    consumed_by_phase: "R25P",
    consumed_reason: "one-shot approval used for r25p_more_sequences_128; future runs require a new approval marker"
  };
  await writeJson(approvalPath, consumed);
}

async function main() {
  const allow = process.argv.includes("--allow-small-pilot-training");
  const configPath = argValue("--config", DEFAULT_RUN_CONFIG_PATH);
  const planConfig = await readJson(PLAN_CONFIG_PATH).catch(() => ({ output_dir: "artifacts/training_os/small_decoder_pilot/" }));
  const runConfig = await readJson(configPath).catch(() => ({
    run_id: "r25m_small_decoder_pilot_v0",
    output_dir: planConfig.output_dir || "artifacts/training_os/small_decoder_pilot/r25m/"
  }));
  runConfig.output_dir = normalizedDir(runConfig.output_dir);
  const paths = reportPaths(runConfig);
  await mkdir(resolve(ROOT, paths.outputDir), { recursive: true });

  if (!allow) {
    const report = {
      ok: true,
      skipped: true,
      reason: "explicit_phase_3_approval_required",
      training_ran: false,
      small_pilot_training_ran: false,
      formal_product_training: false,
      long_term_training: false,
      product_model: false,
      release_checkpoint: false,
      weights_written: false,
      weights_committed: false,
      output_dir: paths.outputDir
    };
    await writeJson(`${paths.outputDir}${paths.prefix}_small_decoder_pilot_skip_report.json`, report);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const approvalPath = argValue("--approval", argValue("--approval-marker", defaultApproval(runConfig)));
  const approval = await readJson(approvalPath).catch(() => null);
  if (approval?.consumed === true) {
    const report = {
      ok: true,
      skipped: true,
      reason: "approval_marker_consumed_new_approval_required",
      approval_marker: approvalPath,
      requested_run_id: runConfig.run_id,
      requested_variant_id: runConfig.variant_id || null,
      small_pilot_training_ran: false,
      formal_product_training: false,
      long_term_training: false,
      product_model: false,
      release_checkpoint: false,
      weights_written: false,
      weights_committed: false,
      notes: [
        "The referenced one-shot approval has already been consumed.",
        "Routine gates must use history/evaluation checks instead of rerunning training.",
        "A future pilot run requires a separate unconsumed approval marker with a matching run_id."
      ]
    };
    await writeJson(paths.consumedSkip, report);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const failures = validateFreshApproval({ approval, approvalPath, runConfig, configPath });
  if (!(await isIgnored(`${paths.outputDir}probe`))) failures.push({ code: "output_dir_not_ignored", output_dir: paths.outputDir });

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
    await writeJson(paths.approvalFailure, report);
    await writeJson(paths.run, report);
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  let backendReport = await readJson(paths.backend).catch(() => null);
  if (!backendReport?.ok) {
    await execFileAsync("node", [
      "scripts/check_small_decoder_numeric_backend.mjs",
      "--output-dir",
      paths.outputDir,
      "--prefix",
      paths.prefix
    ], {
      cwd: ROOT,
      timeout: 120000,
      maxBuffer: 4 * 1024 * 1024
    });
    backendReport = await readJson(paths.backend);
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
      artifact_paths: [paths.run, paths.backend],
      weights_tracked: false,
      notes: [
        "The bounded small decoder pilot did not run because no local numeric backend was available.",
        "No pilot progress or training-readiness increase should be claimed from blocked mode."
      ]
    };
    await consumeR25pApproval(approvalPath, approval);
    await writeJson(paths.run, blocked);
    console.log(JSON.stringify(blocked, null, 2));
    return;
  }

  const datasetReport = await readJson(paths.dataset).catch(() => null);
  if (!datasetReport?.ok) {
    const report = {
      ok: false,
      skipped: false,
      reason: "small_decoder_pilot_dataset_artifacts_missing_or_not_ok",
      small_pilot_training_ran: false,
      formal_product_training: false,
      long_term_training: false,
      product_model: false,
      release_checkpoint: false,
      backend: backendReport.backend,
      failures: [{ code: "dataset_report_missing_or_not_ok", path: paths.dataset }]
    };
    await writeJson(paths.run, report);
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  await execFileAsync("python3", [
    "scripts/train_small_decoder_pilot.py",
    "--config",
    configPath,
    "--backend",
    backendReport.backend
  ], {
    cwd: ROOT,
    timeout: 240000,
    maxBuffer: 16 * 1024 * 1024
  });

  const report = await readJson(paths.run);
  await consumeR25pApproval(approvalPath, approval);
  const trackedArtifacts = await gitLines(["ls-files", "--cached", paths.outputDir]);
  if (trackedArtifacts.length) {
    report.ok = false;
    report.weights_tracked = true;
    report.failures = [...(report.failures || []), { code: "pilot_artifacts_tracked_or_staged", trackedArtifacts }];
    await writeJson(paths.run, report);
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
