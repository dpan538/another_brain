#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const steps = [
  ["check:training-approval-markers"],
  ["check:no-training-in-routine-gates"],
  ["check:phase4-scaled-training-readiness"],
  ["eval:phase4-static-envelope"],
  ["report:r25aa-phase3-pause"],
  ["check:from-scratch-training-doctrine"],
  ["report:from-scratch-training-progress"]
];

function tail(text = "", lines = 80) {
  return text.split(/\r?\n/).slice(-lines).join("\n");
}

const results = [];
for (const [script, ...args] of steps) {
  const startedAt = Date.now();
  console.log(`\n[r25aa-gate] npm run ${script}${args.length ? ` -- ${args.join(" ")}` : ""}`);
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
      gate: "check:r25aa-phase4-readiness-review",
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
  gate: "check:r25aa-phase4-readiness-review",
  training_rerun: false,
  toy_training_rerun: false,
  small_pilot_training_rerun: false,
  phase_4_scaled_training_ran: false,
  phase_4_scaled_training_approved: false,
  product_training: false,
  long_term_training: false,
  active_training_approval_count_expected: 0,
  active_phase4_training_approval_count_expected: 0,
  recursive_prior_gate_replay: false,
  prior_gates_run_separately: true,
  notes: [
    "R25AA validates phase_3 pause and phase_4 readiness review only.",
    "No approval-gated training command is invoked by this routine gate.",
    "Prior milestone gates remain separate routine checks and are not recursively replayed inside R25AA.",
    "Phase_4 scaled training remains not approved."
  ],
  scripts_run: results.length,
  results
}, null, 2));
