#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CASES = resolve(ROOT, "evals/culture_awareness/culture_awareness_cases.jsonl");
const DEFAULT_OUT = resolve(ROOT, "artifacts/training_os/culture_awareness_report.json");
const BAD_FALLBACK_RE = /(也许发生过|不在我眼前|你需要提问)/;
const ASSISTANT_TONE_RE = /(作为一个 AI|AI助手|智能助手|为您服务|我可以为您提供)/i;

function parseArgs(argv) {
  const args = { cases: DEFAULT_CASES, out: DEFAULT_OUT };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--cases") args.cases = resolve(ROOT, argv[++index]);
    else if (item === "--out") args.out = resolve(ROOT, argv[++index]);
    else if (item === "--help") {
      console.log("Usage: node scripts/eval_culture_awareness.mjs [--cases path] [--out path]");
      process.exit(0);
    }
  }
  return args;
}

async function loadJsonl(path) {
  const content = await readFile(path, "utf8");
  return content
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

function includesAny(text, terms = []) {
  return terms.some((term) => String(text || "").includes(term));
}

function checkCase(spec, turn) {
  const failures = [];
  const answer = turn.answer || "";
  const trace = turn.trace || {};
  const rawAnswer = trace.raw_answer || answer;
  const intent = trace.intent || turn.intent || "";
  const contextAction = trace.context_action || "";
  const forbiddenText = `${answer}\n${rawAnswer}`;

  if (spec.expected_intent && intent !== spec.expected_intent) {
    failures.push({ check: "expected_intent", expected: spec.expected_intent, actual: intent });
  }
  if (spec.expected_context_action && contextAction !== spec.expected_context_action) {
    failures.push({ check: "expected_context_action", expected: spec.expected_context_action, actual: contextAction });
  }
  if (Array.isArray(spec.must_include_any) && !includesAny(answer, spec.must_include_any)) {
    failures.push({ check: "must_include_any", expected: spec.must_include_any, actual: answer });
  }
  for (const term of spec.must_not_include || []) {
    if (forbiddenText.includes(term)) {
      failures.push({ check: "must_not_include", term, answer, rawAnswer });
    }
  }
  if (spec.max_chars && answer.length > spec.max_chars) {
    failures.push({ check: "max_chars", max: spec.max_chars, actual: answer.length, answer });
  }
  if (BAD_FALLBACK_RE.test(forbiddenText)) {
    failures.push({ check: "bad_fallback", answer, rawAnswer });
  }
  if (ASSISTANT_TONE_RE.test(forbiddenText)) {
    failures.push({ check: "assistant_tone", answer, rawAnswer });
  }
  return failures;
}

async function runCase(spec) {
  const runtime = createDialogRuntime();
  const setupTurns = [];
  for (const prompt of spec.setup || []) {
    setupTurns.push(await answerDialogPrompt(prompt, runtime));
  }
  const turn = await answerDialogPrompt(spec.prompt, runtime);
  const failures = checkCase(spec, turn);
  return {
    id: spec.id,
    family_id: spec.family_id,
    source: spec.source,
    setup: spec.setup || [],
    prompt: spec.prompt,
    expected_intent: spec.expected_intent,
    expected_context_action: spec.expected_context_action,
    intent: turn.trace?.intent,
    context_action: turn.trace?.context_action,
    answer_source: turn.trace?.answer_source,
    sanitizer_changed: turn.trace?.sanitizer_changed,
    answer: turn.answer,
    raw_answer: turn.trace?.raw_answer,
    setupTurns: setupTurns.map((item) => ({
      prompt: item.prompt,
      intent: item.trace?.intent,
      context_action: item.trace?.context_action,
      answer: item.answer
    })),
    failures,
    ok: failures.length === 0
  };
}

const args = parseArgs(process.argv.slice(2));
const specs = await loadJsonl(args.cases);
const results = [];
for (const spec of specs) {
  results.push(await runCase(spec));
}

const failures = results.filter((item) => !item.ok);
const byFamily = {};
for (const item of results) {
  const family = item.family_id || "unknown";
  byFamily[family] ||= { total: 0, failed: 0 };
  byFamily[family].total += 1;
  if (!item.ok) byFamily[family].failed += 1;
}

const report = {
  ok: failures.length === 0,
  suite: "culture_awareness",
  summary: {
    total: results.length,
    passed: results.length - failures.length,
    failed: failures.length,
    criticalFailures: failures.length,
    byFamily
  },
  results,
  failures
};

await mkdir(dirname(args.out), { recursive: true });
await writeFile(args.out, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 2);
