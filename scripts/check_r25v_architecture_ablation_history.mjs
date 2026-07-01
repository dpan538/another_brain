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
  ["report:from-scratch-training-progress", ["run", "report:from-scratch-training-progress"]],
  ["check:r25u-phase3-exit-and-ablation-plan", ["run", "check:r25u-phase3-exit-and-ablation-plan"]],
  ["check:r25t-r25s-analysis", ["run", "check:r25t-r25s-analysis"]],
  ["check:r25s-data-first-pilot-history", ["run", "check:r25s-data-first-pilot-history"]],
  ["check:r25r-data-first-pilot-design", ["run", "check:r25r-data-first-pilot-design"]],
  ["check:r25q-pilot-analysis", ["run", "check:r25q-pilot-analysis"]],
  ["check:r25p-second-small-pilot-history", ["run", "check:r25p-second-small-pilot-history"]],
  ["check:r25o-second-pilot-design", ["run", "check:r25o-second-pilot-design"]],
  ["check:r25n-small-pilot-evaluation", ["run", "check:r25n-small-pilot-evaluation"]],
  ["check:r25m-small-pilot-history", ["run", "check:r25m-small-pilot-history"]],
  ["check:r25k-toy-overfit-history", ["run", "check:r25k-toy-overfit-history"]],
  ["check:r24-recovery-candidate", ["run", "check:r24-recovery-candidate"]],
  ["check:vercel-build", ["run", "check:vercel-build"]]
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
    results.push(await runStep(name, args));
  }
  const report = {
    ok: true,
    gate: "R25V bounded architecture ablation history",
    training_rerun: false,
    architecture_ablation_training_rerun: false,
    product_training_ran: false,
    long_term_training_ran: false,
    phase_4_scaled_training_ran: false,
    release_checkpoint_admitted: false,
    steps: results,
    notes: [
      "This gate validates R25V history and ignored artifacts only.",
      "It does not run small-pilot or architecture-ablation training; the one-shot run command is separate.",
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
