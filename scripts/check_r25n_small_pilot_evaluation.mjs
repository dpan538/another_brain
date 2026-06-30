#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const steps = [
  ["check:training-approval-markers"],
  ["analyze:small-decoder-pilot"],
  ["eval:small-decoder-pilot-heldout"],
  ["report:small-pilot-regression-snapshot"],
  ["report:r25n-next-pilot-decision"],
  ["check:from-scratch-training-doctrine"],
  ["report:from-scratch-training-progress"],
  ["check:r25m-small-pilot-history"],
  ["check:r25k-toy-overfit-history"]
];

function tail(text = "", lines = 80) {
  return text.split(/\r?\n/).slice(-lines).join("\n");
}

const results = [];

for (const [script, ...args] of steps) {
  const startedAt = Date.now();
  console.log(`\n[r25n-gate] npm run ${script}${args.length ? ` -- ${args.join(" ")}` : ""}`);
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
      gate: "check:r25n-small-pilot-evaluation",
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
  gate: "check:r25n-small-pilot-evaluation",
  recursive_gate_replay: false,
  training_rerun: false,
  toy_training_rerun: false,
  small_pilot_training_rerun: false,
  product_training: false,
  long_term_training: false,
  tracked_weights: false,
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
    "check:r24-recovery-candidate",
    "check:vercel-build"
  ],
  scripts_run: results.length,
  results
}, null, 2));
