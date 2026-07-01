#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const steps = [
  ["generate:r25l-expanded-corpus"],
  ["check:r25l-expanded-corpus"],
  ["check:r25l-corpus-contamination"],
  ["report:r25l-corpus-coverage"],
  ["build:tokenizer-dryrun-corpus:r25l"],
  ["train:tokenizer-dryrun:r25l"],
  ["check:tokenizer-dryrun:r25l"],
  ["eval:tokenizer-dryrun:r25l"],
  ["plan:small-decoder-pilot"],
  ["check:small-decoder-pilot-plan"],
  ["run:small-decoder-pilot"],
  ["check:from-scratch-training-doctrine"],
  ["report:from-scratch-training-progress"],
  ["check:r25k-toy-overfit-history"],
  ["check:vercel-build"]
];

function tail(text = "", lines = 80) {
  return text.split(/\r?\n/).slice(-lines).join("\n");
}

const results = [];

for (const [script, ...args] of steps) {
  const startedAt = Date.now();
  console.log(`\n[r25l-gate] npm run ${script}${args.length ? ` -- ${args.join(" ")}` : ""}`);
  const result = spawnSync("npm", ["run", script, ...(args.length ? ["--", ...args] : [])], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
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
  gate: "check:r25l-corpus-pilot-plan",
  recursive_gate_replay: false,
  formal_decoder_training: false,
  small_decoder_pilot_training: false,
  scripts_run: results.length,
  results
}, null, 2));
