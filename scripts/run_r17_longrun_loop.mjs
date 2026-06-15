#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "artifacts/training_os/r17_longrun_loop_report.json");

const COMMANDS = [
  ["check_internal_session_memory", ["npm", "run", "check:internal-session-memory"]],
  ["eval_r17_memory", ["npm", "run", "eval:r17-memory"]],
  ["eval_answer_latency_profile", ["npm", "run", "eval:answer-latency-profile"]],
  ["eval_webgpu_readiness", ["npm", "run", "eval:webgpu-readiness"]],
  ["eval_browser_inference_profile", ["npm", "run", "eval:browser-inference-profile"]],
  ["eval_r17_webgpu_memory", ["npm", "run", "eval:r17-webgpu-memory"]],
  ["eval_controlled_gate", ["npm", "run", "eval:controlled-gate"]],
  ["check_persona_method_training", ["npm", "run", "check:persona-method-training"]],
  ["check_persona_privacy", ["npm", "run", "check:persona-privacy"]],
  ["check_persona_overfit", ["npm", "run", "check:persona-overfit"]],
  ["check_personal_facts", ["npm", "run", "check:personal-facts"]]
];

function classifyFailure(name, stdout, stderr, status) {
  const text = `${name}\n${stdout}\n${stderr}`.toLowerCase();
  if (status === 0) {
    if (/ready_for_runtime": false/.test(text)) return "controlled_gate_not_exported";
    if (/webgpu_available": false|navigator\.gpu unavailable|webgpu.*unavailable/.test(text)) return "webgpu_unavailable";
    return "not_failure";
  }
  if (/visible|4 turn|ui/.test(text)) return "visible_ui_leak";
  if (/internal|16|session memory/.test(text)) return "internal_memory_failure";
  if (/sla|latency|3000/.test(text)) return "answer_sla_violation";
  if (/webgpu/.test(text)) return "webgpu_false_success";
  if (/wasm|fallback/.test(text)) return "wasm_fallback_failure";
  if (/persona|privacy/.test(text)) return "privacy_boundary";
  if (/copyright|lyrics|quote/.test(text)) return "copyright_boundary";
  if (/source|path/.test(text)) return "source_framing";
  if (/controlled|gate|accuracy/.test(text)) return "controlled_gate_misclassification";
  return "command_failed";
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
    stdout_tail: stdout.slice(-2500),
    stderr_tail: stderr.slice(-2500)
  };
}

async function main() {
  const cycles = Number(process.argv.find((arg) => arg.startsWith("--cycles="))?.split("=")[1] || 5);
  const report = {
    started_at: new Date().toISOString(),
    cycles_requested: cycles,
    cycles: [],
    grouped_failures: {},
    hard_failures: 0,
    note: "R17 loop is report-only. It never edits files, exports models, or integrates runtime weights."
  };

  for (let index = 1; index <= cycles; index += 1) {
    const cycle = { cycle: index, started_at: new Date().toISOString(), commands: [], failures: [] };
    for (const [name, command] of COMMANDS) {
      const commandReport = runCommand(name, command);
      cycle.commands.push(commandReport);
      if (!commandReport.ok || !["not_failure", "webgpu_unavailable", "controlled_gate_not_exported"].includes(commandReport.failure_group)) {
        cycle.failures.push({ name, status: commandReport.status, group: commandReport.failure_group });
        report.grouped_failures[commandReport.failure_group] = (report.grouped_failures[commandReport.failure_group] || 0) + 1;
      }
    }
    cycle.ended_at = new Date().toISOString();
    report.hard_failures += cycle.failures.length;
    report.cycles.push(cycle);
  }

  report.ended_at = new Date().toISOString();
  report.cycles_completed = report.cycles.length;
  report.ok = report.hard_failures === 0;
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    ok: report.ok,
    cycles_completed: report.cycles_completed,
    hard_failures: report.hard_failures,
    grouped_failures: report.grouped_failures,
    report: OUT.replace(`${ROOT}/`, "")
  }, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
