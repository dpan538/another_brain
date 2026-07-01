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
  ["analyze:r25y-pilot", ["run", "analyze:r25y-pilot"]],
  ["eval:r25y-heldout-breakdown", ["run", "eval:r25y-heldout-breakdown"]],
  ["compare:r25y-data-regularization", ["run", "compare:r25y-data-regularization"]],
  ["report:r25z-next-step", ["run", "report:r25z-next-step"]],
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
    console.error(`[r25z-analysis] running ${name}`);
    results.push(await runStep(name, args));
    console.error(`[r25z-analysis] passed ${name}`);
  }
  const report = {
    ok: true,
    gate: "R25Z R25Y analysis and phase-3 review",
    training_rerun: false,
    data_regularization_training_rerun: false,
    product_training_ran: false,
    long_term_training_ran: false,
    phase_4_scaled_training_ran: false,
    phase_4_scaled_training_approved: false,
    recursive_prior_gate_replay: false,
    prior_gates_run_separately: true,
    steps: results,
    notes: [
      "This gate validates R25Z analysis and R25Y history only.",
      "It does not run R25Y or any other training.",
      "Prior milestone gates remain separate routine checks and are not recursively replayed inside R25Z.",
      "Future training requires a new reviewer approval marker.",
      "Phase_4 scaled training remains blocked."
    ]
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  const report = {
    ok: false,
    gate: "R25Z R25Y analysis and phase-3 review",
    training_rerun: false,
    data_regularization_training_rerun: false,
    product_training_ran: false,
    long_term_training_ran: false,
    phase_4_scaled_training_ran: false,
    phase_4_scaled_training_approved: false,
    error: String(error?.message || error)
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(2);
});
