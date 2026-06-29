#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { answerDialogPrompt, createDialogRuntime } from "../dialog_runtime.mjs";
import { ROOT } from "../r18_utils.mjs";
import { normalizeSurfaceSkeleton } from "../../web/controlled_surface_variation.js";

const MATRIX_PATH = resolve(ROOT, "artifacts/surface_variation/phase2_diagnostic_matrix.json");
const OUT = resolve(ROOT, "artifacts/surface_variation/variation_matrix_report.json");
const REPETITION_OUT = resolve(ROOT, "artifacts/surface_variation/repetition_analysis.json");
const EXAMPLES_OUT = resolve(ROOT, "artifacts/surface_variation/current_vs_varied_examples.json");
const SEPARATE_SESSION_COUNT = 5;
const SAME_SESSION_REPETITIONS = 3;

const FORBIDDEN_RE =
  /(这个音乐对象|这个电影对象|华语流行里的入口|电影叙事里的入口|先看|重点在于|换个说法|我明白。这里先|本地知识卡|当前会话|runtime|schema|pack|\brural\b|\burban\b|\bmandopop\b)/i;

function clean(value) {
  return String(value || "").trim();
}

function selectedIds(turn = {}) {
  return turn.trace?.conversation_controller?.binding?.target_ids || turn.trace?.state_after?.activeEntityIds || [];
}

function operation(turn = {}) {
  return turn.trace?.conversation_controller?.operation || turn.trace?.context_action || "";
}

function expectedOperationMatches(actual = "", expected = "") {
  if (!expected) return true;
  if (actual === expected) return true;
  if (expected === "open_domain_topic" && /open|culture|ANSWER_CULTURE|ANSWER_WITH_UNCERTAINTY/.test(actual)) return true;
  if (expected === "define_concept" && /define|explain|ANSWER_CULTURE|culture|ANSWER_WITH_UNCERTAINTY/.test(actual)) return true;
  if (expected === "identify_entity" && /identify|explain|ANSWER_CULTURE|culture/.test(actual)) return true;
  if (expected === "simple_comparison" && /compare|comparison|culture_compare/.test(actual)) return true;
  return false;
}

function hardFailures(turn, testCase) {
  const failures = [];
  const ids = selectedIds(turn);
  const expectedIds = testCase.expected_entity_ids || [];
  if (expectedIds.length && !expectedIds.some((id) => ids.includes(id))) failures.push("entity_drift");
  if (!expectedOperationMatches(operation(turn), testCase.expected_operation)) failures.push("operation_drift");
  if (!clean(turn.answer)) failures.push("empty_answer");
  if (FORBIDDEN_RE.test(turn.answer || "")) failures.push("implementation_or_profile_leakage");
  const variation = turn.trace?.conversation_controller?.surface_variation || {};
  if (variation.semantic_verifier_result?.ok === false) failures.push("semantic_verifier_failure");
  return [...new Set(failures)];
}

function duplicateStats(answers = []) {
  const exact = new Set(answers.map(clean));
  const skeletons = new Set(answers.map(normalizeSurfaceSkeleton));
  return {
    answer_count: answers.length,
    unique_exact: exact.size,
    unique_skeletons: skeletons.size,
    exact_duplicate: exact.size < answers.length,
    skeleton_duplicate: skeletons.size < answers.length
  };
}

async function runSeparateSessions(testCase) {
  const turns = [];
  for (let index = 0; index < SEPARATE_SESSION_COUNT; index += 1) {
    const runtime = createDialogRuntime();
    runtime.dialogState.surface_session_id = `diagnostic-${index}-${encodeURIComponent(testCase.prompt).slice(0, 32)}`;
    turns.push(await answerDialogPrompt(testCase.prompt, runtime, { withThinkingDelay: false, uiProfile: "mobile" }));
  }
  return turns;
}

async function runSameSession(testCase) {
  const runtime = createDialogRuntime();
  runtime.dialogState.surface_session_id = `diagnostic-repeat-${encodeURIComponent(testCase.prompt).slice(0, 32)}`;
  const turns = [];
  for (let index = 0; index < SAME_SESSION_REPETITIONS; index += 1) {
    turns.push(await answerDialogPrompt(testCase.prompt, runtime, { withThinkingDelay: false, uiProfile: "mobile" }));
  }
  return turns;
}

