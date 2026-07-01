#!/usr/bin/env node
import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);

const STEPS = [
  ["check:training-approval-markers", ["run", "check:training-approval-markers"]],
  ["check:no-training-in-routine-gates", ["run", "check:no-training-in-routine-gates"]],
  ["analyze:r25v-pilot", ["run", "analyze:r25v-pilot"]],
  ["eval:r25v-heldout-breakdown", ["run", "eval:r25v-heldout-breakdown"]],
  ["compare:data-vs-architecture-ablation", ["run", "compare:data-vs-architecture-ablation"]],
  ["report:r25w-next-step", ["run", "report:r25w-next-step"]],
  ["check:from-scratch-training-doctrine", ["run", "check:from-scratch-training-doctrine"]],
  ["report:from-scratch-training-progress", ["run", "report:from-scratch-training-progress"]],
  ["check:r25v-architecture-ablation-history", ["run", "check:r25v-architecture-ablation-history"]],
  ["check:r25l-corpus-pilot-plan", ["run", "check:r25l-corpus-pilot-plan"]],
  ["check:r25k-toy-overfit-history", ["run", "check:r25k-toy-overfit-history"]],
  ["check:r25j-tokenizer-toy-pipeline", ["run", "check:r25j-tokenizer-toy-pipeline"]],
  ["check:r25i-from-scratch-roadmap", ["run", "check:r25i-from-scratch-roadmap"]],
  ["check:r25h-capacity-envelope", ["run", "check:r25h-capacity-envelope"]],
  ["check:r25g-candidate-decision", ["run", "check:r25g-candidate-decision"]],
  ["check:r25f-candidate-purge", ["run", "check:r25f-candidate-purge"]],
  ["check:r25e-artifact-admission", ["run", "check:r25e-artifact-admission"]],
  ["check:r25d-browser-inference-binding", ["run", "check:r25d-browser-inference-binding"]],
  ["check:r25c-static-artifact-intake", ["run", "check:r25c-static-artifact-intake"]],
  ["check:r25b-static-decoder-training", ["run", "check:r25b-static-decoder-training"]],
  ["check:r25-llm-first-static", ["run", "check:r25-llm-first-static"]],
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
    console.error(`[r25w] running ${name}`);
    results.push(await runStep(name, args));
    console.error(`[r25w] passed ${name}`);
  }
  const report = {
    ok: true,
    gate: "R25W R25V analysis and phase 3 decision review",
    training_rerun: false,
    product_training_ran: false,
    long_term_training_ran: false,
    phase_4_scaled_training_ran: false,
    phase_4_scaled_training_approved: false,
    release_checkpoint_admitted: false,
    steps: results,
    notes: [
      "This gate validates R25W analysis, R25V history, and prior R24/R25 gates.",
      "It does not run small-pilot, toy, data-first, or architecture-ablation training.",
      "R25V history delegates to the R25U/T/S/R/Q/P/O/N/M/K history chain; R25W runs the older static gates separately.",
      "Future pilot runs require a new reviewer approval marker."
    ]
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  const report = {
    ok: false,
    gate: "R25W R25V analysis and phase 3 decision review",
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
