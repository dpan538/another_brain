#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
  /^scripts\/audit_legacy_no_backend_full_repo\.mjs$/,
  /^scripts\/check_vercel_static_build\.mjs$/,
];

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
  const lines = text.split(/\r?\n/);
  return lines.map((line, index) => ({
    line: index + 1,
    text: line,
    context: [lines[index - 1] || "", line, lines[index + 1] || ""].join(" "),
  })).filter((item) => pattern.test(item.text));
}

function isPolicyProhibitionLine(text) {
  const value = String(text || "");
  return (
    /\b(no|not|never|must not|cannot|forbidden|reject|rejected|without|do not|does not|禁止|不得)\b/i.test(value) ||
    /^\s*-\s*(cloud inference|server inference|vercel function|edge function|external model api|external model apis)/i.test(value)
  );
}

function semanticLineHash(value) {
  const normalized = String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  return createHash("sha256").update(normalized).digest("hex");
}

function finding(code, path, match = {}) {
  return {
    gate: "audit:legacy-no-backend-full-repo",
    code,
    normalized_path: normalizeRepoPath(path),
    semantic_source_line_hash: semanticLineHash(match.text ?? code),
    ...(match.line ? { line: match.line } : {}),
  };
}

async function main() {
  const failures = [];
  const warnings = [];
  const files = await walk(ROOT);
  for (const path of files) {
    const rel = normalizeRepoPath(relative(ROOT, path));
    if (GENERATED_OR_LARGE.some((pattern) => pattern.test(rel))) continue;
    if (!TEXT_EXTS.has(extname(path).toLowerCase())) continue;
    const text = await readFile(path, "utf8").catch(() => "");
    if (!text) continue;

    if (/^(api|pages\/api|app\/api|functions|netlify\/functions|vercel\/functions)\//.test(rel) && /llm|model|inference|generate|completion|static_llm/i.test(text)) {
      failures.push(finding("api_or_function_llm_inference_surface", rel));
    }
    for (const match of lineMatches(text, /runtime\s*=\s*["']edge["']|Edge Function|edge function/i)) {
      if (!isPolicyProhibitionLine(match.context) && /llm|model|inference|static_llm/i.test(match.text)) failures.push(finding("edge_function_llm_inference_reference", rel, match));
    }
    for (const match of lineMatches(text, /fetch\s*\(\s*["'`](https?:\/\/[^"'`]+)["'`]/)) {
      if (/llm|model|weight|inference|completion|embed|static_llm/i.test(match.text)) failures.push(finding("external_fetch_for_model_loading", rel, match));
    }
    for (const match of lineMatches(text, /api\.openai\.com|openai\.com\/v1|anthropic\.com|replicate\.com|huggingface\.co|together\.ai|groq\.com/i)) {
      if (!isPolicyProhibitionLine(match.context) && (/web\/|runtime|inference|model|llm|weight|load|asset|api/i.test(rel) || /fetch|load|runtime|inference|weight|asset/i.test(match.text))) {
        failures.push(finding("external_model_api_or_host_reference", rel, match));
      } else {
        warnings.push(finding("historical_external_model_host_reference", rel, match));
      }
    }
    for (const match of lineMatches(text, /Vercel Blob|AI Gateway|Edge Config|KV|Postgres|Redis|Upstash|Neon|Blob store|hosted vector|vector store/i)) {
      if (!isPolicyProhibitionLine(match.context) && /model|llm|weight|asset|inference|static_llm|loading|runtime/i.test(match.text)) failures.push(finding("external_storage_for_model_loading_reference", rel, match));
    }
  }
  const report = {
    ok: failures.length === 0,
    audit_only: true,
    blocks_static_product: false,
    scanned_files: files.length,
    failures,
    warnings,
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, audit_only: true, error: error?.name || "legacy_audit_failed" }));
  process.exit(2);
});
