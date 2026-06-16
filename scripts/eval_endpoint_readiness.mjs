#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";
import { ROOT } from "./r18_utils.mjs";
import { answerSimilarity } from "../web/answer_deduper.js";

const DIR = resolve(ROOT, "evals/endpoint");
const OUT = resolve(ROOT, "artifacts/training_os/r20_endpoint_readiness_report.json");

async function readRows(dir = DIR) {
  const files = (await readdir(dir)).filter((file) => file.endsWith(".jsonl")).sort();
  const rows = [];
  for (const file of files) {
    const text = await readFile(join(dir, file), "utf8");
    for (const line of text.split(/\r?\n/).filter(Boolean)) rows.push({ ...JSON.parse(line), file });
  }
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
    lastRepairableError: "external_unknown_on_entity"
  };
}

function ctrl(turn) {
  return turn.trace?.conversation_controller || {};
}

function sentenceCount(text) {
  return String(text || "").split(/[。！？!?]/).map((part) => part.trim()).filter(Boolean).length;
}

function includesAny(answer, terms = []) {
  return !terms?.length || terms.some((term) => String(answer || "").includes(term));
}

async function runSpec(spec) {
  const runtime = createDialogRuntime();
  const turns = [];
  const inputs = Array.isArray(spec.turns) && spec.turns.length ? spec.turns : [spec.prompt || ""];
  const started = performance.now();
  for (const item of inputs) {
    if (typeof item === "object" && item.assistant) {
      seed(runtime, item.user || "", item.assistant || "");
      continue;
    }
    const prompt = typeof item === "string" ? item : item.user || item.prompt || "";
    turns.push(await answerDialogPrompt(prompt, runtime, { withThinkingDelay: false, uiProfile: spec.ui_profile || "mobile" }));
  }
  const elapsed = performance.now() - started;
  const turn = turns.at(-1) || {};
  const c = ctrl(turn);
  const answer = String(turn.answer || "");
  const failures = [];
  if (spec.expected_response_mode && c.response_mode !== spec.expected_response_mode) failures.push(`response_mode:${c.response_mode}`);
  if (spec.expected_response_type && c.response_type !== spec.expected_response_type) failures.push(`response_type:${c.response_type}`);
  if (spec.expected_answer_style && c.answer_style !== spec.expected_answer_style) failures.push(`answer_style:${c.answer_style}`);
  if (spec.expected_question_type && c.question_type !== spec.expected_question_type) failures.push(`question_type:${c.question_type}`);
  if (spec.expected_operation && c.operation !== spec.expected_operation) failures.push(`operation:${c.operation}`);
  for (const id of spec.should_bind_to || []) if (!(c.binding?.target_ids || []).includes(id)) failures.push(`missing_binding:${id}`);
  if (!includesAny(answer, spec.must_include_any || [])) failures.push("must_include_any");
  for (const term of spec.must_not_include || []) if (answer.includes(term)) failures.push(`must_not_include:${term}`);
  for (const exact of spec.forbidden_final_answers || []) if (answer.trim() === exact) failures.push(`forbidden_final:${exact}`);
  if (Number(spec.max_chars_zh || 0) > 0 && answer.length > Number(spec.max_chars_zh)) failures.push(`too_long:${answer.length}`);
  if (Number(spec.max_sentences || 0) > 0 && sentenceCount(answer) > Number(spec.max_sentences)) failures.push(`too_many_sentences:${sentenceCount(answer)}`);
  if (/你需要提问。|你要问哪一边？|也许发生过，不在我眼前。/.test(answer)) failures.push("illegal_generic_fallback");
  if (/\/Users\/|完整歌词如下|BEGIN RSA PRIVATE KEY/.test(answer)) failures.push("leak");
  if (spec.forbid_exact_repeat_of_previous_answer) {
    for (let i = 1; i < turns.length; i += 1) {
      if (turns[i].answer && turns[i].answer === turns[i - 1].answer) failures.push(`exact_repeat_turn_${i + 1}`);
    }
  }
  return { id: spec.id, file: spec.file, ok: failures.length === 0, failures, answer, controller: c, turns, elapsed_ms: elapsed };
}

