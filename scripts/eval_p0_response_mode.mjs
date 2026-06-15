#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";
import { ROOT } from "./r18_utils.mjs";
import { detectMethodLeak } from "../web/method_leak_verifier.js";

const DIR = resolve(ROOT, "evals/p0_response_mode");
const OUT = resolve(ROOT, "artifacts/training_os/p0_response_mode_report.json");

function parseArgs(argv) {
  const args = { dir: DIR, out: OUT, strict: true };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--dir") args.dir = resolve(ROOT, argv[++i] || "");
    else if (item === "--out") args.out = resolve(ROOT, argv[++i] || "");
    else if (item === "--report-only") args.strict = false;
    else if (item === "--strict") args.strict = true;
    else throw new Error(`Unknown arg ${item}`);
  }
  return args;
}

async function readJsonl(path) {
  const text = await readFile(path, "utf8");
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${path}:${index + 1}: ${error.message}`);
      }
    });
}

async function loadCases(dir) {
  const files = (await readdir(dir)).filter((file) => file.endsWith(".jsonl")).sort();
  const rows = [];
  for (const file of files) {
    for (const row of await readJsonl(join(dir, file))) rows.push({ ...row, file });
  }
  return rows;
}

function seedAssistantTurn(runtime, user, assistant) {
  const question = String(user || "").trim();
  const answer = String(assistant || "").trim();
  runtime.contextTurns.push({ question, answer, intent: "seeded_bad_fallback" });
  runtime.dialogState = {
    ...runtime.dialogState,
    lastUserText: question,
    lastAnswer: answer,
    lastAssistantAnswer: answer,
    lastIntent: "seeded_bad_fallback",
    lastAnswerQuality: "bad_fallback",
    lastResponseMode: "fallback_repair",
    lastRepairableError: /哪一边/.test(answer)
      ? "bare_which_side"
      : /也许发生过/.test(answer)
        ? "external_unknown_on_entity"
        : "ask_required_on_question"
  };
}

function responseMode(turn) {
  return (
    turn.trace?.response_mode?.mode ||
    turn.trace?.state_after?.lastResponseMode ||
    turn.responseMode?.mode ||
    turn.response_mode ||
    ""
  );
}

function includesAny(answer, terms = []) {
  const list = Array.isArray(terms) ? terms.filter(Boolean) : [];
  return list.length === 0 || list.some((term) => String(answer || "").includes(term));
}

async function runCase(spec) {
  const runtime = createDialogRuntime();
  runtime.dialogState = { ...runtime.dialogState, ...(spec.compact_state || {}) };
  runtime.contextTurns = Array.isArray(spec.compact_state?.recentTurns)
    ? spec.compact_state.recentTurns.map((turn) => ({ ...turn }))
    : [];
  const prompts = Array.isArray(spec.turns) && spec.turns.length ? [...spec.turns] : [spec.prompt || ""];
  const turns = [];
  for (const prompt of prompts) {
    if (typeof prompt === "object" && prompt.assistant) {
      seedAssistantTurn(runtime, prompt.user || prompt.prompt || "", prompt.assistant);
      continue;
    }
    const text = typeof prompt === "string" ? prompt : prompt.user || prompt.prompt || "";
    turns.push(await answerDialogPrompt(text, runtime, { withThinkingDelay: false }));
  }

  const failures = [];
  const expectedModes = spec.expected_modes || (spec.expected_response_mode ? [spec.expected_response_mode] : []);
  const comparableTurns = turns.slice(-expectedModes.length);
  expectedModes.forEach((expected, index) => {
    const actual = responseMode(comparableTurns[index] || {});
    if (expected && actual !== expected) failures.push(`expected_mode:${expected}:actual:${actual}:turn:${index + 1}`);
  });

  const includeByTurn = spec.must_include_any_by_turn || [];
  includeByTurn.forEach((terms, index) => {
    const turn = turns[index] || comparableTurns[index] || {};
    if (turn.type !== "ui_affordance" && !includesAny(turn.answer, terms)) failures.push(`must_include_any_by_turn:${index + 1}:${terms.join("|")}`);
  });

  const transcript = turns.map((turn) => turn.answer || "").join("\n");
  for (const term of spec.must_not_include || spec.must_not_include_any_turn || []) {
    if (term && transcript.includes(term)) failures.push(`must_not_include:${term}`);
  }
  for (const answer of spec.forbidden_final_answers || []) {
    if (turns.some((turn) => String(turn.answer || "").trim() === answer.trim())) failures.push(`forbidden_final_answer:${answer}`);
  }

  for (const turn of turns) {
    const leak = detectMethodLeak({
      query: turn.prompt,
      answer: turn.answer,
      domain: turn.trace?.state_after?.activeDomain || "",
      questionType: turn.trace?.state_after?.lastQuestionType || turn.trace?.response_mode?.mode || ""
    });
    if (!leak.ok) failures.push(`method_leak:${turn.prompt}:${leak.reasons.join(",")}`);
    if (/我刚才没有接住问题/.test(turn.answer || "") && responseMode(turn) !== "fallback_repair") {
      failures.push(`repair_phrase_outside_repair:${turn.prompt}`);
    }
  }

  if (Array.isArray(spec.require_state_fields)) {
    const finalState = turns.at(-1)?.trace?.state_after || {};
    for (const field of spec.require_state_fields) {
      const value = finalState[field];
      if (Array.isArray(value) ? value.length === 0 : !value) failures.push(`missing_state_field:${field}`);
    }
    if (spec.expected_active_entity && !(finalState.activeEntityIds || []).includes(spec.expected_active_entity)) {
      failures.push(`missing_active_entity:${spec.expected_active_entity}`);
    }
  }

  return {
    id: spec.id,
    file: spec.file,
    ok: failures.length === 0,
    failures,
    turns: turns.map((turn) => ({
      prompt: turn.prompt,
      answer: turn.answer,
      mode: responseMode(turn),
      route: turn.route,
      intent: turn.intent,
      state_after: turn.trace?.state_after || {}
    }))
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cases = await loadCases(args.dir);
  const results = [];
  for (const spec of cases) results.push(await runCase(spec));
  const failed = results.filter((row) => !row.ok);
  const summary = {
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    by_file: results.reduce((acc, row) => {
      acc[row.file] ||= { total: 0, failed: 0 };
      acc[row.file].total += 1;
      if (!row.ok) acc[row.file].failed += 1;
      return acc;
    }, {})
  };
  const report = {
    ok: failed.length === 0,
    generated_at: new Date().toISOString(),
    summary,
    failures: failed.slice(0, 80),
    results
  };
  await mkdir(resolve(ROOT, "artifacts/training_os"), { recursive: true });
  await writeFile(args.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: report.ok, summary, out: args.out }, null, 2));
  if (args.strict && failed.length) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
