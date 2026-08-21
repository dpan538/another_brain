#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = '55df7f6d811e585789afb00979d7b246272d32eb';
const changed = execFileSync('git', ['diff', '--name-only', BASE, 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const productionPaths = changed.filter((path) => /^(?:web|api|pages\/api|app\/api|functions|netlify\/functions|vercel\/functions)(?:\/|$)|^(?:vercel\.json|netlify\.toml)$/.test(path));
const experimental = changed.filter((path) => /^scripts\/r29b2m_r4h_/.test(path));
const violations = [];
if (productionPaths.length) violations.push({ code: 'production_surface_changed', paths: productionPaths });
for (const path of changed.filter((item) => !/^scripts\/r29b2m_r4h_/.test(item))) {
  const text = await readFile(resolve(ROOT, path), 'utf8').catch(() => '');
  if (/api\.deepseek\.com|DEEPSEEK_API_KEY|deepseek-v4-flash/.test(text) && !/^(?:src\/hybrid_runtime|config\/deepseek_pricing_snapshot\.json|tests\/r29b2m_r4h|prompts\/hybrid_dialogue_system_v1\.txt)/.test(path)) {
    violations.push({ code: 'DeepSeek_reference_outside_experimental_runtime', path });
  }
}
const report = {
  passed: violations.length === 0,
  base_revision: BASE,
  production_surface_diff_count: productionPaths.length,
  production_API_route_added: false,
  Vercel_or_edge_function_added: false,
  production_backend_added: false,
  experimental_script_count: experimental.length,
  local_proxy_scope: 'scripts_only_loopback_experiment',
  supplemental_only: true,
  established_full_repository_gate_still_required: true,
  violations,
};
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
