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
  ["check:chinese-personal-training-direction", ["run", "check:chinese-personal-training-direction"]],
  ["eval:small-decoder-pilot:r25ac", ["run", "eval:small-decoder-pilot:r25ac"]],
  ["eval:small-decoder-pilot-heldout:r25ac", ["run", "eval:small-decoder-pilot-heldout:r25ac"]],
  ["eval:r25ac-chinese-personal-breakdown", ["run", "eval:r25ac-chinese-personal-breakdown"]],
  ["compare:small-pilot-history:r25ac", ["run", "compare:small-pilot-history:r25ac"]],
  ["check:small-decoder-pilot-artifacts-untracked", ["run", "check:small-decoder-pilot-artifacts-untracked"]],
  ["check:phase4-scaled-training-readiness", ["run", "check:phase4-scaled-training-readiness"]],
  ["eval:phase4-static-envelope", ["run", "eval:phase4-static-envelope"]],
  ["check:from-scratch-training-doctrine", ["run", "check:from-scratch-training-doctrine"]],
  ["report:from-scratch-training-progress", ["run", "report:from-scratch-training-progress"]],
  ["check:r25aa-phase4-readiness-review", ["run", "check:r25aa-phase4-readiness-review"]],
  ["check:r25z-r25y-analysis", ["run", "check:r25z-r25y-analysis"]],
  ["check:r25y-data-regularization-history", ["run", "check:r25y-data-regularization-history"]],
  ["check:r25x-phase3-review", ["run", "check:r25x-phase3-review"]],
  ["check:r25w-r25v-analysis", ["run", "check:r25w-r25v-analysis"]],
  ["check:r25v-architecture-ablation-history", ["run", "check:r25v-architecture-ablation-history"]],
  ["check:r25s-data-first-pilot-history", ["run", "check:r25s-data-first-pilot-history"]],
  ["check:r25i-from-scratch-roadmap", ["run", "check:r25i-from-scratch-roadmap"]],
  ["check:r24-recovery-candidate", ["run", "check:r24-recovery-candidate"]],
  ["check:vercel-build", ["run", "check:vercel-build"]]
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
    console.error(`[r25ac-history] running ${name}`);
    results.push(await runStep(name, args));
    console.error(`[r25ac-history] passed ${name}`);
  }
  const report = {
    ok: true,
    gate: "R25AC bounded Chinese-first personal micro-cycle history",
    training_rerun: false,
    chinese_personal_microcycle_rerun: false,
    product_training_ran: false,
    long_term_training_ran: false,
    phase_4_scaled_training_ran: false,
    phase_4_scaled_training_approved: false,
    release_checkpoint_admitted: false,
    recursive_prior_gate_replay: false,
    prior_gates_run_separately: true,
    steps: results,
    notes: [
      "This gate validates R25AC history and ignored artifacts only.",
      "It does not run the R25AC one-shot command or any other training command.",
      "R25AC consumed its approval marker; future runs require fresh reviewer approval.",
      "Phase_4 scaled training remains blocked."
    ]
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  const report = {
    ok: false,
    gate: "R25AC bounded Chinese-first personal micro-cycle history",
    training_rerun: false,
    chinese_personal_microcycle_rerun: false,
    product_training_ran: false,
    long_term_training_ran: false,
    phase_4_scaled_training_ran: false,
    phase_4_scaled_training_approved: false,
    error: String(error?.message || error)
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(2);
});
