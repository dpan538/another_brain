#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";
import { analyzeBlackboxAnswer } from "./r12b_blackbox_checks.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_PROMPTS = resolve(ROOT, "evals/r12b_blackbox/initial_probe_prompts.jsonl");
const DEFAULT_OUT = resolve(ROOT, "artifacts/training_os/r12b_blind_gate_report.json");

function parseArgs(argv) {
  const args = { prompts: DEFAULT_PROMPTS, out: DEFAULT_OUT, reportOnly: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--prompts") args.prompts = resolve(ROOT, argv[++index]);
    else if (item === "--out") args.out = resolve(ROOT, argv[++index]);
    else if (item === "--report-only") args.reportOnly = true;
    else if (item === "--help") {
      console.log("Usage: node scripts/eval_r12_blind_gate.mjs [--report-only]");
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
  const analysis = analyzeBlackboxAnswer({
    prompt: spec.prompt,
    domain: spec.domain,
    answer: turn.answer || "",
    route: turn.route || turn.trace?.answer_source || "",
    intent: turn.intent || turn.trace?.intent || ""
  });
  results.push({
    id: spec.id,
    domain: spec.domain,
    prompt: spec.prompt,
    answer: turn.answer,
    route: turn.route,
    intent: turn.intent || turn.trace?.intent || "",
    failures: analysis.failures,
    ok: analysis.failures.length === 0
  });
}

const failures = results.filter((item) => !item.ok);
const byDomain = {};
for (const result of results) {
  byDomain[result.domain] ||= { total: 0, failed: 0 };
  byDomain[result.domain].total += 1;
  if (!result.ok) byDomain[result.domain].failed += 1;
}

const report = {
  ok: failures.length === 0,
  mode: args.reportOnly ? "report-only" : "strict",
  generated_at: new Date().toISOString(),
  summary: {
    total: results.length,
    passed: results.length - failures.length,
    failed: failures.length,
    by_domain: byDomain
  },
  failures,
  results
};

await mkdir(dirname(args.out), { recursive: true });
await writeFile(args.out, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ ok: report.ok, mode: report.mode, summary: report.summary, out: args.out }, null, 2));
process.exit(report.ok || args.reportOnly ? 0 : 2);
