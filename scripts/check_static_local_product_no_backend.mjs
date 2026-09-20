#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeRepoPath } from "./static_llm_policy.mjs";
import { byokContractFailures, byokFileFailures, importsServerLab, isByokProductPath } from "./byok_product_policy.mjs";
import { isServerProxyPath, serverProxyContractFailures, serverProxyFileFailures } from "./server_proxy_policy.mjs";

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
  return /^(?:web|api|pages\/api|app\/api|app\/server|app\/src|functions|netlify\/functions|vercel\/functions)(?:\/|$)/.test(rel) || PRODUCTION_BUILD_FILES.has(rel);
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
  const byPath = new Map();
  for (const path of productionFiles) {
    const rel = normalizeRepoPath(relative(root, path));
    if (!TEXT_EXTS.has(extname(path).toLowerCase())) continue;
    const text = await readFile(path, "utf8").catch(() => "");
    if (!text) continue;
    byPath.set(rel, text);

    // A reviewed BYOK file may name the DeepSeek host. It still may not carry a
    // secret, reference another model host, or import the server-side lab.
    if (isByokProductPath(rel)) {
      failures.push(...byokFileFailures(rel, text));
      continue;
    }
    // R31B1: one reviewed relay route. It is held to its own, stricter contract.
    if (isServerProxyPath(rel)) {
      failures.push(...serverProxyFileFailures(rel, text));
      continue;
    }
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
    if (importsServerLab(text)) {
      failures.push({ code: "production_import_or_copy_of_hybrid_lab", path: rel });
    }
    for (const match of lineMatches(text, /r29b2m_r4h_(?:local_proxy|live|run_live)/i)) {
      failures.push({ code: "production_copy_of_hybrid_lab_runner", path: rel, line: match.line });
    }
  }
  failures.push(...byokContractFailures(byPath));
  failures.push(...serverProxyContractFailures(byPath));

  // R31B1: report what is true of this tree. When the relay is present there IS an
  // API route and an Edge function, exactly one, and saying otherwise would be a lie.
  const relay = byPath.has("api/chat.js");
  return {
    ok: failures.length === 0,
    profile: "static_local_product",
    scanned_production_files: productionFiles.length,
    policy: {
      // R31A0: the product answers with DeepSeek, called by the browser with a
      // key the user supplies at runtime. R31B1: or relayed through one reviewed
      // route that holds the owner's key on the server. Neither does any inference.
      browser_byok_remote_answer: true,
      server_held_key_single_relay_route: relay,
      no_committed_secret: true,
      no_backend_inference: true,
      no_api_route: !relay,
      no_vercel_function: !relay,
      no_edge_function: !relay,
      no_committed_browser_key: true,
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
