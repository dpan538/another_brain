#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyDraft } from "../web/draft_verifier.js";
import {
  solveChineseArithmetic,
  solveSetQuantifierFromText,
  solveSyllogismFromText,
  solveTransitiveComparisonFromText,
  solveWeekdayOffset
} from "../web/micro_solvers.js";
import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_DIR = resolve(ROOT, "evals/r11_reasoning");
const DEFAULT_OUT = resolve(ROOT, "artifacts/training_os/r11_reasoning_report.json");

const GENERIC_FALLBACK_RE = /(你需要提问|你应该去问百度|也许发生过，不在我眼前)/;
const COUNTERQUESTION_RE = /^(你要|要不|还是|哪一边|你是想|你想).*[？?]$/;

function parseArgs(argv) {
  const args = { casesDir: DEFAULT_DIR, out: DEFAULT_OUT, strict: true };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--cases-dir") args.casesDir = resolve(ROOT, argv[++i] || "");
    else if (item === "--out") args.out = resolve(ROOT, argv[++i] || "");
    else if (item === "--report-only") args.strict = false;
    else if (item === "--strict") args.strict = true;
    else throw new Error(`Unknown argument: ${item}`);
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

async function loadCases(dir) {
  const files = (await readdir(dir)).filter((name) => name.endsWith(".jsonl")).sort();
  const cases = [];
  for (const file of files) {
    for (const item of await loadJsonl(join(dir, file))) cases.push({ ...item, file });
  }
  return { files, cases };
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalize(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function seedRuntime(compactState = {}) {
  const runtime = createDialogRuntime();
  runtime.dialogState = { ...runtime.dialogState, ...compactState };
  runtime.contextTurns = safeArray(compactState.recentTurns).map((turn) => ({ ...turn }));
  return runtime;
}

function routeLabels(turn) {
  return new Set([turn.route || "", turn.intent || "", turn.trace?.answer_source || "", turn.trace?.context_action || ""].filter(Boolean));
}

function solverFor(name, prompt) {
  if (!name) return null;
  if (name === "arithmetic") return solveChineseArithmetic(prompt);
  if (name === "weekday_offset") return solveWeekdayOffset(prompt);
  if (name === "transitive_comparison") return solveTransitiveComparisonFromText(prompt);
  if (name === "syllogism") return solveSyllogismFromText(prompt);
  if (name === "set_quantifier") return solveSetQuantifierFromText(prompt);
  return null;
}

function checkExpectedSolverResult(expected = {}, solverResult) {
  const failures = [];
  if (!Object.keys(expected || {}).length) return failures;
  if (!solverResult) return ["expected_solver_result: solver not run"];
  for (const [key, value] of Object.entries(expected)) {
    if (solverResult[key] !== value) failures.push(`expected_solver_result.${key}: expected ${JSON.stringify(value)} got ${JSON.stringify(solverResult[key])}`);
  }
  return failures;
}

function checkCase(spec, turn, solverResult) {
  const answer = normalize(turn.answer);
  const raw = normalize(turn.trace?.raw_answer || turn.answer);
  const text = `${answer}\n${raw}`;
  const failures = [];

  const must = safeArray(spec.must_include_any);
  if (must.length && !must.some((term) => term && answer.includes(term))) failures.push(`must_include_any: none of ${must.join(" | ")}`);
  for (const term of safeArray(spec.must_not_include)) {
    if (term && text.includes(term)) failures.push(`must_not_include: ${term}`);
  }
  const labels = routeLabels(turn);
  for (const forbidden of safeArray(spec.must_not_route)) {
    if (labels.has(forbidden)) failures.push(`must_not_route: ${forbidden}`);
  }
  for (const bad of safeArray(spec.unacceptable_answers)) {
    if (bad && (normalize(bad) === answer || normalize(bad) === raw)) failures.push(`unacceptable_answer: ${bad}`);
  }
  if (GENERIC_FALLBACK_RE.test(text)) failures.push("generic_fallback");
  if (COUNTERQUESTION_RE.test(answer)) failures.push("unnecessary_counterquestion");
  failures.push(...checkExpectedSolverResult(spec.expected_solver_result || {}, solverResult));

  if (spec.candidate_answer) {
    const candidateVerdict = verifyDraft({
      query: spec.prompt,
      draft: spec.candidate_answer,
      solverResult,
      source: spec.expected_solver || spec.expected_task_type || "",
      trace: {
        task_type: spec.expected_task_type || "",
        question_type: spec.expected_question_type || "",
        operation: spec.expected_operation || ""
      }
    });
    if (spec.expected_answer_policy === "verifier_reject" && candidateVerdict.ok) {
      failures.push("verifier_rejection: candidate was accepted");
    }
    if (spec.expected_answer_policy === "verifier_accept" && !candidateVerdict.ok) {
      failures.push(`verifier_acceptance: candidate rejected (${candidateVerdict.reject_reason})`);
    }
  }
  return failures;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { files, cases } = await loadCases(args.casesDir);
  const results = [];
  const repeated = new Map();

  for (const spec of cases) {
    const runtime = seedRuntime(spec.compact_state || {});
    const turn = await answerDialogPrompt(spec.prompt, runtime, { withThinkingDelay: false });
    const solverResult = solverFor(spec.expected_solver, spec.prompt);
    const failures = checkCase(spec, turn, solverResult);
    const answer = normalize(turn.answer);
    if (answer && !spec.expected_solver && spec.file !== "verifier_rejection.jsonl") {
      if (!repeated.has(answer)) repeated.set(answer, []);
      repeated.get(answer).push(spec.id || spec.prompt);
    }
    results.push({
      id: spec.id || "",
      file: spec.file,
      prompt: spec.prompt,
      answer: turn.answer,
      route: turn.route,
      intent: turn.intent,
      expected_task_type: spec.expected_task_type || "",
      expected_question_type: spec.expected_question_type || "",
      expected_operation: spec.expected_operation || "",
      expected_solver: spec.expected_solver || "",
      solver_result: solverResult || null,
      failures,
      ok: failures.length === 0,
      notes: spec.notes || ""
    });
  }

  const templateGroups = [...repeated.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([answer, ids]) => ({ answer, ids, count: ids.length }));
  for (const group of templateGroups) {
    for (const id of group.ids) {
      const result = results.find((item) => (item.id || item.prompt) === id);
      if (result) {
        result.failures.push(`repeated_template: same answer reused across ${group.count} non-solver cases`);
        result.ok = false;
      }
    }
  }

  const failed = results.filter((item) => !item.ok);
  const summary = {
    total_files: files.length,
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    solver_cases: results.filter((item) => item.expected_solver).length,
    verifier_candidate_cases: results.filter((item) => cases.find((spec) => spec.id === item.id)?.candidate_answer).length,
    template_collapse_groups: templateGroups,
    generic_fallback_count: results.filter((item) => /generic_fallback/.test(item.failures.join(" "))).length,
    unnecessary_counterquestion_count: results.filter((item) => /unnecessary_counterquestion/.test(item.failures.join(" "))).length
  };
  const report = { ok: failed.length === 0, mode: args.strict ? "strict" : "report-only", generated_at: new Date().toISOString(), summary, results };
  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ok: report.ok, mode: report.mode, summary, out: args.out }, null, 2));
  if (args.strict && failed.length > 0) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
