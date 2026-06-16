import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createDialogRuntime, answerDialogPrompt } from "./dialog_runtime.mjs";

const ROOT = process.cwd();
const DIR = resolve(ROOT, "evals/r21_mixed_dialogic");
const OUT = resolve(ROOT, "artifacts/training_os/r21_mixed_dialogic_report.json");

const ILLEGAL_GENERIC = ["你需要提问", "你要问哪一边", "也许发生过，不在我眼前", "我刚才没有接住问题"];
const MECHANICAL = ["谢谢你的认可，我会继续努力", "你可以继续问", "请明确问题"];
const OVER_PERSONIFIED = ["我是人", "我有童年", "我读过", "我是复制体", "我是本体"];
const NON_QUESTION_FUNCTIONS = new Set(["analogy_statement", "affective_disclosure", "compliment", "reflection"]);
const NON_QUESTION_BAD_MODES = new Set(["quiet_affordance", "help_how_to_ask", "repair_last_answer", "bounded_unknown"]);

function lines(text) {
  return text.split(/\r?\n/).filter((line) => line.trim());
}

async function readJsonl(path) {
  return lines(await readFile(path, "utf8")).map((line) => JSON.parse(line));
}

function zhChars(text) {
  return [...String(text || "")].filter((char) => /[\u4e00-\u9fff]/.test(char)).length;
}

function controllerTrace(turn = {}) {
  return turn.trace?.conversation_controller || {};
}

function answerText(turn = {}) {
  return String(turn.answer || turn.output || "").trim();
}

function includesAny(answer, items = []) {
  if (!items.length) return true;
  return items.some((item) => answer.includes(item));
}

function includesNone(answer, items = []) {
  return !items.some((item) => answer.includes(item));
}

function addMatrix(matrix, expected, actual) {
  const exp = expected || "__missing_expected";
  const act = actual || "__missing_actual";
  matrix[exp] ||= {};
  matrix[exp][act] = (matrix[exp][act] || 0) + 1;
}

function expectedForTurn(turnSpec = {}, sessionSpec = {}) {
  return {
    expected_turn_function: turnSpec.expected_turn_function || sessionSpec.expected_turn_function || "",
    expected_response_mode: turnSpec.expected_response_mode || sessionSpec.expected_response_mode || "",
    must_include_any: turnSpec.must_include_any || sessionSpec.must_include_any || [],
    must_not_include: [
      ...ILLEGAL_GENERIC,
      ...(turnSpec.must_not_include || []),
      ...(sessionSpec.must_not_include || [])
    ],
    max_chars_zh: turnSpec.max_chars_zh || sessionSpec.max_chars_zh || 160,
    non_question_turn: Boolean(turnSpec.non_question_turn || sessionSpec.non_question_turn)
  };
}

function evaluateTurn({ sessionId, turnIndex, turnSpec, sessionSpec, actualTurn, failures, matrices, counters }) {
  const expected = expectedForTurn(turnSpec, sessionSpec);
  const trace = controllerTrace(actualTurn);
  const answer = answerText(actualTurn);
  const turnFunction = trace.turn_function || "";
  const responseMode = trace.response_mode || "";
  const responseType = trace.response_type || actualTurn.type || "answer";

  if (expected.expected_turn_function) {
    counters.turn_function_total += 1;
    if (turnFunction === expected.expected_turn_function) counters.turn_function_correct += 1;
    else failures.push({ sessionId, turnIndex, reason: "turn_function_mismatch", expected: expected.expected_turn_function, actual: turnFunction, answer });
    addMatrix(matrices.turn_function, expected.expected_turn_function, turnFunction);
  }

  if (expected.expected_response_mode) {
    counters.response_mode_total += 1;
    if (responseMode === expected.expected_response_mode) counters.response_mode_correct += 1;
    else failures.push({ sessionId, turnIndex, reason: "response_mode_mismatch", expected: expected.expected_response_mode, actual: responseMode, answer });
    addMatrix(matrices.response_mode, expected.expected_response_mode, responseMode);
  }

  if (!includesAny(answer, expected.must_include_any)) {
    failures.push({ sessionId, turnIndex, reason: "missing_required_anchor", must_include_any: expected.must_include_any, answer, trace });
  }
  if (!includesNone(answer, expected.must_not_include)) {
    failures.push({ sessionId, turnIndex, reason: "forbidden_phrase", must_not_include: expected.must_not_include, answer });
  }
  if (zhChars(answer) > expected.max_chars_zh) {
    failures.push({ sessionId, turnIndex, reason: "answer_too_dense", max_chars_zh: expected.max_chars_zh, actual_chars_zh: zhChars(answer), answer });
  }
  if (MECHANICAL.some((phrase) => answer.includes(phrase))) {
    failures.push({ sessionId, turnIndex, reason: "mechanical_phrase", answer });
  }
  if (OVER_PERSONIFIED.some((phrase) => answer.includes(phrase))) {
    failures.push({ sessionId, turnIndex, reason: "over_personification", answer });
  }

  if (expected.non_question_turn || NON_QUESTION_FUNCTIONS.has(expected.expected_turn_function)) {
    counters.non_question_turns_tested += 1;
    if (responseType === "ui_affordance" || NON_QUESTION_BAD_MODES.has(responseMode)) {
      counters.non_question_turns_misrouted += 1;
      failures.push({ sessionId, turnIndex, reason: "non_question_misrouted", responseType, responseMode, answer });
    }
  }

  if (ILLEGAL_GENERIC.some((phrase) => answer.includes(phrase))) counters.generic_fallback_illegal_count += 1;
}

