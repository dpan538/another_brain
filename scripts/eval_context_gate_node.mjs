#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createDialogState,
  detectIntent,
  directAnswerForIntent,
  fallbackForIntent,
  nextDialogState
} from "../web/dialog_rules.js?v=context-gate";
import { sanitizeSurfaceIdentity } from "../web/surface_identity.js?v=context-gate";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CASES = resolve(ROOT, "web/context_gate_cases.json");
const DEFAULT_OUT = resolve(ROOT, "artifacts/training_os/context_gate_report.json");

function parseArgs(argv) {
  const args = { cases: DEFAULT_CASES, out: DEFAULT_OUT };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--cases") args.cases = resolve(ROOT, argv[++index]);
    else if (item === "--out") args.out = resolve(ROOT, argv[++index]);
    else if (item === "--help") {
      console.log("Usage: node scripts/eval_context_gate_node.mjs [--cases path] [--out path]");
      process.exit(0);
    }
  }
  return args;
}

function answerPrompt(prompt, state) {
  const intent = detectIntent(prompt, state);
  const direct = directAnswerForIntent(intent, prompt, state);
  const answer = sanitizeSurfaceIdentity(direct || fallbackForIntent(intent, prompt), prompt);
  return { intent, answer };
}

function validateTurn(turn, actual) {
  const failures = [];
  if (turn.expected !== undefined && actual.answer !== turn.expected) {
    failures.push({ check: "expected", expected: turn.expected, actual: actual.answer });
  }
  if (turn.expected_intent !== undefined && actual.intent !== turn.expected_intent) {
    failures.push({ check: "expected_intent", expected: turn.expected_intent, actual: actual.intent });
  }
  if (Array.isArray(turn.must_include_any) && !turn.must_include_any.some((term) => actual.answer.includes(term))) {
    failures.push({ check: "must_include_any", expected: turn.must_include_any, actual: actual.answer });
  }
  for (const term of turn.must_not_include || []) {
    if (actual.answer.includes(term)) failures.push({ check: "must_not_include", pattern: term, actual: actual.answer });
  }
  return failures;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const suite = JSON.parse(await readFile(args.cases, "utf8"));
  const failures = [];
  const caseResults = [];
  let totalTurns = 0;
  let passedTurns = 0;

  for (const caseSpec of suite.cases || []) {
    let state = createDialogState();
    const turns = [];
    for (const [turnIndex, turn] of (caseSpec.turns || []).entries()) {
      totalTurns += 1;
      const actual = answerPrompt(turn.prompt, state);
      const turnFailures = validateTurn(turn, actual);
      if (!turnFailures.length) passedTurns += 1;
      else failures.push({ caseId: caseSpec.id, turn: turnIndex + 1, prompt: turn.prompt, failures: turnFailures });
      turns.push({ ...turn, ...actual, ok: turnFailures.length === 0 });
      state = nextDialogState(turn.prompt, actual.answer, actual.intent, state);
    }
    caseResults.push({ id: caseSpec.id, ok: turns.every((turn) => turn.ok), turns });
  }

  const report = {
    ok: failures.length === 0,
    summary: {
      totalCases: (suite.cases || []).length,
      totalTurns,
      passedTurns,
      failedTurns: totalTurns - passedTurns,
      accuracy: totalTurns ? passedTurns / totalTurns : 0
    },
    failures,
    cases: caseResults
  };

  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ok: report.ok, summary: report.summary, failures: report.failures }, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

