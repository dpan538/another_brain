#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { normalizeRepoPath } from "./static_llm_policy.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const TEXT_EXTS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json", ".md", ".html", ".txt", ".sh"]);
const SKIP_DIRS = new Set([".git", "node_modules", "artifacts", "build_sources", "knowledge_sources", "data"]);
const GENERATED_OR_LARGE = [
  /^web\/tiny_router_model\.generated\.js$/,
  /^web\/culture_cards\.generated\.js$/,
  /^web\/public_knowledge_pack\.generated\.js$/,
  /^web\/knowledge_shards\//,
  /^web\/brain_pack\.js$/,
  /^evals\//,
  /^scripts\/check_no_backend_llm_inference\.mjs$/,
  /^scripts\/check_vercel_static_build\.mjs$/
];

function isSkippedPath(rel) {
  return GENERATED_OR_LARGE.some((pattern) => pattern.test(rel));
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else out.push(path);
  }
  return out;
}

function lineMatches(text, pattern) {
  const lines = text.split(/\r?\n/);
  return lines
    .map((line, index) => ({
      line: index + 1,
      text: line,
      context: [lines[index - 1] || "", line, lines[index + 1] || ""].join(" ")
    }))
    .filter((item) => pattern.test(item.text));
}

function isPolicyProhibitionLine(text) {
  const value = String(text || "");
  return (
    /\b(no|not|never|must not|forbidden|reject|rejected|without|do not|does not|禁止|不得)\b/i.test(value) ||
    /^\s*-\s*(cloud inference|server inference|vercel function|edge function|external model api|external model apis)/i.test(value)
  );
}

async function main() {
  const failures = [];
  const warnings = [];
  const files = await walk(ROOT);

  for (const path of files) {
    const rel = normalizeRepoPath(relative(ROOT, path));
    if (isSkippedPath(rel)) continue;
    if (!TEXT_EXTS.has(extname(path).toLowerCase())) continue;
    const text = await readFile(path, "utf8").catch(() => "");
    if (!text) continue;

    if (/^(api|pages\/api|app\/api|functions|netlify\/functions|vercel\/functions)\//.test(rel) && /llm|model|inference|generate|completion|static_llm/i.test(text)) {
      failures.push({ code: "api_or_function_llm_inference_surface", path: rel });
    }

    for (const match of lineMatches(text, /runtime\s*=\s*["']edge["']|Edge Function|edge function/i)) {
      if (!isPolicyProhibitionLine(match.context) && /llm|model|inference|static_llm/i.test(match.text)) {
        failures.push({ code: "edge_function_llm_inference_reference", path: rel, line: match.line });
      }
    }

    for (const match of lineMatches(text, /fetch\s*\(\s*["'`](https?:\/\/[^"'`]+)["'`]/)) {
      if (/llm|model|weight|inference|completion|embed|static_llm/i.test(match.text)) {
        failures.push({ code: "external_fetch_for_model_loading", path: rel, line: match.line });
      }
    }

    for (const match of lineMatches(text, /api\.openai\.com|openai\.com\/v1|anthropic\.com|replicate\.com|huggingface\.co|together\.ai|groq\.com/i)) {
      if (!isPolicyProhibitionLine(match.context) && (/web\/|runtime|inference|model|llm|weight|load|asset|api/i.test(rel) || /fetch|load|runtime|inference|weight|asset/i.test(match.text))) {
        failures.push({ code: "external_model_api_or_host_reference", path: rel, line: match.line });
      } else {
        warnings.push({ code: "historical_external_model_host_reference", path: rel, line: match.line });
      }
    }

    for (const match of lineMatches(text, /Vercel Blob|AI Gateway|Edge Config|KV|Postgres|Redis|Upstash|Neon|Blob store|hosted vector|vector store/i)) {
      if (!isPolicyProhibitionLine(match.context) && /model|llm|weight|asset|inference|static_llm|loading|runtime/i.test(match.text)) {
        failures.push({ code: "external_storage_for_model_loading_reference", path: rel, line: match.line });
      }
    }
  }

  const report = {
    ok: failures.length === 0,
    scanned_files: files.length,
    policy: {
      no_vercel_function_llm_inference: true,
      no_edge_function_llm_inference: true,
      no_external_model_api: true,
      no_external_storage_for_model_loading: true,
      static_assets_same_origin_only: true
    },
    failures,
    warnings
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
