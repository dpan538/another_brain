#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { ROOT } from "./r18_utils.mjs";

const OUT = resolve(ROOT, "artifacts/training_os/r24e_residual_miss_report.json");
const REPORTS = {
  seed: resolve(ROOT, "artifacts/training_os/long_horizon_eval_report.json"),
  heldout: resolve(ROOT, "artifacts/training_os/long_horizon_heldout_eval_report.json"),
  recovery: resolve(ROOT, "artifacts/training_os/r24d_heldout_recovery_report.json"),
  drift: resolve(ROOT, "artifacts/training_os/task_state_drift_report.json"),
  route: resolve(ROOT, "artifacts/training_os/route_distribution_audit_report.json")
};

const COMMANDS = [
  ["check:long-horizon", REPORTS.seed],
  ["check:long-horizon-heldout", REPORTS.heldout],
  ["check:r24d-heldout-recovery", REPORTS.recovery],
  ["eval:task-state-drift", REPORTS.drift],
  ["eval:route-distribution", REPORTS.route]
];

async function readJson(path, fallback = {}) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

function runNpm(script) {
  const result = spawnSync("npm", ["run", script], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024
  });
  return {
    script,
    ok: result.status === 0,
    status: result.status,
    stdout_tail: String(result.stdout || "").slice(-1200),
    stderr_tail: String(result.stderr || "").slice(-1200)
  };
}

function classifyMiss(row = {}) {
  const text = [
    row.task_id,
    row.id,
    row.task_family,
    row.category,
    row.final_answer,
    row.answer,
    ...(row.failures || [])
  ].join(" ");
  const failures = row.failures || [];
  const answer = `${row.final_answer || row.answer || ""}`;

  if (/local_first|local-first|本地优先/.test(text) && !/本地/.test(answer)) return "missing_local_first_marker";
  if (/default local|默认.*本地|推理和训练/.test(text) && !/本地/.test(answer)) return "missing_default_local_marker";
  if (/不补|知识扩展|百科事实|knowledge_expansion/.test(text) && !/不补|不扩|不要/.test(answer)) return "knowledge_expansion_constraint_dropped";
  if (/模板|template/.test(text) && /schema|最小检查/.test(answer)) return "template_feedback_misread";
  if (/先跑最小检查|schema\/eval|schema 和 seed/.test(answer)) return "next_action_too_generic";
  if (/task_state|drift|topic/.test(text)) return "project_state_topic_drift";
  if (failures.some((failure) => /missing_marker|final_missing_marker|semantic_marker/.test(failure))) return "answer_density_removed_marker";
  if (failures.some((failure) => /route|fallback/.test(failure))) return "route_mismatch";
  if (failures.some((failure) => /too_long|too_short/.test(failure))) return "validator_too_brittle";
  return "true_behavior_failure";
}

function countModes(rows) {
  const counts = new Map();
  for (const row of rows) {
    const mode = classifyMiss(row);
    counts.set(mode, (counts.get(mode) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([mode, count]) => ({ mode, count }));
}

function repairForMode(mode) {
  const repairs = {
    missing_local_first_marker: "Preserve local-first/static deployment markers in deployment continuation answers.",
    missing_default_local_marker: "Keep default-local and no-cloud-inference language when answering deployment-location follow-ups.",
    knowledge_expansion_constraint_dropped: "Treat no-knowledge-expansion as a project constraint, not as a request for more factual cards.",
    template_feedback_misread: "Separate critique/revision signals from generic schema/eval continuation.",
    next_action_too_generic: "Prefer the active task's concrete next action over generic schema/eval/check wording.",
    project_state_topic_drift: "Bind continuation to current task topic and constraints before falling back to broad R24 context.",
    answer_density_removed_marker: "Short answers must keep required semantic markers before trimming.",
    route_mismatch: "Check answerability and route priority before fallback or project-continuation rewrites.",
    validator_too_brittle: "Review validators only when the answer satisfies the intended semantic behavior.",
    true_behavior_failure: "Repair controller behavior generally; do not hardcode the prompt."
  };
  return repairs[mode] || repairs.true_behavior_failure;
}

async function main() {
  const command_results = COMMANDS.map(([script]) => runNpm(script));
  const seed = await readJson(REPORTS.seed);
  const heldout = await readJson(REPORTS.heldout);
  const recovery = await readJson(REPORTS.recovery);
  const drift = await readJson(REPORTS.drift);
  const route = await readJson(REPORTS.route);

  const seed_long_horizon_misses = seed.failed_tasks || [];
  const heldout_long_horizon_misses = heldout.failed_tasks || [];
  const heldout_recovery_internal_failures = recovery.failed_examples || [];
  const allMisses = [
    ...seed_long_horizon_misses,
    ...heldout_long_horizon_misses,
    ...heldout_recovery_internal_failures,
    ...(drift.drift_failures || []),
    ...(drift.constraint_failures || []),
    ...(drift.generic_answer_failures || []),
    ...(route.failures || [])
  ];
  const top_failure_modes = countModes(allMisses);
  const suggested_general_repairs = [...new Set(top_failure_modes.map((item) => repairForMode(item.mode)))];
  const ok =
    command_results.every((item) => item.ok) &&
    seed_long_horizon_misses.length === 0 &&
    heldout_long_horizon_misses.length === 0 &&
    heldout_recovery_internal_failures.length === 0 &&
    drift.ok === true &&
    route.ok === true;

  const report = {
    ok,
    command_results,
    seed_long_horizon_misses,
    heldout_long_horizon_misses,
    heldout_recovery_internal_failures,
    top_failure_modes,
    suggested_general_repairs
  };
  await mkdir(resolve(ROOT, "artifacts/training_os"), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ...report, report_path: OUT }, null, 2));
  if (!ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
