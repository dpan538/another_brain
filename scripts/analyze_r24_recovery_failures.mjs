#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ROOT } from "./r18_utils.mjs";

const INTELLIGENCE_REPORT = resolve(ROOT, "artifacts/training_os/r24_intelligence_recovery_report.json");
const LONG_HORIZON_REPORT = resolve(ROOT, "artifacts/training_os/long_horizon_eval_report.json");

function runNpm(script) {
  const result = spawnSync("npm", ["run", script], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return {
    script,
    status: result.status,
    ok: result.status === 0,
    stdout: result.stdout || "",
    stderr: result.stderr || ""
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function pushMode(summary, mode, row, examples) {
  summary[mode] = (summary[mode] || 0) + 1;
  if (examples.length < 40) {
    examples.push({
      mode,
      id: row.id || row.task_id || "",
      category: row.category || row.task_family || "",
      failures: row.failures || [],
      answer: row.answer || row.final_answer || "",
      route: row.route || ""
    });
  }
}

function analyzeRecovery(report, summary, examples) {
  for (const row of report.examples_failed || []) {
    const failures = row.failures || [];
    if (row.category === "arithmetic" && failures.some((item) => /fallback|arithmetic/.test(item))) {
      pushMode(summary, "arithmetic_to_fallback", row, examples);
    }
    if (failures.includes("identity_collapse")) pushMode(summary, "answerable_to_identity", row, examples);
    if (failures.includes("unknown_or_refusal_collapse")) pushMode(summary, "answerable_to_unknown", row, examples);
    if (/问百度/.test(row.answer || "")) pushMode(summary, "answerable_to_search", row, examples);
    if (failures.includes("context_ignored") || failures.includes("session_memory_missed")) {
      pushMode(summary, "context_binding_lost", row, examples);
    }
    if (failures.includes("project_task_no_next_action")) pushMode(summary, "project_continuation_restart", row, examples);
    if (failures.includes("private_detail_fabricated")) pushMode(summary, "privacy_overanswer", row, examples);
    if (failures.includes("unknown_overanswered")) pushMode(summary, "unknown_overanswer", row, examples);
    if (failures.some((item) => /fallback_route/.test(item)) || row.route === "fallback_firewall") {
      pushMode(summary, "fallback_firewall_overtrigger", row, examples);
    }
    if (failures.includes("missing_semantic_marker")) pushMode(summary, "route_mismatch", row, examples);
    if (failures.some((item) => /too_long|too_short|empty/.test(item))) pushMode(summary, "answer_density_error", row, examples);
  }
}

function analyzeLongHorizon(report, summary, examples) {
  for (const row of report.failed_tasks || []) {
    const failures = row.failures || [];
    if (failures.includes("project_not_continued") || failures.includes("missing_next_action")) {
      pushMode(summary, "project_continuation_restart", row, examples);
    }
    if (failures.includes("final_missing_marker")) pushMode(summary, "constraint_dropped", row, examples);
    if (failures.some((item) => /collapse:identity/.test(item))) pushMode(summary, "answerable_to_identity", row, examples);
    if (failures.some((item) => /collapse:unknown/.test(item))) pushMode(summary, "answerable_to_unknown", row, examples);
    if (failures.includes("privacy_boundary_missing")) pushMode(summary, "privacy_overanswer", row, examples);
    if (failures.some((item) => /empty|too_long/.test(item))) pushMode(summary, "answer_density_error", row, examples);
    if (/没接住|对象和方向/.test(row.final_answer || "")) pushMode(summary, "fallback_firewall_overtrigger", row, examples);
  }
}

async function main() {
  const runs = [runNpm("eval:r24-intelligence-recovery"), runNpm("eval:long-horizon")];
  const recovery = await readJson(INTELLIGENCE_REPORT);
  const longHorizon = await readJson(LONG_HORIZON_REPORT);
  const summary = {};
  const examples = [];
  analyzeRecovery(recovery, summary, examples);
  analyzeLongHorizon(longHorizon, summary, examples);
  const top_failure_modes = Object.entries(summary)
    .map(([mode, count]) => ({ mode, count }))
    .sort((left, right) => right.count - left.count || left.mode.localeCompare(right.mode));
  const report = {
    ok: recovery.ok && longHorizon.ok,
    summary,
    top_failure_modes,
    examples,
    source_reports: {
      intelligence_recovery: {
        ok: recovery.ok,
        score: recovery.score,
        fallback_overuse_rate: recovery.fallback_overuse_rate
      },
      long_horizon: {
        ok: longHorizon.ok,
        score: longHorizon.score,
        tasks_passed: longHorizon.tasks_passed,
        tasks_total: longHorizon.tasks_total
      }
    },
    runs: runs.map((run) => ({ script: run.script, status: run.status, ok: run.ok }))
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
