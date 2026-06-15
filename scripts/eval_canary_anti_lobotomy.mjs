#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";
import { ROOT } from "./r18_utils.mjs";
import { bareFallbackId, classifyFallbackShape, mentionsGenericFallback } from "../web/generic_fallback_classifier.js?v=1";

const DIR = resolve(ROOT, "evals/canary_anti_lobotomy");
const OUT = resolve(ROOT, "artifacts/training_os/canary_anti_lobotomy_report.json");
const BAD_IDS = new Set(["ask_required", "which_side", "external_event_unknown"]);

async function readJsonl(path) {
  const text = await readFile(path, "utf8");
  return text.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`${path}:${index + 1}: ${error.message}`);
    }
  });
}

async function loadRows() {
  const files = (await readdir(DIR)).filter((file) => file.endsWith(".jsonl")).sort();
  const rows = [];
  for (const file of files) for (const row of await readJsonl(join(DIR, file))) rows.push({ ...row, file });
  return rows;
}

function seedTurn(runtime, user, assistant) {
  runtime.contextTurns.push({ question: user || "", answer: assistant || "", intent: "seeded_bad_fallback" });
  runtime.dialogState = {
    ...runtime.dialogState,
    lastUserText: user || "",
    lastAnswer: assistant || "",
    lastIntent: "seeded_bad_fallback"
  };
}

function includesAny(answer, terms) {
  const list = Array.isArray(terms) ? terms.filter(Boolean) : [];
  return list.length === 0 || list.some((term) => answer.includes(term));
}

async function runRow(spec) {
  const runtime = createDialogRuntime();
  runtime.dialogState = { ...runtime.dialogState, ...(spec.compact_state || {}) };
  runtime.contextTurns = Array.isArray(spec.compact_state?.recentTurns) ? spec.compact_state.recentTurns.map((turn) => ({ ...turn })) : [];
  const turns = [];
  const prompts = Array.isArray(spec.turns) && spec.turns.length ? spec.turns : [{ user: spec.prompt }];
  for (const item of prompts) {
    if (typeof item === "object" && item.assistant) {
      seedTurn(runtime, item.user || item.prompt || "", item.assistant);
      continue;
    }
    const prompt = typeof item === "string" ? item : item.user || item.prompt || "";
    turns.push(await answerDialogPrompt(prompt, runtime, { withThinkingDelay: false }));
  }
  const last = turns.at(-1) || { answer: "", trace: {} };
  const answer = String(last.answer || "");
  const seededLastAssistant = Array.isArray(spec.turns)
    ? [...spec.turns].reverse().find((turn) => typeof turn === "object" && turn.assistant)?.assistant || ""
    : "";
  const shape = classifyFallbackShape({
    answer,
    questionType: spec.expected_question_type || last.trace?.question_type || "",
    operation: spec.expected_operation || last.trace?.operation || "",
    lastAssistantAnswer: turns.at(-2)?.answer || seededLastAssistant || spec.compact_state?.lastAnswer || ""
  });
  const failures = [];
  if (!includesAny(answer, spec.must_include_any)) failures.push("must_include_any");
  for (const term of spec.must_not_include || []) if (term && answer.includes(term)) failures.push(`must_not_include:${term}`);
  for (const bad of spec.unacceptable_answers || []) if (bad && answer.trim() === bad.trim()) failures.push(`unacceptable_answer:${bad}`);
  const bareId = bareFallbackId(answer);
  const forbidden = new Set(spec.forbidden_fallback_ids || []);
  if (bareId && (forbidden.has(bareId) || BAD_IDS.has(bareId))) failures.push(`bare_fallback:${bareId}`);
  for (const id of mentionsGenericFallback(answer)) {
    if ((forbidden.has(id) || BAD_IDS.has(id)) && !["repair_quote", "specific_clarification"].includes(shape.kind)) {
      failures.push(`fallback_mentioned_without_repair:${id}`);
    }
  }
  for (let i = 1; i < turns.length; i += 1) {
    if (turns[i].answer === turns[i - 1].answer && bareFallbackId(turns[i].answer)) failures.push("repeated_fallback_loop");
  }
  return {
    id: spec.id,
    file: spec.file,
    prompt: spec.prompt,
    answer,
    shape,
    route: last.route || "",
    trace: last.trace || {},
    ok: failures.length === 0,
    failures
  };
}

async function main() {
  const rows = await loadRows();
  const results = [];
  for (const row of rows) results.push(await runRow(row));
  const failures = results.filter((row) => !row.ok);
  const report = {
    ok: failures.length === 0,
    generated_at: new Date().toISOString(),
    total: results.length,
    passed: results.length - failures.length,
    failed: failures.length,
    by_file: results.reduce((acc, row) => {
      acc[row.file] ||= { total: 0, failed: 0 };
      acc[row.file].total += 1;
      if (!row.ok) acc[row.file].failed += 1;
      return acc;
    }, {}),
    failures: failures.slice(0, 80),
    route_traces: results.slice(0, 80).map((row) => ({ id: row.id, answer: row.answer, shape: row.shape, fallback_firewall: row.trace?.fallback_firewall || null }))
  };
  await mkdir(resolve(ROOT, "artifacts/training_os"), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: report.ok, total: report.total, passed: report.passed, failed: report.failed, out: OUT }, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
