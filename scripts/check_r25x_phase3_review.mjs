#!/usr/bin/env node
import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const STEP_TIMEOUT_MS = 60 * 60 * 1000;

const STEPS = [
  ["check:training-approval-markers", ["run", "check:training-approval-markers"]],
  ["check:no-training-in-routine-gates", ["run", "check:no-training-in-routine-gates"]],
  ["audit:r25x-training-data-quality", ["run", "audit:r25x-training-data-quality"]],
  ["analyze:r25s-best-pilot-rows", ["run", "analyze:r25s-best-pilot-rows"]],
  ["check:r25y-data-regularization-design", ["run", "check:r25y-data-regularization-design"]],
  ["report:r25x-phase3-review", ["run", "report:r25x-phase3-review"]],
  ["check:from-scratch-training-doctrine", ["run", "check:from-scratch-training-doctrine"]],
  ["report:from-scratch-training-progress", ["run", "report:from-scratch-training-progress"]]
];

async function runStep(name, args) {
  const started = Date.now();
  await execFileAsync("npm", args, {
    cwd: ROOT,
    timeout: STEP_TIMEOUT_MS,
    maxBuffer: 128 * 1024 * 1024
  });
  return { name, ok: true, elapsed_ms: Date.now() - started };
}

async function main() {
  const results = [];
  for (const [name, args] of STEPS) {
    console.error(`[r25x] running ${name}`);
    results.push(await runStep(name, args));
    console.error(`[r25x] passed ${name}`);
  }
  const report = {
    ok: true,
    gate: "R25X phase-3 review and data regularization design",
    training_rerun: false,
    product_training_ran: false,
    long_term_training_ran: false,
    phase_4_scaled_training_ran: false,
    phase_4_scaled_training_approved: false,
    release_checkpoint_admitted: false,
    recursive_prior_gate_replay: false,
    prior_gates_run_separately: true,
    steps: results,
    notes: [
      "This gate validates R25X review and R25Y inert design.",
      "It does not run small-pilot, toy, data-first, or architecture-ablation training.",
      "Prior milestone gates remain separate routine checks and are not recursively replayed inside R25X.",
      "Future pilot runs require a new reviewer approval marker."
    ]
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  const report = {
    ok: false,
    gate: "R25X phase-3 review and data regularization design",
    training_rerun: false,
    product_training_ran: false,
    long_term_training_ran: false,
    phase_4_scaled_training_ran: false,
    phase_4_scaled_training_approved: false,
    error: String(error?.message || error)
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(2);
});