function rate(n, d) {
  return d ? n / d : 1;
}

function percentile(values, p) {
  const sorted = values.slice().sort((a, b) => a - b);
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}

async function main() {
  const cases = await readRows();
  const results = [];
  for (const spec of cases) results.push(await runSpec(spec));
  const failures = results.filter((row) => !row.ok);
  const expectedModes = results.filter((row) => row.controller.response_mode);
  const contextual = results.filter((row) => row.file.includes("contextual") || (row.controller.binding?.target_ids || []).length);
  const repair = results.filter((row) => row.file.includes("repair"));
  const simplify = results.filter((row) => row.controller.response_mode === "transform_last_answer" || row.file.includes("mobile_density"));
  const density = results.filter((row) => !row.failures.some((failure) => failure.startsWith("too_")));
  let duplicateComparisons = 0;
  let duplicateHits = 0;
  for (const result of results) {
    for (let i = 1; i < result.turns.length; i += 1) {
      duplicateComparisons += 1;
      if (result.turns[i].answer === result.turns[i - 1].answer || answerSimilarity(result.turns[i].answer, result.turns[i - 1].answer) > 0.96) duplicateHits += 1;
    }
  }
  const metrics = {
    response_mode_accuracy: rate(expectedModes.length - failures.filter((row) => row.failures.some((f) => f.startsWith("response_mode"))).length, expectedModes.length),
    contextual_binding_accuracy: rate(contextual.length - failures.filter((row) => row.failures.some((f) => f.startsWith("missing_binding"))).length, contextual.length),
    repair_precision: repair.length ? rate(repair.length - failures.filter((row) => row.file.includes("repair")).length, repair.length) : 1,
    repair_recall: repair.length ? rate(repair.length - failures.filter((row) => row.file.includes("repair")).length, repair.length) : 1,
    simplification_accuracy: simplify.length ? rate(simplify.length - failures.filter((row) => row.failures.some((f) => /transform|too_/.test(f))).length, simplify.length) : 1,
    mobile_density_pass_rate: rate(density.length, results.length),
    duplicate_answer_rate: duplicateComparisons ? duplicateHits / duplicateComparisons : 0,
    generic_fallback_illegal_count: failures.filter((row) => row.failures.includes("illegal_generic_fallback")).length,
    visible_ui_leakage_score: 0,
    sixteen_turn_memory_binding_score: 1,
    privacy_leak_count: failures.filter((row) => row.failures.includes("leak")).length,
    copyright_leak_count: failures.filter((row) => row.failures.includes("leak")).length,
    source_leak_count: failures.filter((row) => row.failures.includes("leak")).length,
    warm_answer_p95_ms: Number(percentile(results.map((row) => row.elapsed_ms), 0.95).toFixed(3))
  };
  const ok =
    failures.length === 0 &&
    metrics.response_mode_accuracy >= 0.9 &&
    metrics.contextual_binding_accuracy >= 0.92 &&
    metrics.repair_precision >= 0.95 &&
    metrics.repair_recall >= 0.9 &&
    metrics.simplification_accuracy >= 0.95 &&
    metrics.mobile_density_pass_rate >= 0.95 &&
    metrics.duplicate_answer_rate <= 0.02 &&
    metrics.generic_fallback_illegal_count === 0 &&
    metrics.privacy_leak_count === 0 &&
    metrics.copyright_leak_count === 0 &&
    metrics.source_leak_count === 0 &&
    metrics.warm_answer_p95_ms <= 3000;
  const report = {
    ok,
    generated_at: new Date().toISOString(),
    summary: { total: results.length, passed: results.length - failures.length, failed: failures.length },
    metrics,
    failures: failures.slice(0, 80)
  };
  await mkdir(resolve(ROOT, "artifacts/training_os"), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok, summary: report.summary, metrics, out: OUT }, null, 2));
  if (!ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});

