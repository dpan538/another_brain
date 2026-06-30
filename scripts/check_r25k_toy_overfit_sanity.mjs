#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const steps = [
  { script: "check:training-approval-markers" },
  { script: "check:r25k-toy-overfit-history" },

  // R25J already flattens the R25I/H/G/F/E/D/C/B/A and R24 leaves to avoid
  // recursive aggregate replay. R25K reuses that once after its history check.
  { script: "check:r25j-tokenizer-toy-pipeline" }
];

const results = [];

function tail(text = "", maxChars = 4000) {
  const value = String(text || "");
  return value.length > maxChars ? value.slice(-maxChars) : value;
}

for (const step of steps) {
  const startedAt = Date.now();
  const args = ["run", step.script, ...(step.extraArgs || [])];
  console.log(`\n[r25k-gate] npm ${args.join(" ")}`);
  const result = spawnSync("npm", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024
  });
  const durationMs = Date.now() - startedAt;
  results.push({
    script: step.script,
    args: step.extraArgs || [],
    ok: result.status === 0,
    status: result.status,
    signal: result.signal,
    durationMs
  });
  if (result.status !== 0) {
    if (result.stdout) console.error(tail(result.stdout));
    if (result.stderr) console.error(tail(result.stderr));
    console.error(JSON.stringify({
      ok: false,
      gate: "check:r25k-toy-overfit-sanity",
      failed_script: step.script,
      results
    }, null, 2));
    process.exit(result.status ?? 1);
  }
  console.log(`[r25k-gate] ok ${step.script} (${durationMs}ms)`);
}

console.log(JSON.stringify({
  ok: true,
  gate: "check:r25k-toy-overfit-sanity",
  recursive_gate_replay: false,
  training_rerun: false,
  toy_training_scope: "toy_overfit_sanity_only",
  formal_training_progress_percent: 0,
  scripts_run: results.length,
  results
}, null, 2));
