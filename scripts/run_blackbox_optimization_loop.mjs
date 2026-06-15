#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "artifacts/training_os/r12b_blackbox_loop_report.json");

const COMMANDS = [
  { name: "r12_blind_gate", cmd: ["npm", "run", "eval:r12-blind-gate"], report: "artifacts/training_os/r12b_blind_gate_report.json" },
  { name: "r13_coverage", cmd: ["npm", "run", "eval:r13-coverage"], report: "artifacts/training_os/r13_coverage_report.json" },
  { name: "anchor_overfit", cmd: ["npm", "run", "audit:anchor-overfit:report"], report: "artifacts/training_os/r12b_anchor_overfit_audit.json" },
  { name: "culture_coverage", cmd: ["npm", "run", "audit:culture-coverage"], report: "artifacts/training_os/r12b_culture_coverage_audit.json" }
];

function parseArgs(argv) {
  const args = { cycles: 3 };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--cycles") args.cycles = Math.max(1, Number(argv[++i] || 3));
    else throw new Error(`Unknown argument: ${item}`);
  }
  return args;
}

async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(resolve(ROOT, relativePath), "utf8"));
  } catch {
    return null;
  }
}

function runCommand(spec) {
  const started = new Date().toISOString();
  const result = spawnSync(spec.cmd[0], spec.cmd.slice(1), {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return {
    name: spec.name,
    command: spec.cmd.join(" "),
    started_at: started,
    ended_at: new Date().toISOString(),
    exit_code: result.status ?? 1,
    stdout_tail: String(result.stdout || "").slice(-2000),
    stderr_tail: String(result.stderr || "").slice(-2000)
  };
}

function summaryFromReport(name, report) {
  if (!report) return { ok: false, missing_report: true };
  if (name === "r12_blind_gate" || name === "r13_coverage") {
    return { ok: report.ok === true, failed: report.summary?.failed || 0, total: report.summary?.total || 0 };
  }
  if (name === "anchor_overfit") {
    return { ok: (report.overfit_score || 0) <= (report.threshold || 0.35), overfit_score: report.overfit_score || 0, single_anchor_fallbacks: report.single_anchor_fallbacks?.length || 0 };
  }
  if (name === "culture_coverage") {
    return { ok: true, levels: report.summary?.coverage_levels || report.coverage_levels || {} };
  }
  return { ok: report.ok !== false };
}

function groupedFailures(report) {
  const groups = {};
  for (const item of report?.results || []) {
    for (const failure of item.failures || []) {
      const key = String(failure.check || failure).replace(/^blackbox:/, "");
      groups[key] = (groups[key] || 0) + 1;
    }
  }
  return groups;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cycles = [];
  for (let cycle = 1; cycle <= args.cycles; cycle += 1) {
    const commands = COMMANDS.map(runCommand);
    const reports = {};
    for (const spec of COMMANDS) reports[spec.name] = await readJson(spec.report);
    const summaries = Object.fromEntries(COMMANDS.map((spec) => [spec.name, summaryFromReport(spec.name, reports[spec.name])]));
    const failure_groups = {
      r12: groupedFailures(reports.r12_blind_gate),
      r13: groupedFailures(reports.r13_coverage)
    };
    cycles.push({ cycle, commands, summaries, failure_groups });
    if ((summaries.r12_blind_gate?.failed || 0) === 0 && (summaries.r13_coverage?.failed || 0) === 0 && summaries.anchor_overfit?.ok !== false) break;
  }
  const report = {
    generated_at: new Date().toISOString(),
    cycles,
    improved: cycles.length === 1 || JSON.stringify(cycles[0].failure_groups) !== JSON.stringify(cycles.at(-1).failure_groups),
    stopped_after_cycle: cycles.at(-1)?.cycle || 0
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, cycles: cycles.length, out: OUT }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
