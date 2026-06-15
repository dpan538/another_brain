#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";
import { ROOT } from "./r18_utils.mjs";
import { bareFallbackId } from "../web/generic_fallback_classifier.js?v=1";

const FILES = [
  "evals/p0_lobotomy/non_question_affordance.jsonl",
  "evals/p0_lobotomy/declaration_handling.jsonl",
  "evals/p0_lobotomy/affordance_ui.jsonl"
];
const OUT = resolve(ROOT, "artifacts/training_os/non_question_affordance_report.json");

async function readRows(path) {
  const text = await readFile(resolve(ROOT, path), "utf8");
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)).map((row) => ({ ...row, file: path }));
}

function seed(runtime, turns = []) {
  for (const item of turns) {
    if (!item?.assistant) continue;
    runtime.contextTurns.push({ question: item.user || "", answer: item.assistant || "", intent: "seeded_context" });
    runtime.dialogState = {
      ...runtime.dialogState,
      lastUserText: item.user || "",
      lastAnswer: item.assistant || "",
      lastIntent: "seeded_context"
    };
  }
}

async function runRow(row) {
  const runtime = createDialogRuntime();
  seed(runtime, row.turns || []);
  const beforeTurns = runtime.contextTurns.length;
  const result = await answerDialogPrompt(row.prompt, runtime, { withThinkingDelay: false });
  const resultType = result.type || "answer";
  const afterTurns = runtime.contextTurns.length;
  const failures = [];
  if (row.expected_response_type && resultType !== row.expected_response_type) failures.push(`expected_response_type:${row.expected_response_type}:actual:${resultType}`);
  if (row.expected_user_turn_kind && result.trace?.user_turn?.kind !== row.expected_user_turn_kind) failures.push(`expected_user_turn_kind:${row.expected_user_turn_kind}:actual:${result.trace?.user_turn?.kind || ""}`);
  if (result.type === "ui_affordance") {
    if (result.answer) failures.push("affordance_has_answer_text");
    if (result.persist_as_assistant_message !== false) failures.push("affordance_persisted_as_message");
    if (result.count_as_exchange_turn !== false) failures.push("affordance_counted_as_exchange");
    if (afterTurns !== beforeTurns) failures.push("affordance_mutated_exchange_turns");
    if (!result.affordance?.display_text) failures.push("affordance_missing_display_text");
  } else {
    const answer = String(result.answer || "");
    if (Array.isArray(row.must_include_any) && row.must_include_any.length && !row.must_include_any.some((term) => answer.includes(term))) failures.push("must_include_any");
  }
  for (const term of row.must_not_include || []) {
    if (String(result.answer || "").includes(term)) failures.push(`must_not_include:${term}`);
  }
  if (bareFallbackId(result.answer)) failures.push(`bare_fallback:${bareFallbackId(result.answer)}`);
  return {
    id: row.id,
    file: row.file,
    prompt: row.prompt,
    type: resultType,
    answer: result.answer || "",
    affordance: result.affordance || null,
    user_turn: result.trace?.user_turn || null,
    exchange_turns_before: beforeTurns,
    exchange_turns_after: afterTurns,
    ok: failures.length === 0,
    failures
  };
}

async function main() {
  const rows = [];
  for (const file of FILES) rows.push(...(await readRows(file)));
  const results = [];
  for (const row of rows) results.push(await runRow(row));
  const failures = results.filter((result) => !result.ok);
  const report = {
    ok: failures.length === 0,
    generated_at: new Date().toISOString(),
    total: results.length,
    passed: results.length - failures.length,
    failed: failures.length,
    affordance_count: results.filter((result) => result.type === "ui_affordance").length,
    answer_count: results.filter((result) => result.type === "answer").length,
    failures: failures.slice(0, 80),
    results
  };
  await mkdir(resolve(ROOT, "artifacts/training_os"), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: report.ok, total: report.total, passed: report.passed, failed: report.failed, affordance_count: report.affordance_count, out: OUT }, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
