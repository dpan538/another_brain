#!/usr/bin/env node
import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);

const STEPS = [
  ["check:training-approval-markers", ["run", "check:training-approval-markers"]],
  ["eval:small-decoder-pilot:r25v", ["run", "eval:small-decoder-pilot:r25v"]],
  ["eval:small-decoder-pilot-heldout:r25v", ["run", "eval:small-decoder-pilot-heldout:r25v"]],
  ["compare:small-pilot-history:r25v", ["run", "compare:small-pilot-history:r25v"]],
  ["check:small-decoder-pilot-artifacts-untracked", ["run", "check:small-decoder-pilot-artifacts-untracked"]],
  ["check:from-scratch-training-doctrine", ["run", "check:from-scratch-training-doctrine"]],
  ["report:from-scratch-training-progress", ["run", "report:from-scratch-training-progress"]]
];

async function runStep(name, args) {
  const started = Date.now();
  await execFileAsync("npm", args, {
    cwd: ROOT,
    timeout: 900000,
    maxBuffer: 128 * 1024 * 1024
  });
  return { name, ok: true, elapsed_ms: Date.now() - started };
}

async function main() {
  const results = [];
  for (const [name, args] of STEPS) {
    console.error(`[r25v-history] running ${name}`);
    results.push(await runStep(name, args));
    console.error(`[r25v-history] passed ${name}`);
  }
  const report = {
    ok: true,
    gate: "R25V bounded architecture ablation history",
    training_rerun: false,
    architecture_ablation_training_rerun: false,
    product_training_ran: false,
    long_term_training_ran: false,
    phase_4_scaled_training_ran: false,
    recursive_prior_gate_replay: false,
    prior_gates_run_separately: true,
    release_checkpoint_admitted: false,
    steps: results,
    notes: [
      "This gate validates R25V history and ignored artifacts only.",
      "It does not run small-pilot or architecture-ablation training; the one-shot run command is separate.",
      "Prior milestone gates remain separate routine checks and are not recursively replayed inside R25V.",
      "Future pilot runs require a new reviewer approval marker."
    ]
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  const report = {
    ok: false,
    gate: "R25V bounded architecture ablation history",
    training_rerun: false,
    architecture_ablation_training_rerun: false,
    product_training_ran: false,
    long_term_training_ran: false,
    phase_4_scaled_training_ran: false,
    error: String(error?.message || error)
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(2);
});
