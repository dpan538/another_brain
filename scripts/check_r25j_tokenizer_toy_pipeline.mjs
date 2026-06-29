#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const scripts = [
  'build:tokenizer-dryrun-corpus',
  'train:tokenizer-dryrun',
  'check:tokenizer-data-boundaries',
  'check:tokenizer-dryrun',
  'eval:tokenizer-dryrun',
  'plan:tiny-decoder-toy',
  'check:tiny-decoder-toy-pipeline',
  'run:tiny-decoder-toy-overfit',
  'check:from-scratch-training-doctrine',
  'report:from-scratch-training-progress',

  // R25I/H/G/F policy and capacity checks, flattened to avoid recursive gate replay.
  'check:removed-model-candidates',
  'check:no-active-named-model-candidate',
  'build:static-llm-candidates',
  'check:no-slm-product-target',
  'check:static-llm-candidate-decisions',
  'score:static-decoder-candidates',
  'eval:static-llm-capacity-envelope',
  'generate:static-llm-dryrun-manifests',
  'check:static-llm-manifest',
  'check:static-llm-budget',
  'eval:static-llm-browser-memory-envelope',
  'simulate:static-llm-deploy-payload',
  'check:static-llm-conversion-paths',

  // R25B-E artifact, runtime, and training-corpus gates.
  'generate:r25b-llm-corpus',
  'check:llm-training-corpus',
  'check:llm-training-contamination',
  'report:llm-training-coverage',
  'build:r25b-training-pack',
  'audit:slm-legacy-surface',
  'check:no-backend-llm',
  'eval:static-llm-asset-loader',
  'eval:static-llm-browser-budget',
  'eval:r25-static-llm-admission',
  'discover:static-llm-artifacts',
  'audit:static-llm-inbox',
  'check:static-llm-admission-approval',
  'check:no-unapproved-model-weights',
  'audit:static-llm-backend-format',
  'check:static-llm-deploy-payload',
  'eval:static-llm-candidate-loader',
  'eval:static-llm-first-token',
  'eval:llm-answer-contract',
  'report:static-llm-readiness',
  'eval:static-llm-storage-plan',

  // R24 safety harness and static deploy checks, run once at the end.
  'check:r24-recovery-candidate',
  'check:r24g-source-derivation',
  'check:r24b-shard-runtime',
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
  scripts_run: results.length,
  results
}, null, 2));
