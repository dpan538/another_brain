#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const steps = [
  ["check:training-approval-markers"],
  ["check:no-training-in-routine-gates"],
  ["check:phase4-scaled-training-readiness"],
  ["plan:architecture-ablation"],
  ["report:r25u-phase-decision"],
  ["check:from-scratch-training-doctrine"],
  ["report:from-scratch-training-progress"],
  ["check:r25t-r25s-analysis"]
];

function tail(text = "", lines = 80) {
  return text.split(/\r?\n/).slice(-lines).join("\n");
}

const results = [];

for (const [script, ...args] of steps) {
  const startedAt = Date.now();
  console.log(`\n[r25u-gate] npm run ${script}${args.length ? ` -- ${args.join(" ")}` : ""}`);
  const result = spawnSync("npm", ["run", script, ...(args.length ? ["--", ...args] : [])], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024
  });
  const item = {
    script,
    args,
    ok: result.status === 0,
    status: result.status,
    signal: result.signal,
    durationMs: Date.now() - startedAt
  };
  results.push(item);
  if (result.status !== 0) {
    console.error(JSON.stringify({
      ok: false,
      gate: "check:r25u-phase3-exit-and-ablation-plan",
      failed_script: script,
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
  gate: "check:r25u-phase3-exit-and-ablation-plan",
  bounded_history_gate: true,
  recursive_prior_gate_replay: false,
  training_rerun: false,
  toy_training_rerun: false,
  small_pilot_training_rerun: false,
  product_training: false,
  long_term_training: false,
  phase_4_scaled_training_approved: false,
  r25v_approved: false,
  tracked_weights: false,
  prior_gates_preserved: [
    "check:r25t-r25s-analysis",
    "check:r25s-data-first-pilot-history",
    "check:r25r-data-first-pilot-design",
    "check:r25q-pilot-analysis",
    "check:r25p-second-small-pilot-history",
    "check:r25o-second-pilot-design",
    "check:r25n-small-pilot-evaluation",
    "check:r25m-small-pilot-history",
    "check:r25k-toy-overfit-history",
    "check:r24-recovery-candidate",
    "check:vercel-build"
  ],
  notes: [
    "R25U validates phase_3 exit criteria and architecture ablation planning only.",
    "No approval-gated training command is invoked by this routine gate.",
    "Phase_4 scaled training remains not approved."
  ],
  scripts_run: results.length,
  results
}, null, 2));
