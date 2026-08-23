#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeRepoPath } from "./static_llm_policy.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEXT_EXTS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json", ".md", ".html", ".txt", ".sh"]);
const SKIP_DIRS = new Set([".git", "node_modules", "artifacts"]);
const LAB_PATHS = [
  /^config\/deepseek_pricing_snapshot\.json$/,
  /^config\/r29b2m_r4h(?:_r[23])?_live_policy\.json$/,
  /^config\/r29p0_(?:deterministic_controller_v1|live_policy|official_api_contract|protocol_freeze)\.json$/,
  /^data\/hybrid_signal\//,
  /^docs\/R29B2M_R4H_R2_GROUNDED_ATTENTION_STYLE_RECOVERY\.md$/,
  /^docs\/efish_emotional_grammar_v1\.md$/,
  /^docs\/r29b2m_r4h_r1_/,
  /^docs\/R29B2M_R4H_R3_/,
  /^docs\/R29P0_EQUIVALENCE_PAIRWISE_ORACLE\.md$/,
  /^evals\/r29b2m_hybrid_critic_v1\//,
  /^evals\/r29b2m_hybrid_product_v[12]\//,
  /^prompts\/hybrid_(?:dialogue_system_v[12]|canonical_answer_system_v3|constrained_rewrite_system_v3|controlled_one_call_system_v3)\.txt$/,
  /^reports\/(?:v[12]_|r3_)/,
  /^schemas\/local_critic_packet_v1\.schema\.json$/,
  /^schemas\/local_signal_packet_v[12]\.schema\.json$/,
  /^scripts\/audit_legacy_no_backend_full_repo\.mjs$/,
  /^scripts\/check_hybrid_lab_isolation\.mjs$/,
  /^scripts\/check_no_backend_llm_reconciled\.mjs$/,
  /^scripts\/check_static_local_product_no_backend\.mjs$/,
  /^scripts\/r29b2m_r4h_/,
  /^scripts\/r29p0_/,
  /^src\/hybrid_runtime\//,
  /^tests\/r29b2m_r4h(?:_r[23])?\//,
  /^tests\/r29p0\//,
];

export function isHybridLabPath(path) {
  const rel = normalizeRepoPath(path);
  return LAB_PATHS.some((pattern) => pattern.test(rel));
}

export function isProductionSurface(path) {
  const rel = normalizeRepoPath(path);
  return /^(?:web|api|pages\/api|app\/api|functions|netlify\/functions|vercel\/functions)(?:\/|$)/.test(rel) || ["vercel.json", "netlify.toml"].includes(rel);
}

function isHybridServerSource(path) {
  return /^scripts\/r29b2m_r4h_(?:local_proxy|live|run_live|browser_live)/.test(normalizeRepoPath(path));
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(path));
    else out.push(path);
  }
  return out;
}

export function evaluateHybridIsolation(entries, policy) {
  const failures = [];
  const byPath = new Map(entries.map((entry) => [normalizeRepoPath(entry.path), String(entry.text || "")]));
  const requiredPolicy = {
    profile: "hybrid_lab",
    production: false,
    listener_host: "127.0.0.1",
    public_fixture_path: "evals/r29b2m_hybrid_product_v1/cases.jsonl",
    maximum_total_requests: 90,
    maximum_input_tokens: 300000,
    maximum_output_tokens: 30000,
    maximum_estimated_cost_cny: 5,
    concurrency: 1,
    allow_private_user_messages: false,
    allow_arbitrary_manual_prompt: false,
    allow_dynamic_internet_input: false,
    allow_production_route: false,
    allow_production_import: false,
    allow_production_build_copy: false,
    allow_browser_key: false,
    allow_deployment: false,
  };
  for (const [field, expected] of Object.entries(requiredPolicy)) {
    if (policy?.[field] !== expected) failures.push({ code: `hybrid_policy_mismatch:${field}` });
  }

  for (const [path, text] of byPath) {
    const deepseekReference = /api\.deepseek\.com|DEEPSEEK_API_KEY|deepseek-v4-flash|LiveDeepSeekAdapter|live_deepseek_adapter/i.test(text);
    if (deepseekReference && !isHybridLabPath(path)) failures.push({ code: "deepseek_reference_outside_hybrid_lab", path });
    if (isProductionSurface(path) && /api\.deepseek\.com|DEEPSEEK_API_KEY|Authorization\s*[:=]\s*["'`]?Bearer|src\/hybrid_runtime|hybrid_runtime\/|r29b2m_r4h_/i.test(text)) {
      failures.push({ code: "production_surface_imports_or_exposes_hybrid_lab", path });
    }
    if (isHybridServerSource(path) && /(?:listen|host|bind)[^\n]{0,80}(?:0\.0\.0\.0|\[?::\]?)/i.test(text)) {
      failures.push({ code: "hybrid_lab_public_listener", path });
    }
    if (path.startsWith("web/") && /DEEPSEEK_API_KEY|Authorization\s*[:=]\s*["'`]?Bearer|\bsk-[A-Za-z0-9_-]{12,}/i.test(text)) {
      failures.push({ code: "browser_side_secret", path });
    }
  }

  const proxy = byPath.get("scripts/r29b2m_r4h_local_proxy.mjs") || "";
  if (!/127\.0\.0\.1/.test(proxy)) failures.push({ code: "loopback_proxy_binding_missing" });
  if (!/public_fixture_id_required/.test(proxy) || !/fixtureMap/.test(proxy)) failures.push({ code: "public_fixture_only_guard_missing" });
  const liveAdapter = byPath.get("src/hybrid_runtime/live_deepseek_adapter.ts") || "";
  if (!/typeof window/.test(liveAdapter) || !/process\.env\.DEEPSEEK_API_KEY/.test(liveAdapter)) failures.push({ code: "server_only_secret_guard_missing" });
  const packageJson = byPath.get("package.json") || "{}";
  try {
    const scripts = JSON.parse(packageJson).scripts || {};
    for (const name of ["build", "build:vercel"]) {
      if (/r29b2m_r4h|hybrid_runtime|deepseek/i.test(String(scripts[name] || ""))) failures.push({ code: "production_build_copies_hybrid_lab", path: "package.json", script: name });
    }
  } catch {
    failures.push({ code: "package_json_invalid" });
  }
  return {
    ok: failures.length === 0,
    profile: "hybrid_lab",
    loopback_only: true,
    public_safe_fixtures_only: true,
    production_route_allowed: false,
    browser_key_allowed: false,
    deployment_allowed: false,
    failures,
  };
}

export async function checkHybridLabIsolation(options = {}) {
  const root = resolve(options.root ?? ROOT);
  const files = await walk(root);
  const entries = [];
  for (const path of files) {
    if (!TEXT_EXTS.has(extname(path).toLowerCase())) continue;
    entries.push({ path: normalizeRepoPath(relative(root, path)), text: await readFile(path, "utf8").catch(() => "") });
  }
  const policy = JSON.parse(await readFile(resolve(root, "config/r29b2m_r4h_live_policy.json"), "utf8").catch(() => "{}"));
  return evaluateHybridIsolation(entries, policy);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await checkHybridLabIsolation();
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 2;
}
