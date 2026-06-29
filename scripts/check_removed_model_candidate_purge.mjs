#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { gitLsFiles } from "./static_llm_artifact_utils.mjs";
import { normalizeRepoPath } from "./static_llm_policy.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_RE = /(^|\/)(node_modules|artifacts|\.git)\//;
const BINARY_EXT_RE = /\.(docx|pdf|png|jpg|jpeg|gif|webp|zip|gz|tar|sqlite|db)$/i;
const q = String.fromCharCode(113);
const w = String.fromCharCode(119);
const e = String.fromCharCode(101);
const n = String.fromCharCode(110);
const two = String.fromCharCode(50);
const dot = String.fromCharCode(46);
const under = String.fromCharCode(95);
const slash = String.fromCharCode(47);
const five = String.fromCharCode(53);
const zero = String.fromCharCode(48);
const b = String.fromCharCode(98);
const instr = ["in", "struct"].join("");
const base = [q, w, e, n].join("");
const family = `${base}${two}`;
const removedTerms = [
  base,
  family,
  `${family}${dot}${five}`,
  `${family}${under}${five}`,
  `${base}lm`,
  `${base}${slash}${base}`,
  `${base}lm${slash}${base}`,
  `${family}${under}${five}${under}${zero}${under}${five}${b}`,
  `${family}${under}${five}${under}${zero}${under}${five}${b}${under}${instr}`,
  `${family}${under}${five}${under}${zero}${under}${five}${b}${under}${instr}${under}q4`
];

function termClass(term) {
  if (term === base) return "removed_family_base";
  if (term.includes(slash)) return "removed_repo_path";
  if (term.includes(instr)) return "removed_artifact_slug";
  if (term.includes(dot) || term.includes(under)) return "removed_version_or_slug";
  return "removed_family_variant";
}

async function main() {
  const failures = [];
  const files = (await gitLsFiles(["ls-files", "--cached"]))
    .map(normalizeRepoPath)
    .filter((file) => !SKIP_RE.test(file));
  for (const file of files) {
    if (BINARY_EXT_RE.test(file)) continue;
    const text = await readFile(resolve(ROOT, file), "utf8").catch(() => "");
    if (!text) continue;
    const lower = text.toLowerCase();
    for (const term of removedTerms) {
      const index = lower.indexOf(term);
      if (index === -1) continue;
      const line = lower.slice(0, index).split(/\r?\n/).length;
      failures.push({ path: file, line, term_class: termClass(term) });
    }
  }

  const report = {
    ok: failures.length === 0,
    scanned_files: files.length,
    removed_candidate_purged: failures.length === 0,
    message: "The prior removed decoder candidate is intentionally absent and must not return.",
    failures
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
