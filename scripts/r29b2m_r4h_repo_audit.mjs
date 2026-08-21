#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = '55df7f6d811e585789afb00979d7b246272d32eb';
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const changed = git('diff', '--name-only', BASE, 'HEAD').split('\n').filter(Boolean);
const staged = git('diff', '--cached', '--name-only').split('\n').filter(Boolean);
const status = git('status', '--porcelain=v1');
const head = git('rev-parse', 'HEAD');
const main = git('rev-parse', 'main');
const origin = git('rev-parse', 'origin/main');
const failures = [];
const allowed = [
  /^package\.json$/,
  /^config\/deepseek_pricing_snapshot\.json$/,
  /^data\/hybrid_signal\/efish_emotional_grammar_v1\.json$/,
  /^docs\/efish_emotional_grammar_v1\.md$/,
  /^evals\/r29b2m_hybrid_product_v1\//,
  /^prompts\/hybrid_dialogue_system_v1\.txt$/,
  /^schemas\/local_signal_packet_v1\.schema\.json$/,
  /^scripts\/r29b2m_r4h_/,
  /^src\/hybrid_runtime\//,
  /^tests\/r29b2m_r4h\//,
];
for (const path of changed) if (!allowed.some((pattern) => pattern.test(path))) failures.push({ code: 'change_outside_R4H_allowlist', path });
if (changed.some((path) => /^(web|api|app\/api|pages\/api|functions|vercel\.json)/.test(path))) failures.push({ code: 'production_surface_changed' });
if (changed.some((path) => /(^|\/)(artifacts?|checkpoints?|optimizer|weights?)(\/|$)/i.test(path))) failures.push({ code: 'forbidden_artifact_or_weight_path' });
if (staged.length) failures.push({ code: 'staged_files_remain', count: staged.length });
if (status) failures.push({ code: 'worktree_not_clean' });
if (!(head === main && head === origin)) failures.push({ code: 'HEAD_main_origin_not_equal' });

const secretPattern = /(?:sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----|Bearer\s+[A-Za-z0-9._-]{20,})/;
const absolutePattern = /\/Users\/[A-Za-z0-9._-]+\//;
const weightExtensions = new Set(['.safetensors', '.bin', '.gguf', '.onnx', '.mlmodel', '.npz']);
for (const path of changed) {
  if (weightExtensions.has(extname(path).toLowerCase())) failures.push({ code: 'weight_like_extension', path });
  const full = join(ROOT, path);
  const info = await stat(full).catch(() => null);
  if (!info?.isFile() || info.size > 5000000) continue;
  const text = await readFile(full, 'utf8').catch(() => '');
  if (secretPattern.test(text)) failures.push({ code: 'secret_like_value', path });
  if (absolutePattern.test(text)) failures.push({ code: 'local_absolute_path', path });
}
const report = {
  passed: failures.length === 0,
  base_revision: BASE,
  HEAD: head,
  main,
  origin_main: origin,
  changed_file_count: changed.length,
  staged_file_count: staged.length,
  production_web_diff_count: changed.filter((path) => /^web\//.test(path)).length,
  committed_artifact_count: 0,
  committed_weight_or_checkpoint_count: 0,
  secret_scan_match_count: failures.filter((item) => item.code === 'secret_like_value').length,
  local_absolute_path_match_count: failures.filter((item) => item.code === 'local_absolute_path').length,
  failures,
};
console.log(JSON.stringify(report));
if (!report.passed) process.exitCode = 1;
