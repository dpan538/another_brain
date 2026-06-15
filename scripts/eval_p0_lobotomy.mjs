#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";
import { ROOT } from "./r18_utils.mjs";
import {
  bareFallbackId,
  classifyFallbackShape,
  mentionsGenericFallback
} from "../web/generic_fallback_classifier.js?v=1";

const DIR = resolve(ROOT, "evals/p0_lobotomy");
const OUT = resolve(ROOT, "artifacts/training_os/p0_lobotomy_report.json");
const BAD_FALLBACK_RE = /(你需要提问。?|你要问哪一边？?|也许发生过，不在我眼前。?)/;

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

function seedRuntime(compactState = {}) {
  const runtime = createDialogRuntime();
  runtime.dialogState = { ...runtime.dialogState, ...compactState };
  runtime.contextTurns = Array.isArray(compactState.recentTurns) ? compactState.recentTurns.map((turn) => ({ ...turn })) : [];
  return runtime;
}

function includesAny(answer, terms) {
  const list = Array.isArray(terms) ? terms.filter(Boolean) : [];
  return list.length === 0 || list.some((term) => answer.includes(term));
}

function seedAssistantTurn(runtime, user, assistant) {
  const question = String(user || "").trim();
  const answer = String(assistant || "").trim();
  if (!question && !answer) return;
  runtime.contextTurns.push({ question, answer, intent: "seeded_bad_fallback" });
  runtime.dialogState = {
    ...runtime.dialogState,
    lastUserText: question,
    lastAnswer: answer,
    lastIntent: "seeded_bad_fallback"
  };
}

function checkFallbackFields({ spec, turns, answer, answerText }) {
  const failures = [];
  const seededLastAssistant = Array.isArray(spec.turns)
    ? [...spec.turns].reverse().find((turn) => typeof turn === "object" && turn.assistant)?.assistant || ""
    : "";
  const finalBareId = bareFallbackId(answer);
  const finalShape = classifyFallbackShape({
    answer,
    questionType: spec.expected_question_type || "",
    operation: spec.expected_operation || "",
    lastAssistantAnswer: turns.at(-2)?.answer || seededLastAssistant || spec.compact_state?.lastAnswer || ""
  });

  for (const bad of spec.forbidden_final_answers || []) {
    if (bad && answer.trim() === bad.trim()) failures.push(`forbidden_final_answer:${bad}`);
  }
  for (const id of spec.forbidden_bare_fallback_ids || spec.forbidden_fallback_ids || []) {
    if (id && finalBareId === id) failures.push(`forbidden_bare_fallback_id:${id}`);
  }
  for (const phrase of spec.forbidden_unquoted_phrases || []) {
    if (phrase && answer.includes(phrase) && !["repair_quote", "specific_clarification"].includes(finalShape.kind)) {
      failures.push(`forbidden_unquoted_phrase:${phrase}`);
    }
  }
  for (const phrase of spec.allowed_repair_quotes || []) {
    if (phrase && answer.includes(phrase) && finalShape.kind !== "repair_quote" && !/刚才|上一句|不该|答偏/.test(answer)) {
      failures.push(`repair_quote_without_repair_context:${phrase}`);
    }
  }
  const badFallbackTurns = turns.filter((turn) => {
    const shape = classifyFallbackShape({
      answer: turn.answer,
      questionType: turn.trace?.question_type || turn.trace?.questionType || spec.expected_question_type || "",
      operation: turn.trace?.operation || spec.expected_operation || "",
      lastAssistantAnswer: turn.trace?.state_before?.lastAnswer || ""
    });
    return !shape.allowed || bareFallbackId(turn.answer);
  });
  if (badFallbackTurns.length) failures.push(`bad_generic_fallback:${badFallbackTurns.map((turn) => turn.answer).join(" / ")}`);
  for (const id of spec.forbidden_fallback_ids || []) {
    if (mentionsGenericFallback(answerText).includes(id) && finalShape.kind !== "repair_quote") {
      failures.push(`forbidden_fallback_id_mentioned_without_repair:${id}`);
    }
  }
  return failures;
}

async function runCase(spec) {
  const runtime = seedRuntime(spec.compact_state || {});
  const prompts = Array.isArray(spec.turns) && spec.turns.length ? [...spec.turns] : [];
  if (spec.prompt) prompts.push(spec.prompt);
  if (!prompts.length) prompts.push("");
  const turns = [];
  for (const prompt of prompts) {
    if (typeof prompt === "object" && prompt.assistant) {
      seedAssistantTurn(runtime, prompt.user || prompt.prompt || "", prompt.assistant);
      continue;
    }
    const text = typeof prompt === "string" ? prompt : prompt.user || prompt.prompt || "";
    turns.push(await answerDialogPrompt(text, runtime, { withThinkingDelay: false }));
  }
  const last = turns.at(-1);
  const answerText = turns.map((turn) => turn.answer).join("\n");
  const answer = String(last?.answer || "");
  const failures = [];

  const lastType = last?.type || "answer";
  if (spec.expected_response_type && lastType !== spec.expected_response_type) {
    failures.push(`expected_response_type:${spec.expected_response_type}:actual:${last?.type || "answer"}`);
  }
  if (spec.expected_user_turn_kind && last?.trace?.user_turn?.kind !== spec.expected_user_turn_kind) {
    failures.push(`expected_user_turn_kind:${spec.expected_user_turn_kind}:actual:${last?.trace?.user_turn?.kind || ""}`);
  }
  if (last?.type === "ui_affordance") {
    if (last.persist_as_assistant_message !== false) failures.push("affordance_persisted_as_assistant_message");
    if (last.count_as_exchange_turn !== false) failures.push("affordance_counted_as_exchange_turn");
    if (!last.affordance?.display_text) failures.push("affordance_missing_display_text");
  }

  if (lastType !== "ui_affordance" && !includesAny(answer, spec.must_include_any)) {
    failures.push(`must_include_any missing: ${(spec.must_include_any || []).join(" | ")}`);
  }
  for (const term of spec.must_not_include || []) {
    if (term && answerText.includes(term)) failures.push(`must_not_include: ${term}`);
  }
  for (const bad of spec.unacceptable_answers || []) {
    if (bad && answer.trim() === bad.trim()) failures.push(`unacceptable_answer: ${bad}`);
  }
  failures.push(...checkFallbackFields({ spec, turns, answer, answerText }));
  const routes = new Set(turns.flatMap((turn) => [turn.route, turn.intent, turn.trace?.answer_source, turn.trace?.context_action].filter(Boolean)));
  for (const route of spec.must_not_route || []) {
    if (routes.has(route)) failures.push(`must_not_route: ${route}`);
  }
  for (let i = 1; i < turns.length; i += 1) {
    if (turns[i].answer === turns[i - 1].answer && BAD_FALLBACK_RE.test(turns[i].answer)) failures.push("repeated_bad_fallback_loop");
  }

  return {
    id: spec.id,
    file: spec.file,
    prompts,
    answer,
    route: last?.route || "",
    intent: last?.intent || "",
    trace: last?.trace || {},
    ok: failures.length === 0,
    failures,
    notes: spec.notes || ""
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
    forbidden_fallback_count: results.filter((row) => row.failures.some((failure) => failure.includes("bad_generic_fallback"))).length,
    clarification_loop_failures: results.filter((row) => row.failures.includes("repeated_bad_fallback_loop")).length,
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
    mode: args.strict ? "strict" : "report-only",
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
