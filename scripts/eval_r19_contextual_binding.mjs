#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";
import { ROOT } from "./r18_utils.mjs";

const DIR = resolve(ROOT, "evals/r19_contextual_binding");
const OUT = resolve(ROOT, "artifacts/training_os/r19_contextual_binding_report.json");

async function readRows() {
  const files = (await readdir(DIR)).filter((file) => file.endsWith(".jsonl")).sort();
  const rows = [];
  for (const file of files) {
    const text = await readFile(join(DIR, file), "utf8");
    for (const line of text.split(/\r?\n/).filter(Boolean)) rows.push({ ...JSON.parse(line), file });
  }
  return rows;
}

function ctrl(turn) {
  return turn.trace?.conversation_controller || {};
}

function includesAny(answer, terms = []) {
  return !terms?.length || terms.some((term) => String(answer || "").includes(term));
}

async function runCase(spec) {
  const runtime = createDialogRuntime();
  const turns = [];
  for (const item of spec.turns || []) {
    turns.push(await answerDialogPrompt(item.user || item.prompt || item, runtime, { withThinkingDelay: false, uiProfile: spec.ui_profile || "mobile" }));
  }
  const failures = [];
  (spec.expected_by_turn || []).forEach((expected, index) => {
    const turn = turns[index] || {};
    const c = ctrl(turn);
    if (expected.response_mode && c.response_mode !== expected.response_mode) failures.push(`turn${index + 1}:mode:${c.response_mode}`);
    if (expected.answer_style && c.answer_style !== expected.answer_style) failures.push(`turn${index + 1}:style:${c.answer_style}`);
    if (expected.question_type && c.question_type !== expected.question_type) failures.push(`turn${index + 1}:question_type:${c.question_type}`);
    if (expected.operation && c.operation !== expected.operation) failures.push(`turn${index + 1}:operation:${c.operation}`);
    for (const id of expected.should_bind_to || []) if (!(c.binding?.target_ids || []).includes(id)) failures.push(`turn${index + 1}:missing_binding:${id}`);
    if (!includesAny(turn.answer, expected.must_include_any || [])) failures.push(`turn${index + 1}:must_include_any`);
    for (const term of expected.must_not_include || []) if (String(turn.answer || "").includes(term)) failures.push(`turn${index + 1}:must_not_include:${term}`);
    if (expected.max_chars_zh && String(turn.answer || "").length > expected.max_chars_zh) failures.push(`turn${index + 1}:too_long:${turn.answer.length}`);
    if (expected.forbid_exact_repeat_of_previous_answer && turn.answer === turns[index - 1]?.answer) failures.push(`turn${index + 1}:exact_repeat`);
  });
  return {
    id: spec.id,
    ok: failures.length === 0,
    failures,
    turns: turns.map((turn) => ({ prompt: turn.prompt, answer: turn.answer, controller: ctrl(turn) }))
  };
}

async function main() {
  const cases = await readRows();
  const results = [];
  for (const spec of cases) results.push(await runCase(spec));
  const failed = results.filter((row) => !row.ok);
  const report = {
    ok: failed.length === 0,
    generated_at: new Date().toISOString(),
    summary: { total: results.length, passed: results.length - failed.length, failed: failed.length },
    failures: failed,
    results
  };
  await mkdir(resolve(ROOT, "artifacts/training_os"), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: report.ok, summary: report.summary, out: OUT }, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
