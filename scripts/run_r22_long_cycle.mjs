#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { gitHead, loadR22State, nowIso, updateR22State } from "./r22_long_cycle_common.mjs";

const QUICK_STEPS = [
  ["build:r22-shadow-coverage-baseline", "npm", ["run", "build:r22-shadow-coverage-baseline"]],
  ["audit:r22-fallback-appropriateness", "npm", ["run", "audit:r22-fallback-appropriateness"]],
  ["eval:r22-content-units-precision", "npm", ["run", "eval:r22-content-units-precision"]],
  ["eval:r22-surface-semantic-selectivity", "npm", ["run", "eval:r22-surface-semantic-selectivity"]],
  ["check:dialogic-profile-primitives", "npm", ["run", "check:dialogic-profile-primitives"]],
  ["eval:r22-shadow-surface", "npm", ["run", "eval:r22-shadow-surface"]],
  ["eval:r22-shadow-session-rhythm", "npm", ["run", "eval:r22-shadow-session-rhythm"]],
  ["generate:r22-postfreeze-holdout", "npm", ["run", "generate:r22-postfreeze-holdout"]],
  ["eval:r22-postfreeze-holdout", "npm", ["run", "eval:r22-postfreeze-holdout"]],
  ["build:r22-surface-review-packet", "npm", ["run", "build:r22-surface-review-packet"]],
  ["check:r22-shadow-promotion-readiness", "npm", ["run", "check:r22-shadow-promotion-readiness"]]
];

const LONG_EXTRA_STEPS = [
  ["audit:r22-surface-governance", "npm", ["run", "audit:r22-surface-governance"]],
  ["cycle:r10-r22:quick", "npm", ["run", "cycle:r10-r22:quick"]]
];

function shouldRunFromResume(state, stepName, resume) {
  if (!resume) return true;
  const completed = new Set(state.completed_phases || []);
  return !completed.has(stepName);
}

async function runStep(stepName, command, args, resume) {
  const state = await loadR22State();
  if (!shouldRunFromResume(state, stepName, resume)) {
    console.log(JSON.stringify({ step: stepName, skipped: true, reason: "already_completed" }));
    return true;
  }
  await updateR22State({ current_phase: stepName, current_head: gitHead() });
  const startedAt = nowIso();
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    await updateR22State({
      current_phase: `${stepName}:failed`,
      pending_failures: [{ phase: stepName, exit_code: result.status }],
      last_full_gate_result: { step: stepName, ok: false, started_at: startedAt, ended_at: nowIso() }
    });
    return false;
  }
  const next = await loadR22State();
  await updateR22State({
    completed_phases: [...new Set([...(next.completed_phases || []), stepName])],
    last_good_commit: gitHead(),
    last_full_gate_result: { step: stepName, ok: true, started_at: startedAt, ended_at: nowIso() }
  });
  return true;
}

async function main() {
  const mode = process.argv.includes("--quick") ? "quick" : "long";
  const resume = process.argv.includes("--resume");
  await updateR22State({ current_phase: `cycle_r22_${mode}_started` });
  const steps = mode === "quick" ? QUICK_STEPS : [...QUICK_STEPS, ...LONG_EXTRA_STEPS];
  for (const [name, command, args] of steps) {
    const ok = await runStep(name, command, args, resume);
    if (!ok) {
      console.error(JSON.stringify({ cycle: mode, failed_step: name }));
      process.exit(2);
    }
  }
  await updateR22State({ current_phase: `cycle_r22_${mode}_done`, pending_failures: [] });
  console.log(JSON.stringify({ cycle: mode, behavior_ok: true, head: gitHead() }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
