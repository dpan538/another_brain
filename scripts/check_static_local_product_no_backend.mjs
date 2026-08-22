#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeRepoPath } from "./static_llm_policy.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEXT_EXTS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json", ".md", ".html", ".txt", ".sh"]);
const SKIP_DIRS = new Set([".git", "node_modules", "artifacts"]);
const PRODUCTION_BUILD_FILES = new Set([
  "scripts/prepare_vercel_static_build.mjs",
  "scripts/r28hotfix1_sync_static_entries.mjs",
  "vercel.json",
  "netlify.toml",
]);

function isProductionPath(rel) {
  return /^(?:web|api|pages\/api|app\/api|functions|netlify\/functions|vercel\/functions)(?:\/|$)/.test(rel) || PRODUCTION_BUILD_FILES.has(rel);
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

function lineMatches(text, pattern) {
  return text.split(/\r?\n/).map((line, index) => ({ line: index + 1, text: line })).filter((item) => pattern.test(item.text));
}

export async function checkStaticLocalProduct(options = {}) {
  const root = resolve(options.root ?? ROOT);
  const failures = [];
  const allFiles = await walk(root);
  const productionFiles = allFiles.filter((path) => isProductionPath(normalizeRepoPath(relative(root, path))));
  for (const path of productionFiles) {
    const rel = normalizeRepoPath(relative(root, path));
    if (!TEXT_EXTS.has(extname(path).toLowerCase())) continue;
    const text = await readFile(path, "utf8").catch(() => "");
    if (!text) continue;
    if (/^(?:api|pages\/api|app\/api|functions|netlify\/functions|vercel\/functions)\//.test(rel) && /llm|model|inference|generate|completion|deepseek|static_llm/i.test(text)) {
      failures.push({ code: "api_or_function_llm_inference_surface", path: rel });
    }
    for (const match of lineMatches(text, /runtime\s*=\s*["']edge["']/i)) {
      if (/llm|model|inference|deepseek|static_llm/i.test(text)) failures.push({ code: "edge_function_llm_inference_reference", path: rel, line: match.line });
    }
    for (const match of lineMatches(text, /fetch\s*\(\s*["'`]https?:\/\//i)) {
      if (/llm|model|weight|inference|completion|embed|deepseek|static_llm/i.test(match.text)) failures.push({ code: "external_fetch_for_model_loading", path: rel, line: match.line });
    }
    for (const match of lineMatches(text, /api\.deepseek\.com|api\.openai\.com|openai\.com\/v1|anthropic\.com|replicate\.com|huggingface\.co|together\.ai|groq\.com/i)) {
      failures.push({ code: "external_model_api_or_host_reference", path: rel, line: match.line });
    }
    for (const match of lineMatches(text, /Vercel Blob|AI Gateway|Edge Config|\bKV\b|Postgres|Redis|Upstash|Neon|Blob store|hosted vector|vector store/i)) {
      if (/model|llm|weight|asset|inference|static_llm|loading|runtime/i.test(match.text)) failures.push({ code: "external_storage_for_model_loading_reference", path: rel, line: match.line });
    }
    for (const match of lineMatches(text, /DEEPSEEK_API_KEY|Authorization\s*[:=]\s*["'`]?Bearer|\bsk-[A-Za-z0-9_-]{12,}/i)) {
      failures.push({ code: "browser_or_production_secret_reference", path: rel, line: match.line });
    }
    for (const match of lineMatches(text, /src\/hybrid_runtime|hybrid_runtime\/|r29b2m_r4h_(?:local_proxy|live|run_live)/i)) {
      failures.push({ code: "production_import_or_copy_of_hybrid_lab", path: rel, line: match.line });
    }
  }
  return {
    ok: failures.length === 0,
    profile: "static_local_product",
    scanned_production_files: productionFiles.length,
    policy: {
      no_external_model_api: true,
      no_backend_inference: true,
      no_api_route: true,
      no_vercel_function: true,
      no_edge_function: true,
      no_browser_key: true,
      same_origin_static_model_assets_only: true,
    },
    failures,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await checkStaticLocalProduct();
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 2;
}