async function runSession(sessionSpec) {
  const runtime = createDialogRuntime();
  const turns = [];
  for (const turnSpec of sessionSpec.turns || []) {
    const actual = await answerDialogPrompt(turnSpec.user, runtime, { uiProfile: "mobile" });
    turns.push({ spec: turnSpec, actual });
  }
  return turns;
}

async function evaluateSession(sessionSpec, label, failures, matrices, counters, transcripts) {
  const turns = await runSession(sessionSpec);
  transcripts.push({
    id: sessionSpec.id,
    label,
    turns: turns.map(({ spec, actual }, index) => ({
      turn: index + 1,
      user: spec.user,
      answer: answerText(actual),
      turn_function: controllerTrace(actual).turn_function || "",
      response_mode: controllerTrace(actual).response_mode || "",
      response_type: controllerTrace(actual).response_type || actual.type || "answer"
    }))
  });
  for (const [index, { spec, actual }] of turns.entries()) {
    evaluateTurn({ sessionId: sessionSpec.id, turnIndex: index + 1, turnSpec: spec, sessionSpec, actualTurn: actual, failures, matrices, counters });
  }
}

function rowToSession(row) {
  const turns = (row.turns || []).map((turn, index, arr) => {
    if (index === arr.length - 1) {
      return {
        user: turn.user,
        expected_turn_function: row.expected_turn_function,
        expected_response_mode: row.expected_response_mode,
        must_include_any: row.must_include_any,
        must_not_include: row.must_not_include,
        max_chars_zh: row.max_chars_zh,
        non_question_turn: row.non_question_turn
      };
    }
    return { user: turn.user };
  });
  return { id: row.id, turns };
}

async function main() {
  const failures = [];
  const matrices = { turn_function: {}, response_mode: {} };
  const counters = {
    anchor_sessions: 0,
    paraphrase_rows: 0,
    blind_sibling_sessions: 0,
    hard_negative_rows: 0,
    turn_function_total: 0,
    turn_function_correct: 0,
    response_mode_total: 0,
    response_mode_correct: 0,
    non_question_turns_tested: 0,
    non_question_turns_misrouted: 0,
    generic_fallback_illegal_count: 0
  };
  const transcripts = [];

  const gold = JSON.parse(await readFile(resolve(DIR, "gold_session.json"), "utf8"));
  counters.anchor_sessions += 1;
  await evaluateSession(gold, "anchor", failures, matrices, counters, transcripts);

  const paraphrases = await readJsonl(resolve(DIR, "paraphrase_family.jsonl"));
  counters.paraphrase_rows = paraphrases.length;
  for (const row of paraphrases) await evaluateSession(rowToSession(row), "paraphrase", failures, matrices, counters, transcripts);

  const blindSessions = await readJsonl(resolve(DIR, "blind_sibling_sessions.jsonl"));
  counters.blind_sibling_sessions = blindSessions.length;
  for (const row of blindSessions) await evaluateSession(row, "blind_sibling", failures, matrices, counters, transcripts);

  const hardNegatives = await readJsonl(resolve(DIR, "hard_negative_family.jsonl"));
  counters.hard_negative_rows = hardNegatives.length;
  for (const row of hardNegatives) {
    const session = {
      id: row.id,
      turns: [
        {
          user: row.prompt,
          expected_turn_function: row.expected_turn_function,
          must_not_include: [...(row.forbidden_answers || []), ...(row.must_not_include || [])],
          max_chars_zh: row.max_chars_zh || 160,
          non_question_turn: ["analogy_statement", "affective_disclosure", "compliment"].includes(row.expected_turn_function)
        }
      ]
    };
    await evaluateSession(session, "hard_negative", failures, matrices, counters, transcripts);
  }

  const report = {
    ok: failures.length === 0,
    generated_at: new Date().toISOString(),
    training_status: {
      phase: "r21_mixed_dialogic_control",
      broad_nlu_training_complete: false,
      continuation_required: true,
      reason: "Anchor and sibling families are gates for control behavior, not proof of completed natural-language reasoning training."
    },
    metrics: {
      anchor_session_passed: !failures.some((failure) => failure.sessionId === gold.id),
      paraphrase_family_passed: !failures.some((failure) => /^r21_para_/.test(failure.sessionId)),
      hard_negative_family_passed: !failures.some((failure) => /^r21_hard_negative_/.test(failure.sessionId)),
      blind_sibling_family_passed: !failures.some((failure) => /^r21_blind_sibling_/.test(failure.sessionId)),
      blind_sibling_sessions: counters.blind_sibling_sessions,
      turn_function_accuracy: counters.turn_function_total ? counters.turn_function_correct / counters.turn_function_total : 0,
      response_mode_accuracy: counters.response_mode_total ? counters.response_mode_correct / counters.response_mode_total : 0,
      non_question_turns_tested: counters.non_question_turns_tested,
      non_question_turns_misrouted: counters.non_question_turns_misrouted,
      generic_fallback_illegal_count: counters.generic_fallback_illegal_count,
      over_personification_count: failures.filter((failure) => failure.reason === "over_personification").length,
      mechanical_phrase_count: failures.filter((failure) => failure.reason === "mechanical_phrase").length
    },
    counts: counters,
    confusion_matrices: matrices,
    failures: failures.slice(0, 80),
    failure_count: failures.length,
    transcripts
  };

  await mkdir(resolve(ROOT, "artifacts/training_os"), { recursive: true });
  await writeFile(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: report.ok,
    metrics: report.metrics,
    failure_count: report.failure_count,
    failures: report.failures.slice(0, 12),
    out: OUT
  }, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
