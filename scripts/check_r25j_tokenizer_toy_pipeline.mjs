#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const scripts = [
  'check:training-approval-markers',
  'check:no-training-in-routine-gates',
  'check:tokenizer-data-boundaries',
  'check:tokenizer-dryrun-history',
  'check:tiny-decoder-toy-pipeline',
  'check:from-scratch-training-doctrine',
  'report:from-scratch-training-progress',
  'check:vercel-build'
];

const results = [];

for (const script of scripts) {
  const startedAt = Date.now();
  console.log(`\n[r25j-gate] npm run ${script}`);
  const result = spawnSync('npm', ['run', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'inherit'
  });
  const durationMs = Date.now() - startedAt;
  results.push({
    script,
    ok: result.status === 0,
    status: result.status,
    signal: result.signal,
    durationMs
  });
  if (result.status !== 0) {
    console.error(JSON.stringify({
      ok: false,
      failed_script: script,
      results
    }, null, 2));
    process.exit(result.status ?? 1);
  }
}

console.log(JSON.stringify({
  ok: true,
  gate: 'check:r25j-tokenizer-toy-pipeline',
  recursive_gate_replay: false,
  history_only: true,
  tokenizer_corpus_build_rerun: false,
  tokenizer_training_rerun: false,
  toy_training_rerun: false,
  formal_decoder_training: false,
  notes: [
    'R25J routine gate validates existing tokenizer history and toy-pipeline evidence only.',
    'It does not rebuild tokenizer corpus, rerun tokenizer dry-run validation/eval, retrain tokenizer artifacts, or run toy overfit.'
  ],
  scripts_run: results.length,
  results
}, null, 2));
