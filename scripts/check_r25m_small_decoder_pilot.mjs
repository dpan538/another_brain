#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const steps = [
  ["build:tokenizer-dryrun-corpus:r25l"],
  ["train:tokenizer-dryrun:r25l"],
  ["check:tokenizer-dryrun:r25l"],
  ["eval:tokenizer-dryrun:r25l"],
  ["build:small-decoder-pilot-dataset"],
  ["check:small-decoder-pilot-plan"],
  ["check:small-decoder-numeric-backend"],
  ["run:small-decoder-pilot", "--allow-small-pilot-training"],
  ["eval:small-decoder-pilot"],
  ["check:small-decoder-pilot-artifacts-untracked"],
  ["report:small-decoder-pilot-gates"],
  ["check:from-scratch-training-doctrine"],
  ["report:from-scratch-training-progress"],
  ["check:r25l-corpus-pilot-plan"],
  ["check:r25k-toy-overfit-sanity"],
  ["check:r25j-tokenizer-toy-pipeline"],
  ["check:r25i-from-scratch-roadmap"],
  ["check:r25h-capacity-envelope"],
  ["check:r25g-candidate-decision"],
  ["check:r25f-candidate-purge"],
  ["check:r25e-artifact-admission"],
  ["check:r25d-browser-inference-binding"],
  ["check:r25c-static-artifact-intake"],
  ["check:r25b-static-decoder-training"],
  ["check:r25-llm-first-static"],
  ["check:r24-recovery-candidate"],
  ["check:vercel-build"]
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
  product_training: false,
  long_term_training: false,
  release_checkpoint: false,
  tracked_weights: false,
  scripts_run: results.length,
  results
}, null, 2));
