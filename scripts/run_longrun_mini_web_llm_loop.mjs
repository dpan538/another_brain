#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "artifacts/training_os/r16_mini_web_llm_loop_report.json");

const COMMANDS = [
  ["audit:training-depth", ["npm", "run", "audit:training-depth"]],
  ["check_open_datasets", ["npm", "run", "check:open-datasets"]],
  ["check_source_licenses", ["npm", "run", "check:source-licenses"]],
  ["audit_culture_coverage", ["npm", "run", "audit:culture-coverage"]],
  ["audit_anchor_overfit", ["npm", "run", "audit:anchor-overfit:report"]],
  ["eval_r12_blind_gate", ["npm", "run", "eval:r12-blind-gate:report"]],
  ["eval_r13_coverage", ["npm", "run", "eval:r13-coverage:report"]],
  ["eval_controlled_gate", ["npm", "run", "eval:controlled-gate"]],
  ["eval_mini_web_llm_readiness", ["npm", "run", "eval:mini-web-llm-readiness"]],
  ["eval_browser_profile", ["npm", "run", "eval:browser-profile"]],
  ["check_external_culture_coverage", ["npm", "run", "check:external-culture-coverage"]]
];

function classifyFailure(name, stdout, stderr, status) {
  const text = `${name}\n${stdout}\n${stderr}`.toLowerCase();
  if (status === 0 && /ready_for_runtime": false|browser profile over budget|meets_large_r16_targets": false/.test(text)) {
    return "readiness_not_met";
  }
  if (status === 0) return "not_failure";
  if (/license|source/.test(text)) return "license_unclear";
  if (/anchor|overfit/.test(text)) return "controlled_gate_overfit";
  if (/coverage|missing_card|missing_relation/.test(text)) return "missing_external_source";
  if (/browser|budget|latency/.test(text)) return "browser_latency_risk";
  if (/controlled|gate|accuracy/.test(text)) return "controlled_gate_misclassification";
  return status === 0 ? "not_failure" : "command_failed";
}

function runCommand(name, command) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(command[0], command.slice(1), {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 8
  });
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  const failureGroup = classifyFailure(name, stdout, stderr, result.status ?? 1);
  return {
    name,
    command: command.join(" "),
    started_at: startedAt,
    ended_at: new Date().toISOString(),
    status: result.status ?? 1,
    ok: result.status === 0,
    failure_group: failureGroup,
    stdout_tail: stdout.slice(-3000),
    stderr_tail: stderr.slice(-3000)
  };
}

async function main() {
  const cycles = Number(process.argv.find((arg) => arg.startsWith("--cycles="))?.split("=")[1] || 3);
  const report = {
    started_at: new Date().toISOString(),
    cycles_requested: cycles,
    cycles: [],
    grouped_failures: {},
    stopped_early: false,
    note: "Loop runner is report-only and never edits files."
  };

  for (let index = 1; index <= cycles; index += 1) {
    const cycle = { cycle: index, started_at: new Date().toISOString(), commands: [], failures: [] };
    for (const [name, command] of COMMANDS) {
      const commandReport = runCommand(name, command);
      cycle.commands.push(commandReport);
      if (!commandReport.ok || commandReport.failure_group !== "not_failure") {
        cycle.failures.push({
          name,
          status: commandReport.status,
          group: commandReport.failure_group
        });
        report.grouped_failures[commandReport.failure_group] = (report.grouped_failures[commandReport.failure_group] || 0) + 1;
      }
    }
    cycle.ended_at = new Date().toISOString();
    report.cycles.push(cycle);
  }

  report.ended_at = new Date().toISOString();
  report.cycles_completed = report.cycles.length;
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({
    ok: true,
    cycles_completed: report.cycles_completed,
    grouped_failures: report.grouped_failures,
    report: OUT.replace(`${ROOT}/`, "")
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
