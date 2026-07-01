#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const steps = [
  ["check:training-approval-markers"],
  ["plan:second-small-decoder-pilot"],
  ["check:small-decoder-checkpoint-schema"],
  ["eval:small-decoder-pilot-replay-heldout"],
  ["compare:small-pilot-history"],
  ["report:from-scratch-training-progress"],
  ["check:from-scratch-training-doctrine"]
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
  prior_gates_run_separately: true,
  notes: [
    "R25O validates second-pilot design and replay protocol only.",
    "Prior milestone gates remain separate routine checks and are not recursively replayed inside R25O."
  ],
  scripts_run: results.length,
  results
}, null, 2));
