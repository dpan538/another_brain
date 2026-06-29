#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { ROOT } from "./r18_utils.mjs";

const OUT = resolve(ROOT, "artifacts/training_os/r24c_behavior_repair_report.json");
const RECOVERY_REPORT = resolve(ROOT, "artifacts/training_os/r24_intelligence_recovery_report.json");
const LONG_REPORT = resolve(ROOT, "artifacts/training_os/long_horizon_eval_report.json");

function runScript(script) {
  const result = spawnSync("npm", ["run", script], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return {
    script,
    ok: result.status === 0,
    status: result.status,
    stdout_tail: String(result.stdout || "").slice(-1200),
    stderr_tail: String(result.stderr || "").slice(-1200)
  };
}

async function readJson(path, fallback = {}) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

function category(report, name) {
  return Number(report.category_scores?.[name] ?? 0);
}

async function main() {
  const runs = [runScript("eval:r24-intelligence-recovery"), runScript("eval:long-horizon")];
  const recovery = await readJson(RECOVERY_REPORT);
  const longHorizon = await readJson(LONG_REPORT);
  const answerableCollapseRate = Math.max(
    Number(recovery.fallback_overuse_rate || 0),
    Number(recovery.identity_collapse_rate || 0),
    Number(recovery.unknown_collapse_rate || 0)
  );
  const report = {
    ok: Boolean(recovery.ok && longHorizon.ok),
    diagnostic_only: true,
    recovery_ok: Boolean(recovery.ok),
    long_horizon_ok: Boolean(longHorizon.ok),
    arithmetic_pass_rate: category(recovery, "arithmetic"),
    answerable_collapse_rate: answerableCollapseRate,
    contextual_binding_pass_rate: Math.min(
      category(recovery, "contextual_followup") || 0,
      category(recovery, "current_session_memory") || 0
    ),
    long_horizon_task_continuation_pass_rate: Number(longHorizon.score || 0),
    fallback_overuse_rate: Number(recovery.fallback_overuse_rate || 0),
    identity_collapse_rate: Number(recovery.identity_collapse_rate || 0),
    unknown_collapse_rate: Number(recovery.unknown_collapse_rate || 0),
    recovery_score: Number(recovery.score || 0),
    long_horizon_score: Number(longHorizon.score || 0),
    long_horizon_tasks_passed: Number(longHorizon.tasks_passed || 0),
    long_horizon_tasks_total: Number(longHorizon.tasks_total || 0),
    source_runs: runs,
    report_path: OUT
  };
  await mkdir(resolve(ROOT, "artifacts/training_os"), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
