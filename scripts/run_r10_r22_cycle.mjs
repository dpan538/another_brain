#!/usr/bin/env node
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { ROOT } from "./r18_utils.mjs";

const REPORT = resolve(ROOT, "artifacts/training_os/r10_r22_cycle_report.json");
const HISTORY = resolve(ROOT, "artifacts/training_os/r10_r22_cycle_history.jsonl");
const LOG = resolve(ROOT, "artifacts/training_os/r10_r22_cycle_log.md");

const GENERATED_NOISE_FILES = ["evals/r21_control_families/manifest.json", "evals/r22_natural_surface/proxy_migration_manifest.json"];

const QUICK_COMMANDS = [
  ["r10", "eval:r10-culture"],
  ["r11", "eval:r11-reasoning"],
  ["r13", "eval:r13-coverage"],
  ["r17", "eval:r17-memory"],
  ["r17", "eval:r17-webgpu-memory"],
  ["p0", "eval:p0-lobotomy"],
  ["p0", "eval:non-question-affordance"],
  ["p0", "eval:p0-response-mode"],
  ["r19", "eval:dialogue-boundary"],
  ["r19", "eval:r19-contextual-binding"],
  ["r20", "eval:endpoint-readiness"],
  ["r20", "check:webgpu-contract"],
  ["r21", "check:r21-control"],
  ["r22", "audit:r22-surface-governance"],
  ["release", "check:release"]
];

const FULL_ONLY_COMMANDS = [
  ["p0", "check:anti-lobotomy"],
  ["r19", "check:dialogue-boundary"],
  ["r20", "eval:session-stress"],
  ["r20", "check:endpoint"],
  ["r20", "check:webgpu-pilot"],
  ["browser", "eval:real-browser-e2e", { allowFailure: true }],
  ["deployed", "probe:deployed-parity", { allowFailure: true }],
  ["vercel", "audit:runtime-assets"],
  ["all", "check"]
];

function parseArgs(argv) {
  const out = {
    mode: "quick",
    cycles: 1,
    minMinutes: 0,
    failFast: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--full") out.mode = "full";
    else if (arg === "--quick") out.mode = "quick";
    else if (arg === "--fail-fast") out.failFast = true;
    else if (arg === "--cycles") out.cycles = Math.max(1, Number(argv[++index] || 1));
    else if (arg === "--min-minutes") out.minMinutes = Math.max(0, Number(argv[++index] || 0));
  }
  return out;
}

function nowIso() {
  return new Date().toISOString();
}

function tail(text, max = 3000) {
  const value = String(text || "");
  return value.length <= max ? value : value.slice(value.length - max);
}

async function snapshotGeneratedNoise() {
  const snapshots = {};
  for (const file of GENERATED_NOISE_FILES) {
    try {
      snapshots[file] = await readFile(resolve(ROOT, file), "utf8");
    } catch {
      snapshots[file] = null;
    }
  }
  return snapshots;
}

async function restoreGeneratedNoise(snapshots) {
  const restored = [];
  for (const [file, content] of Object.entries(snapshots || {})) {
    if (content === null) continue;
    const path = resolve(ROOT, file);
    let current = "";
    try {
      current = await readFile(path, "utf8");
    } catch {
      continue;
    }
    if (current === content) continue;
    const normalizedCurrent = current.replace(/"generated_at":\s*"[^"]+"/, '"generated_at": "<timestamp>"');
    const normalizedBefore = content.replace(/"generated_at":\s*"[^"]+"/, '"generated_at": "<timestamp>"');
    if (normalizedCurrent === normalizedBefore) {
      await writeFile(path, content, "utf8");
      restored.push(file);
    }
  }
  return restored;
}

