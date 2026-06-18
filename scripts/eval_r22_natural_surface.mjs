#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createDialogRuntime, answerDialogPrompt } from "./dialog_runtime.mjs";
import { ROOT } from "./r18_utils.mjs";
import { classifySurfaceHits, makeExecutionReport, zhChars } from "./r22_surface_utils.mjs";

const DIR = resolve(ROOT, "evals/r22_natural_surface");
const OUT = resolve(ROOT, "artifacts/training_os/r22_natural_surface_eval_report.json");
const STRICT = process.argv.includes("--strict");
const BASELINE_ARG = process.argv.find((arg) => arg.startsWith("--baseline="));
const BASELINE = BASELINE_ARG ? BASELINE_ARG.slice("--baseline=".length) : "424e4b7cbe41fb8439fe38a2a75d43abfe3c862b";

function gitHead() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function jsonl(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

async function loadRows(file) {
  return jsonl(await readFile(resolve(DIR, file), "utf8"));
}

function cc(turn = {}) {
  return turn.trace?.conversation_controller || {};
}

function answer(turn = {}) {
  return String(turn.answer || turn.output || "").trim();
}

function shadowCandidate(turn = {}) {
  return String(turn.trace?.conversation_controller?.surface_candidate?.candidate_answer || "").trim();
}

async function runContext(context = []) {
  const runtime = createDialogRuntime();
  for (const setup of context) await answerDialogPrompt(setup.user, runtime, { uiProfile: "mobile", withThinkingDelay: false });
  return runtime;
}

function checkForbiddenPatterns(text, forbidden = []) {
  return forbidden.filter((pattern) => {
    try {
      return new RegExp(pattern).test(text);
    } catch {
      return text.includes(pattern);
    }
  });
}

function evaluateSurfaceCase({ row, actual, failures }) {
  const trace = cc(actual);
  const text = answer(actual);
  if (row.turn_function && trace.turn_function !== row.turn_function) {
    failures.push({ id: row.id, reason: "turn_function_mismatch", expected: row.turn_function, actual: trace.turn_function, answer: text });
  }
  if (row.expected_surface_mode && trace.surface_mode !== row.expected_surface_mode) {
    failures.push({ id: row.id, reason: "surface_mode_mismatch", expected: row.expected_surface_mode, actual: trace.surface_mode, answer: text });
  }
  if (row.reasoning_budget && trace.reasoning_budget !== row.reasoning_budget) {
    failures.push({ id: row.id, reason: "reasoning_budget_mismatch", expected: row.reasoning_budget, actual: trace.reasoning_budget, answer: text });
  }
  const forbidden = checkForbiddenPatterns(text, row.forbidden_surface_patterns || []);
  if (forbidden.length) failures.push({ id: row.id, reason: "forbidden_surface_pattern", forbidden, answer: text });
  const highRisk = classifySurfaceHits(text).filter((hit) => ["you_can_continue_ask", "generic_thanks", "continue_effort"].includes(hit.id));
  if (highRisk.length) failures.push({ id: row.id, reason: "high_risk_surface_pattern", hits: highRisk, answer: text });
  if (row.turn_function && ["analogy_statement", "affective_disclosure", "compliment"].includes(row.turn_function)) {
    if (trace.response_type === "ui_affordance" || ["help_how_to_ask", "quiet_affordance", "bounded_unknown"].includes(trace.response_mode)) {
      failures.push({ id: row.id, reason: "meaningful_non_question_misrouted", trace, answer: text });
    }
  }
  if (row.reasoning_budget === "none" && zhChars(text) > 90) failures.push({ id: row.id, reason: "none_budget_answer_too_long", chars: zhChars(text), answer: text });
}

function evaluateCandidateCase({ row, actual, failures }) {
  const fallbackRows = [];
  const trace = cc(actual);
  const candidate = trace.surface_candidate || {};
  const text = shadowCandidate(actual);
  if (!text) return { fallbackRows };
  if (candidate.fallback_to_current_reason) {
    fallbackRows.push({
      id: row.id,
      reason: "shadow_candidate_not_attempted",
      fallback_reason: candidate.fallback_to_current_reason,
      candidate_answer: text
    });
    return { fallbackRows };
  }
  const forbidden = checkForbiddenPatterns(text, row.forbidden_surface_patterns || []);
  if (forbidden.length) failures.push({ id: row.id, reason: "shadow_forbidden_surface_pattern", forbidden, candidate_answer: text });
  const hits = classifySurfaceHits(text).filter((hit) => ["you_can_continue_ask", "generic_thanks", "continue_effort", "i_caught_it"].includes(hit.id));
  if (hits.length) failures.push({ id: row.id, reason: "shadow_high_risk_surface_pattern", hits, candidate_answer: text });
  return { fallbackRows };
}

async function evaluateNonQuestionRows(failures, transcripts) {
  const candidateFailures = [];
  const candidateFallbacks = [];
  const rows = await loadRows("non_question_turns.jsonl");
  for (const row of rows) {
    const runtime = await runContext(row.context || []);
    const actual = await answerDialogPrompt(row.user, runtime, { uiProfile: "mobile", withThinkingDelay: false });
    evaluateSurfaceCase({ row, actual, failures });
    const candidateResult = evaluateCandidateCase({ row, actual, failures: candidateFailures });
    candidateFallbacks.push(...(candidateResult?.fallbackRows || []));
    transcripts.push({
      id: row.id,
      user: row.user,
      answer: answer(actual),
      shadow_candidate_answer: shadowCandidate(actual),
      shadow_candidate: cc(actual).surface_candidate || null,
      trace: cc(actual)
    });
  }
  return { rows: rows.length, candidateFailures, candidateFallbacks };
}

async function evaluateSessions(failures, transcripts) {
  const candidateFailures = [];
  const candidateFallbacks = [];
  const rows = await loadRows("session_rhythm_cases.jsonl");
  for (const row of rows) {
    const runtime = createDialogRuntime();
    const seenSkeletons = new Map();
    for (const [index, turn] of row.turns.entries()) {
      const actual = await answerDialogPrompt(turn.user, runtime, { uiProfile: "mobile", withThinkingDelay: false });
      const text = answer(actual);
      const trace = cc(actual);
      const skeleton = text.replace(/[《“"][^》”"]+[》”"]/g, "《X》").replace(/[\u4e00-\u9fff]{8,}/g, "X");
      seenSkeletons.set(skeleton, (seenSkeletons.get(skeleton) || 0) + 1);
      if (turn.turn_function || turn.expected_surface_mode || turn.reasoning_budget) {
        evaluateSurfaceCase({ row: { ...turn, id: `${row.id}#${index + 1}` }, actual, failures });
        const candidateResult = evaluateCandidateCase({ row: { ...turn, id: `${row.id}#${index + 1}` }, actual, failures: candidateFailures });
        candidateFallbacks.push(...(candidateResult?.fallbackRows || []));
      }
      const forbidden = checkForbiddenPatterns(text, row.forbidden_surface_patterns || []);
      if (forbidden.length) failures.push({ id: row.id, turn: index + 1, reason: "session_forbidden_surface_pattern", forbidden, answer: text });
      transcripts.push({
        id: row.id,
        turn: index + 1,
        user: turn.user,
        answer: text,
        shadow_candidate_answer: shadowCandidate(actual),
        shadow_candidate: trace.surface_candidate || null,
        trace
      });
    }
    for (const [surface_skeleton, count] of seenSkeletons.entries()) {
      if (count >= 3) failures.push({ id: row.id, reason: "same_surface_skeleton_streak", surface_skeleton, count });
    }
  }
  return { rows: rows.length, candidateFailures, candidateFallbacks };
}

async function evaluateBadBetterPairs(failures) {
  const rows = await loadRows("bad_better_pairs.jsonl");
  for (const row of rows) {
    const badHits = classifySurfaceHits(row.bad_answer || "");
    const betterHits = classifySurfaceHits(row.better_answer_shape || "");
    if (!badHits.length) failures.push({ id: row.id, reason: "bad_answer_not_detected_by_surface_patterns" });
    const forbiddenBetter = betterHits.filter((hit) => (row.forbidden_surface_patterns || []).some((pattern) => hit.matches.some((match) => match.includes(pattern))));
    if (forbiddenBetter.length) failures.push({ id: row.id, reason: "better_shape_contains_forbidden_pattern", hits: forbiddenBetter });
  }
  return rows.length;
}

async function main() {
  const failures = [];
  const transcripts = [];
  const nonQuestion = await evaluateNonQuestionRows(failures, transcripts);
  const session = await evaluateSessions(failures, transcripts);
  const pairRows = await evaluateBadBetterPairs(failures);
  const proxyRows = await loadRows("proxy_leakage_cases.jsonl");
  const candidateFailures = [...nonQuestion.candidateFailures, ...session.candidateFailures];
  const candidateFallbacks = [...(nonQuestion.candidateFallbacks || []), ...(session.candidateFallbacks || [])];
  const report = makeExecutionReport({
    behaviorOk: failures.length === 0,
    auditOnly: !STRICT,
    blocking: STRICT && failures.length > 0,
    baselineCommit: BASELINE,
    evaluatedCommit: gitHead(),
    extra: {
    rows: {
      non_question_turns: nonQuestion.rows,
      session_rhythm_cases: session.rows,
      bad_better_pairs: pairRows,
      proxy_leakage_cases: proxyRows.length
    },
    failure_count: failures.length,
    current_runtime_failures: failures.slice(0, 80),
    candidate_failure_count: candidateFailures.length,
    candidate_runtime_failures: candidateFailures.slice(0, 80),
    candidate_fallback_count: candidateFallbacks.length,
    candidate_fallbacks: candidateFallbacks.slice(0, 80),
    failures: failures.slice(0, 80),
    transcripts
    }
  });
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    execution_ok: report.execution_ok,
    behavior_ok: report.behavior_ok,
    audit_only: report.audit_only,
    blocking: report.blocking,
    rows: report.rows,
    failure_count: report.failure_count,
    candidate_failure_count: report.candidate_failure_count,
    failures: report.failures.slice(0, 12),
    out: OUT
  }, null, 2));
  if (!report.behavior_ok && STRICT) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
