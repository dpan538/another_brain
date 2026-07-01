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
  ["eval:small-decoder-pilot:r25y", ["run", "eval:small-decoder-pilot:r25y"]],
  ["eval:small-decoder-pilot-heldout:r25y", ["run", "eval:small-decoder-pilot-heldout:r25y"]],
  ["compare:small-pilot-history:r25y", ["run", "compare:small-pilot-history:r25y"]],
  ["check:small-decoder-pilot-artifacts-untracked", ["run", "check:small-decoder-pilot-artifacts-untracked"]],
  ["check:from-scratch-training-doctrine", ["run", "check:from-scratch-training-doctrine"]],
  ["report:from-scratch-training-progress", ["run", "report:from-scratch-training-progress"]],
  ["check:r25x-phase3-review", ["run", "check:r25x-phase3-review"]]
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
    console.error(`[r25y-history] running ${name}`);
    results.push(await runStep(name, args));
    console.error(`[r25y-history] passed ${name}`);
  }
  const report = {
    ok: true,
    gate: "R25Y bounded data-regularization pilot history",
    training_rerun: false,
    data_regularization_training_rerun: false,
    product_training_ran: false,
    long_term_training_ran: false,
    phase_4_scaled_training_ran: false,
    phase_4_scaled_training_approved: false,
    release_checkpoint_admitted: false,
    steps: results,
    notes: [
      "This gate validates R25Y history and ignored artifacts only.",
      "It does not run small-pilot or data-regularization training; the one-shot run command is separate.",
      "R25X delegates transitively to prior R25W/V/U/T/S/R/Q/P/O/N/M/K/J/I/H/G/F/E/D/C/B/A and R24/Vercel history gates.",
      "Future pilot runs require a new reviewer approval marker.",
      "Phase_4 scaled training remains blocked."
    ]
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  const report = {
    ok: false,
    gate: "R25Y bounded data-regularization pilot history",
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
