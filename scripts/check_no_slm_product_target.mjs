#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { normalizeRepoPath } from "./static_llm_policy.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOTS = ["docs", "web", "scripts", "package.json"];
const TEXT_EXTS = new Set([".md", ".js", ".mjs", ".json", ".txt"]);
const SKIP_PATTERNS = [
  /^docs\/R25_STATIC_LLM_CANDIDATE_MATRIX\.md$/,
  /^docs\/LEGACY_SLM_SURFACE\.md$/,
  /^docs\/R25B_SLM_DECOMMISSION_STAGE2\.md$/,
  /^scripts\/audit_slm_legacy_surface\.mjs$/,
  /^scripts\/check_no_slm_product_target\.mjs$/,
  /^web\/tiny_router_model\.generated\.js$/,
  /^web\/culture_cards\.generated\.js$/,
  /^web\/public_knowledge_pack\.generated\.js$/,
  /^web\/knowledge_shards\//
];

const CLAIM_PATTERNS = [
  /personal_?200m.{0,80}(\bfinal\b|\bprimary\b|\bmain\b|product target|future product)/i,
  /(mini[-_ ]web[-_ ]llm).{0,80}(\bfinal\b|\bprimary\b|\bmain\b|product target|future product)/i,
  /\bSLM\b.{0,80}(main intelligence|primary intelligence|final product|product target)/i,
  /small language model.{0,80}(main intelligence|primary intelligence|final product|product target)/i,
  /100M.{0,20}200M.{0,80}(primary product|final product|product target)/i,
  /tiny router.{0,80}(main answer path|main intelligence|primary answer source)/i
];

const ALLOW_CONTEXT = /legacy|fallback|harness|comparison|compare|demot|deprecated|reject|rejected|not final|not the final|not.*product target|no longer.*product target|must not|do not|historical|archive|guardrail|safety/i;

async function walk(path) {
  const out = [];
  const full = resolve(ROOT, path);
  if (!path.includes(".") || path.endsWith("/")) {
    for (const entry of await readdir(full, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) out.push(...(await walk(child)));
      else out.push(child);
    }
  } else {
    out.push(path);
  }
  return out;
}

function contextFor(lines, index) {
  return [lines[index - 1] || "", lines[index], lines[index + 1] || ""].join(" ");
}

async function main() {
  const failures = [];
  const allowed_matches = [];
  const files = [];
  for (const root of ROOTS) files.push(...(await walk(root)));

  for (const file of files.map(normalizeRepoPath).sort()) {
    if (SKIP_PATTERNS.some((pattern) => pattern.test(file))) continue;
    if (!TEXT_EXTS.has(extname(file)) && file !== "package.json") continue;
    const text = await readFile(resolve(ROOT, file), "utf8").catch(() => "");
    if (!text) continue;
    const lines = text.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      const context = contextFor(lines, index);
      const matched = CLAIM_PATTERNS.find((pattern) => pattern.test(context));
      if (!matched) continue;
      const item = { path: file, line: index + 1, text: line.trim().slice(0, 220) };
      if (ALLOW_CONTEXT.test(context)) allowed_matches.push(item);
      else failures.push({ code: "active_slm_product_target_claim", ...item });
    }
  }

  const report = {
    ok: failures.length === 0,
    scanned_files: files.length,
    allowed_match_count: allowed_matches.length,
    failures,
    allowed_matches: allowed_matches.slice(0, 40)
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