function runNpm(script) {
  return new Promise((resolveRun) => {
    const started = Date.now();
    const child = spawn("npm", ["run", script], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on("close", (code) => {
      resolveRun({
        script,
        exit_code: code ?? 1,
        duration_ms: Date.now() - started,
        stdout_tail: tail(stdout),
        stderr_tail: tail(stderr)
      });
    });
  });
}

async function readJsonReport(path) {
  try {
    return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
  } catch {
    return null;
  }
}

async function collectSignals() {
  const r22 = await readJsonReport("artifacts/training_os/r22_shadow_surface_eval_report.json");
  const surface = await readJsonReport("artifacts/training_os/r22_natural_surface_eval_report.json");
  const proxy = await readJsonReport("artifacts/training_os/r22_eval_proxy_leakage_audit.json");
  const antiOverfit = await readJsonReport("artifacts/training_os/r21_anti_overfit_invariants_report.json");
  const endpoint = await readJsonReport("artifacts/training_os/endpoint_readiness_report.json");
  const deployed = await readJsonReport("artifacts/training_os/r20_deployed_parity_report.json");
  return {
    r22_shadow: r22
      ? {
          behavior_ok: r22.behavior_ok,
          audit_only: r22.audit_only,
          behavior_status: r22.behavior_status,
          promotion_ready: r22.promotion_ready,
          human_review_status: r22.human_review_status,
          candidate_attempted_count: r22.candidate_attempted_count,
          semantic_fallback_count: r22.semantic_fallback_count,
          candidate_semantic_failure_count: r22.candidate_semantic_failure_count
        }
      : null,
    r22_natural_surface: surface
      ? {
          behavior_ok: surface.behavior_ok,
          audit_only: surface.audit_only,
          failure_count: surface.failure_count,
          candidate_failure_count: surface.candidate_failure_count
        }
      : null,
    r22_eval_proxy: proxy
      ? {
          suspicious_count: proxy.suspicious_count,
          possible_eval_weakening: proxy.possible_eval_weakening,
          eval_files_modified: proxy.eval_files_modified
        }
      : null,
    r21_anti_overfit: antiOverfit
      ? {
          ok: antiOverfit.ok,
          invariant_failures: antiOverfit.invariant_failures || [],
          new_surface_entity_specific_logic:
            antiOverfit.surface_governance_entity_specific_report?.newly_added_entity_specific_logic?.length || 0
        }
      : null,
    endpoint_readiness: endpoint
      ? {
          ok: endpoint.ok,
          metrics: endpoint.metrics || endpoint.summary || {}
        }
      : null,
    deployed_parity: deployed
      ? {
          attempted: deployed.attempted,
          available: deployed.available,
          local_version: deployed.local_version?.gitHead || deployed.local_version,
          deployed_version: deployed.deployed_version || deployed.deployed_app_version || "",
          stale_asset_detected: deployed.stale_asset_detected,
          reason: deployed.reason || ""
        }
      : null
  };
}

async function runCycle({ cycleIndex, commands, failFast }) {
  const snapshots = await snapshotGeneratedNoise();
  const started = Date.now();
  const results = [];
  const failures = [];
  for (const [phase, script, options = {}] of commands) {
    console.log(`\n[r10-r22-cycle] cycle ${cycleIndex} phase ${phase}: npm run ${script}\n`);
    const result = await runNpm(script);
    const ok = result.exit_code === 0 || options.allowFailure;
    results.push({ phase, ...result, allow_failure: Boolean(options.allowFailure), ok });
    if (!ok) {
      failures.push({ phase, script, exit_code: result.exit_code });
      if (failFast) break;
    }
  }
  const restored_generated_noise = await restoreGeneratedNoise(snapshots);
  return {
    cycle_index: cycleIndex,
    started_at: new Date(started).toISOString(),
    ended_at: nowIso(),
    duration_ms: Date.now() - started,
    ok: failures.length === 0,
    failures,
    restored_generated_noise,
    results
  };
}

function commandPlan(mode) {
  return mode === "full" ? [...QUICK_COMMANDS, ...FULL_ONLY_COMMANDS] : QUICK_COMMANDS;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();
  const deadline = args.minMinutes ? startedAt + args.minMinutes * 60_000 : 0;
  const commands = commandPlan(args.mode);
  const cycles = [];
  let cycleIndex = 1;
  do {
    cycles.push(await runCycle({ cycleIndex, commands, failFast: args.failFast }));
    cycleIndex += 1;
  } while (cycleIndex <= args.cycles || (deadline && Date.now() < deadline));

  const signals = await collectSignals();
  const failures = cycles.flatMap((cycle) => cycle.failures);
  const report = {
    execution_ok: true,
    behavior_ok: failures.length === 0,
    audit_only: false,
    mode: args.mode,
    cycles_requested: args.cycles,
    min_minutes_requested: args.minMinutes,
    started_at: new Date(startedAt).toISOString(),
    ended_at: nowIso(),
    duration_ms: Date.now() - startedAt,
    commands_planned: commands.map(([phase, script, options = {}]) => ({ phase, script, allow_failure: Boolean(options.allowFailure) })),
    cycle_count: cycles.length,
    failure_count: failures.length,
    failures,
    signals,
    cycles
  };

  await mkdir(resolve(ROOT, "artifacts/training_os"), { recursive: true });
  await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await appendFile(HISTORY, `${JSON.stringify({
    generated_at: report.ended_at,
    mode: report.mode,
    cycle_count: report.cycle_count,
    behavior_ok: report.behavior_ok,
    failure_count: report.failure_count,
    r22_behavior_status: signals.r22_shadow?.behavior_status || "",
    r22_promotion_ready: signals.r22_shadow?.promotion_ready ?? null
  })}\n`, "utf8");
  await writeFile(
    LOG,
    [
      "# R10-R22 Cycle Log",
      "",
      `- generated_at: ${report.ended_at}`,
      `- mode: ${report.mode}`,
      `- cycles: ${report.cycle_count}`,
      `- behavior_ok: ${report.behavior_ok}`,
      `- failure_count: ${report.failure_count}`,
      `- r22_behavior_status: ${signals.r22_shadow?.behavior_status || "unknown"}`,
      `- r22_promotion_ready: ${signals.r22_shadow?.promotion_ready ?? "unknown"}`,
      "",
      "## Failures",
      "",
      failures.length ? failures.map((failure) => `- ${failure.phase}: ${failure.script} exited ${failure.exit_code}`).join("\n") : "- none"
    ].join("\n") + "\n",
    "utf8"
  );

  console.log(JSON.stringify({
    behavior_ok: report.behavior_ok,
    mode: report.mode,
    cycle_count: report.cycle_count,
    failure_count: report.failure_count,
    r22_behavior_status: signals.r22_shadow?.behavior_status || "unknown",
    r22_promotion_ready: signals.r22_shadow?.promotion_ready ?? null,
    out: REPORT
  }, null, 2));

  if (!report.behavior_ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
