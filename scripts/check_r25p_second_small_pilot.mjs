#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);

const STEPS = [
  ["eval:small-decoder-pilot:r25p", ["run", "eval:small-decoder-pilot:r25p"]],
  ["eval:small-decoder-pilot-heldout:r25p", ["run", "eval:small-decoder-pilot-heldout:r25p"]],
  ["compare:small-pilot-history:r25p", ["run", "compare:small-pilot-history:r25p"]],
  ["check:small-decoder-pilot-artifacts-untracked", ["run", "check:small-decoder-pilot-artifacts-untracked"]],
  ["check:training-approval-markers", ["run", "check:training-approval-markers"]],
  ["check:from-scratch-training-doctrine", ["run", "check:from-scratch-training-doctrine"]],
  ["report:from-scratch-training-progress", ["run", "report:from-scratch-training-progress"]],
  ["check:r25o-second-pilot-design", ["run", "check:r25o-second-pilot-design"]]
];

async function runStep(name, args) {
  const started = Date.now();
  await execFileAsync("npm", args, {
    cwd: ROOT,
    timeout: 240000,
    maxBuffer: 32 * 1024 * 1024
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
    gate: "R25P second bounded small pilot history",
    training_rerun: false,
    product_training_ran: false,
    long_term_training_ran: false,
    release_checkpoint_admitted: false,
    steps: results,
    notes: [
      "This gate validates R25P history and ignored artifacts only.",
      "It does not run small-pilot training; the one-shot run command is separate.",
      "Future pilot runs require a new reviewer approval marker."
    ]
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  const report = {
    ok: false,
    gate: "R25P second bounded small pilot history",
    training_rerun: false,
    product_training_ran: false,
    long_term_training_ran: false,
    error: String(error?.message || error)
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(2);
});
