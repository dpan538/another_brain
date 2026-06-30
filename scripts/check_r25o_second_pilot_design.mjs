#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const steps = [
  ["check:training-approval-markers"],
  ["plan:second-small-decoder-pilot"],
  ["check:small-decoder-checkpoint-schema"],
  ["eval:small-decoder-pilot-replay-heldout"],
  ["compare:small-pilot-history"],
  ["report:from-scratch-training-progress"],
  ["check:from-scratch-training-doctrine"],
  ["check:r25n-small-pilot-evaluation"],
  ["check:r25m-small-pilot-history"],
  ["check:r25k-toy-overfit-history"],
  ["check:vercel-build"]
];

function tail(text = "", lines = 80) {
  return text.split(/\r?\n/).slice(-lines).join("\n");
}

const results = [];

for (const [script, ...args] of steps) {
  const startedAt = Date.now();
  console.log(`\n[r25o-gate] npm run ${script}${args.length ? ` -- ${args.join(" ")}` : ""}`);
  const result = spawnSync("npm", ["run", script, ...(args.length ? ["--", ...args] : [])], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024
  });
  const durationMs = Date.now() - startedAt;
  const item = {
    script,
    args,
    ok: result.status === 0,
    status: result.status,
    signal: result.signal,
    durationMs
  };
  results.push(item);
  if (result.status !== 0) {
    console.error(JSON.stringify({
      ok: false,
      gate: "check:r25o-second-pilot-design",
      failed_script: script,
      failed_args: args,
      stdout_tail: tail(result.stdout),
      stderr_tail: tail(result.stderr),
      results
    }, null, 2));
    process.exit(result.status ?? 1);
  }
  console.log(JSON.stringify(item));
}

console.log(JSON.stringify({
  ok: true,
  gate: "check:r25o-second-pilot-design",
  training_rerun: false,
  toy_training_rerun: false,
  small_pilot_training_rerun: false,
  second_pilot_training_ran: false,
  product_training: false,
  long_term_training: false,
  release_checkpoint: false,
  tracked_weights: false,
  recursive_prior_gate_replay: false,
  prior_gates_required_separately: [
    "check:r25m-small-decoder-pilot",
    "check:r25l-corpus-pilot-plan",
    "check:r25k-toy-overfit-sanity",
    "check:r25j-tokenizer-toy-pipeline",
    "check:r25i-from-scratch-roadmap",
    "check:r25h-capacity-envelope",
    "check:r25g-candidate-decision",
    "check:r25f-candidate-purge",
    "check:r25e-artifact-admission",
    "check:r25d-browser-inference-binding",
    "check:r25c-static-artifact-intake",
    "check:r25b-static-decoder-training",
    "check:r25-llm-first-static",
    "check:r24-recovery-candidate"
  ],
  scripts_run: results.length,
  results
}, null, 2));
