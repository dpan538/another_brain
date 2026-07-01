#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const steps = [
  ["check:training-approval-markers"],
  ["analyze:small-decoder-pilot"],
  ["eval:small-decoder-pilot-heldout"],
  ["report:small-pilot-regression-snapshot"],
  ["report:r25n-next-pilot-decision"],
  ["check:small-decoder-pilot-plan"],
  ["check:from-scratch-training-doctrine"],
  ["report:from-scratch-training-progress"]
];

function tail(text = "", lines = 80) {
  return text.split(/\r?\n/).slice(-lines).join("\n");
}

const results = [];

for (const [script, ...args] of steps) {
  const startedAt = Date.now();
  console.log(`\n[r25m-gate] npm run ${script}${args.length ? ` -- ${args.join(" ")}` : ""}`);
  const result = spawnSync("npm", ["run", script, ...(args.length ? ["--", ...args] : [])], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 96 * 1024 * 1024
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
  gate: "check:r25m-small-decoder-pilot",
  recursive_gate_replay: false,
  training_rerun: false,
  product_training: false,
  long_term_training: false,
  release_checkpoint: false,
  tracked_weights: false,
  recursive_prior_gate_replay: false,
  prior_gates_run_separately: true,
  notes: [
    "R25M validates small-pilot analysis/evaluation reports and safety gates.",
    "Prior milestone gates remain separate routine checks and are not recursively replayed inside R25M."
  ],
  scripts_run: results.length,
  results
}, null, 2));