async function main() {
  const matrix = JSON.parse(await readFile(MATRIX_PATH, "utf8"));
  const results = [];
  for (const [index, testCase] of matrix.cases.entries()) {
    if (index === 0 || index % 50 === 0) console.error(`[variation-runtime] ${index}/${matrix.cases.length}`);
    const separate = await runSeparateSessions(testCase);
    const sameSession = await runSameSession(testCase);
    const allTurns = [...separate, ...sameSession];
    const allAnswers = allTurns.map((turn) => turn.answer || "");
    const failures = allTurns.flatMap((turn, turnIndex) => hardFailures(turn, testCase).map((failure) => ({ turnIndex, failure })));
    const candidateCounts = allTurns.map((turn) => turn.trace?.conversation_controller?.surface_variation?.candidate_count || 0);
    results.push({
      prompt: testCase.prompt,
      group: testCase.group,
      bucket: testCase.bucket || "",
      expected_entity_ids: testCase.expected_entity_ids || [],
      expected_operation: testCase.expected_operation || "",
      separate_sessions: separate.map((turn) => ({
        answer: turn.answer,
        entity_ids: selectedIds(turn),
        operation: operation(turn),
        skeleton: normalizeSurfaceSkeleton(turn.answer),
        variation: turn.trace?.conversation_controller?.surface_variation || {}
      })),
      same_session_repetitions: sameSession.map((turn) => ({
        answer: turn.answer,
        entity_ids: selectedIds(turn),
        operation: operation(turn),
        skeleton: normalizeSurfaceSkeleton(turn.answer),
        variation: turn.trace?.conversation_controller?.surface_variation || {}
      })),
      stats: {
        separate: duplicateStats(separate.map((turn) => turn.answer || "")),
        same_session: duplicateStats(sameSession.map((turn) => turn.answer || "")),
        candidate_count_max: Math.max(...candidateCounts),
        candidate_count_min: Math.min(...candidateCounts)
      },
      hard_failures: failures
    });
  }
  console.error(`[variation-runtime] ${matrix.cases.length}/${matrix.cases.length}`);
  const totalTurns = results.length * (SEPARATE_SESSION_COUNT + SAME_SESSION_REPETITIONS);
  const exactDuplicateRows = results.filter((row) => row.stats.same_session.exact_duplicate).length;
  const skeletonDuplicateRows = results.filter((row) => row.stats.same_session.skeleton_duplicate).length;
  const eligibleRows = results.filter((row) => row.stats.candidate_count_max > 1);
  const summary = {
    total_prompts: results.length,
    total_turns: totalTurns,
    eligible_prompts: eligibleRows.length,
    hard_failure_count: results.reduce((sum, row) => sum + row.hard_failures.length, 0),
    prompts_with_exact_repeat_same_session: exactDuplicateRows,
    prompts_with_skeleton_repeat_same_session: skeletonDuplicateRows,
    exact_repeated_answer_rate_same_session: Number((exactDuplicateRows / Math.max(1, results.length)).toFixed(4)),
    skeleton_repeated_answer_rate_same_session: Number((skeletonDuplicateRows / Math.max(1, results.length)).toFixed(4)),
    prompts_with_multiple_exact_variants: results.filter((row) => row.stats.same_session.unique_exact > 1 || row.stats.separate.unique_exact > 1).length,
    prompts_with_multiple_skeleton_variants: results.filter((row) => row.stats.same_session.unique_skeletons > 1 || row.stats.separate.unique_skeletons > 1).length
  };
  const report = {
    generated_at: new Date().toISOString(),
    matrix_seed: matrix.seed,
    separate_session_count: SEPARATE_SESSION_COUNT,
    same_session_repetitions: SAME_SESSION_REPETITIONS,
    summary,
    results
  };
  const repetition = {
    generated_at: report.generated_at,
    summary,
    repeated_clusters: results
      .filter((row) => row.stats.same_session.exact_duplicate || row.stats.same_session.skeleton_duplicate)
      .map((row) => ({
        prompt: row.prompt,
        exact_duplicate: row.stats.same_session.exact_duplicate,
        skeleton_duplicate: row.stats.same_session.skeleton_duplicate,
        answers: row.same_session_repetitions.map((item) => item.answer),
        skeletons: row.same_session_repetitions.map((item) => item.skeleton)
      }))
  };
  const examples = {
    generated_at: report.generated_at,
    examples: results
      .filter((row) => row.stats.same_session.unique_exact > 1 || row.stats.separate.unique_exact > 1)
      .slice(0, 80)
      .map((row) => ({
        prompt: row.prompt,
        answers: [...new Set([...row.separate_sessions, ...row.same_session_repetitions].map((item) => item.answer))].slice(0, 5)
      }))
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(REPETITION_OUT, `${JSON.stringify(repetition, null, 2)}\n`, "utf8");
  await writeFile(EXAMPLES_OUT, `${JSON.stringify(examples, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ out: OUT, repetition: REPETITION_OUT, examples: EXAMPLES_OUT, summary }, null, 2));
  if (summary.hard_failure_count) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
