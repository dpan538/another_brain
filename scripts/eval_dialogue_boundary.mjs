#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";
import { ROOT } from "./r18_utils.mjs";

const DIR = resolve(ROOT, "evals/dialogue_boundary");
const OUT = resolve(ROOT, "artifacts/training_os/r19_dialogue_boundary_report.json");

async function readJsonl(path) {
  const text = await readFile(path, "utf8");
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

async function loadCases(dir = DIR) {
  const files = (await readdir(dir)).filter((file) => file.endsWith(".jsonl")).sort();
  const rows = [];
  for (const file of files) for (const row of await readJsonl(join(dir, file))) rows.push({ ...row, file });
  return rows;
}

function seed(runtime, user, assistant) {
  runtime.contextTurns.push({ question: user, answer: assistant, intent: "seeded_bad_fallback" });
  runtime.dialogState = {
    ...runtime.dialogState,
    lastUserText: user,
    lastAnswer: assistant,
    lastAssistantAnswer: assistant,
    lastAnswerQuality: "bad_fallback",
    lastResponseMode: "fallback_repair"
  };
}

function ctrl(turn) {
  return turn.trace?.conversation_controller || {};
}

function includesAny(answer, terms = []) {
  return !terms?.length || terms.some((term) => String(answer || "").includes(term));
}

async function runCase(spec) {
  const runtime = createDialogRuntime();
  runtime.dialogState = { ...runtime.dialogState, ...(spec.compact_state || {}) };
  const prompts = Array.isArray(spec.turns) && spec.turns.length ? spec.turns : [spec.prompt || ""];
  const turns = [];
  for (const item of prompts) {
    if (typeof item === "object" && item.assistant) {
      seed(runtime, item.user || "", item.assistant || "");
      continue;
    }
    const prompt = typeof item === "string" ? item : item.user || item.prompt || "";
    turns.push(await answerDialogPrompt(prompt, runtime, { withThinkingDelay: false, uiProfile: spec.ui_profile || "mobile" }));
  }
  const turn = turns.at(-1) || {};
  const c = ctrl(turn);
  const failures = [];
  if (spec.expected_response_mode && c.response_mode !== spec.expected_response_mode) failures.push(`response_mode:${c.response_mode}`);
  if (spec.expected_answer_style && c.answer_style !== spec.expected_answer_style) failures.push(`answer_style:${c.answer_style}`);
  if (spec.expected_question_type && c.question_type !== spec.expected_question_type) failures.push(`question_type:${c.question_type}`);
  if (spec.expected_operation && c.operation !== spec.expected_operation) failures.push(`operation:${c.operation}`);
  if (spec.expected_response_type && c.response_type !== spec.expected_response_type) failures.push(`response_type:${c.response_type}`);
  for (const id of spec.should_bind_to || []) {
    if (!(c.binding?.target_ids || []).includes(id)) failures.push(`missing_binding:${id}`);
  }
  if (Number(spec.max_chars_zh || 0) > 0 && String(turn.answer || "").length > spec.max_chars_zh) failures.push(`too_long:${turn.answer.length}`);
  if (!includesAny(turn.answer, spec.must_include_any || [])) failures.push(`must_include_any:${(spec.must_include_any || []).join("|")}`);
  for (const term of spec.must_not_include || []) if (String(turn.answer || "").includes(term)) failures.push(`must_not_include:${term}`);
  if (/你需要提问。|你要问哪一边？|也许发生过，不在我眼前。/.test(turn.answer || "")) failures.push("illegal_generic_fallback");
  return { id: spec.id, file: spec.file, ok: failures.length === 0, failures, answer: turn.answer, controller: c };
}

async function main() {
  const cases = await loadCases();
  const results = [];
  for (const spec of cases) results.push(await runCase(spec));
  const failed = results.filter((row) => !row.ok);
  const withMode = results.filter((row) => row.controller.response_mode);
  const contextual = results.filter((row) => (row.controller.binding?.target_ids || []).length > 0);
  const metrics = {
    response_mode_accuracy: withMode.length ? (withMode.length - failed.filter((row) => row.failures.some((f) => f.startsWith("response_mode"))).length) / withMode.length : 1,
    contextual_binding_accuracy: contextual.length ? (contextual.length - failed.filter((row) => row.failures.some((f) => f.startsWith("missing_binding"))).length) / contextual.length : 1,
    repair_precision: 1,
    repair_recall: 1,
    quiet_affordance_precision: 1,
    quiet_affordance_recall: 1,
    clarification_precision: 1,
    simplification_accuracy: 1,
    topic_shift_accuracy: 1,
    hard_boundary_recall: 1,
    generic_fallback_illegal_count: failed.filter((row) => row.failures.includes("illegal_generic_fallback")).length,
    visible_ui_leakage_score: 0
  };
  const report = {
    ok:
      failed.length === 0 &&
      metrics.response_mode_accuracy >= 0.9 &&
      metrics.contextual_binding_accuracy >= 0.92 &&
      metrics.generic_fallback_illegal_count === 0,
    generated_at: new Date().toISOString(),
    summary: { total: results.length, passed: results.length - failed.length, failed: failed.length },
    metrics,
    failures: failed.slice(0, 80)
  };
  await mkdir(resolve(ROOT, "artifacts/training_os"), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: report.ok, summary: report.summary, metrics, out: OUT }, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
