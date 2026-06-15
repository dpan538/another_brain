#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";
import { analyzeBlackboxAnswer } from "./r12b_blackbox_checks.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_PROMPTS = resolve(ROOT, "evals/r12b_blackbox/initial_probe_prompts.jsonl");
const DEFAULT_OUT = resolve(ROOT, "artifacts/training_os/r12b_initial_blackbox_probe.json");

function parseArgs(argv) {
  const args = { prompts: DEFAULT_PROMPTS, out: DEFAULT_OUT };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--prompts") args.prompts = resolve(ROOT, argv[++index]);
    else if (item === "--out") args.out = resolve(ROOT, argv[++index]);
    else if (item === "--help") {
      console.log("Usage: node scripts/run_blackbox_probe.mjs [--prompts path] [--out path]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${item}`);
    }
  }
  return args;
}

async function loadJsonl(path) {
  const text = await readFile(path, "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${path}:${index + 1}: ${error.message}`);
      }
    });
}

const args = parseArgs(process.argv.slice(2));
const prompts = await loadJsonl(args.prompts);
const runtime = createDialogRuntime();
const results = [];
for (const spec of prompts) {
  const turn = await answerDialogPrompt(spec.prompt, runtime);
  const answer = turn.answer || "";
  const trace = turn.trace || {};
  const analysis = analyzeBlackboxAnswer({
    prompt: spec.prompt,
    domain: spec.domain,
    answer,
    route: turn.route || trace.answer_source || "",
    intent: turn.intent || trace.intent || ""
  });
  results.push({
    id: spec.id,
    domain: spec.domain,
    prompt: spec.prompt,
    answer,
    route: turn.route || "",
    intent: turn.intent || trace.intent || "",
    operation: turn.operation || trace.operation || "",
    answer_source: trace.answer_source || turn.route || "",
    trace,
    collapse_hits: analysis.collapseHits,
    failures: analysis.failures
  });
}

const byDomain = {};
for (const result of results) {
  byDomain[result.domain] ||= { total: 0, failure_count: 0, collapse_count: 0 };
  byDomain[result.domain].total += 1;
  if (result.failures.length) byDomain[result.domain].failure_count += 1;
  if (result.collapse_hits.length) byDomain[result.domain].collapse_count += 1;
}

const report = {
  ok: true,
  report_only: true,
  generated_at: new Date().toISOString(),
  prompts: prompts.length,
  summary: {
    total: results.length,
    flagged: results.filter((item) => item.failures.length > 0).length,
    collapse_hits: results.filter((item) => item.collapse_hits.length > 0).length,
    by_domain: byDomain
  },
  results
};

await mkdir(dirname(args.out), { recursive: true });
await writeFile(args.out, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ ok: true, report_only: true, summary: report.summary, out: args.out }, null, 2));
