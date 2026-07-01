#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const steps = [
  ["check:training-approval-markers"],
  ["check:no-training-in-routine-gates"],
  ["analyze:r25s-pilot"],
  ["eval:r25s-heldout-breakdown"],
  ["compare:r25p-r25s-generalization"],
  ["report:r25t-next-step"],
  ["check:from-scratch-training-doctrine"],
  ["report:from-scratch-training-progress"]
];

function tail(text = "", lines = 80) {
  return text.split(/\r?\n/).slice(-lines).join("\n");
}

const results = [];

for (const [script, ...args] of steps) {
  const startedAt = Date.now();
  console.log(`\n[r25t-gate] npm run ${script}${args.length ? ` -- ${args.join(" ")}` : ""}`);
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
      gate: "check:r25t-r25s-analysis",
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
  gate: "check:r25t-r25s-analysis",
  bounded_history_gate: true,
  recursive_prior_gate_replay: false,
  training_rerun: false,
  toy_training_rerun: false,
  small_pilot_training_rerun: false,
  product_training: false,
  long_term_training: false,
  phase_4_scaled_training_approved: false,
  r25u_approved: false,
  tracked_weights: false,
  prior_gates_run_separately: true,
  notes: [
    "R25T validates R25S analysis and comparison reports.",
    "Prior milestone gates remain separate routine checks and are not recursively replayed inside R25T.",
    "No approval-gated training command is invoked by this routine gate."
  ],
  scripts_run: results.length,
  results
}, null, 2));
