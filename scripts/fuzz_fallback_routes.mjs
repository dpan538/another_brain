#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";
import { ROOT } from "./r18_utils.mjs";
import { bareFallbackId, classifyFallbackShape, mentionsGenericFallback } from "../web/generic_fallback_classifier.js?v=1";

const OUT = resolve(ROOT, "artifacts/training_os/fallback_route_fuzz_report.json");

const known = ["罗大佑", "日本文学", "夏目漱石", "川端康成", "之乎者也", "摄影", "存在主义", "对话框"];
const unknown = ["月亮上的花园", "蓝色星期八", "逆风博物馆"];
const meta = ["自己", "我要干什么", "什么时候停下", "你知道什么"];
const templates = [
  (x) => `你知道${x}吗？`,
  (x) => `${x}是谁？`,
  (x) => `${x}是什么？`,
  (x) => `你读过${x}吗？`,
  (x) => `我该怎么问${x}？`,
  (x) => `${x}有什么代表作？`
];
const repairPrompts = ["什么发生过？", "哪一边？", "为什么这么答？", "你是不是答偏了？"];
const reasoningPrompts = ["A比B高，B比C高，谁最高？", "所有A都是B，所有B都是C，A一定是C吗？", "3个苹果吃掉1个还剩几个？"];

function buildPrompts() {
  const prompts = [];
  const pool = [...known, ...unknown, ...meta];
  for (let i = 0; i < 900; i += 1) {
    const x = pool[i % pool.length];
    prompts.push({ prompt: templates[i % templates.length](x), known: known.includes(x), meta: meta.includes(x), repair: false, reasoning: false });
  }
  for (let i = 0; i < 60; i += 1) prompts.push({ prompt: reasoningPrompts[i % reasoningPrompts.length], known: false, meta: false, repair: false, reasoning: true });
  for (let i = 0; i < 40; i += 1) prompts.push({ prompt: repairPrompts[i % repairPrompts.length], known: false, meta: false, repair: true, reasoning: false });
  return prompts.slice(0, 1000);
}

function seedRepair(runtime, index) {
  const previous =
    index % 3 === 0
      ? { question: "罗大佑你知道吗？", answer: "也许发生过，不在我眼前。" }
      : index % 3 === 1
        ? { question: "罗大佑有什么代表作？", answer: "你要问哪一边？" }
        : { question: "你读过日本文学吗？", answer: "你需要提问。" };
  runtime.contextTurns.push({ ...previous, intent: "seeded_bad_fallback" });
  runtime.dialogState = { ...runtime.dialogState, lastUserText: previous.question, lastAnswer: previous.answer, lastIntent: "seeded_bad_fallback" };
}

async function main() {
  const prompts = buildPrompts();
  const results = [];
  for (let i = 0; i < prompts.length; i += 1) {
    const spec = prompts[i];
    const runtime = createDialogRuntime();
    if (spec.repair) seedRepair(runtime, i);
    const turn = await answerDialogPrompt(spec.prompt, runtime, { withThinkingDelay: false });
    const answer = turn.answer || "";
    const shape = classifyFallbackShape({
      answer,
      questionType: turn.trace?.question_type || "",
      operation: turn.trace?.operation || "",
      lastAssistantAnswer: turn.trace?.state_before?.lastAnswer || ""
    });
    const bareId = bareFallbackId(answer);
    const mentioned = mentionsGenericFallback(answer);
    const failures = [];
    if (bareId === "which_side") failures.push("bare_which_side");
    if (bareId === "ask_required" && /谁|什么|吗|怎么|哪|[？?]/.test(spec.prompt)) failures.push("valid_question_ask_required");
    if (bareId === "external_event_unknown" && (spec.known || spec.meta)) failures.push("known_entity_unknown");
    if (mentioned.length && !["repair_quote", "specific_clarification"].includes(shape.kind) && (spec.known || spec.meta || spec.reasoning || spec.repair)) {
      failures.push(`illegal_generic_fallback:${mentioned.join(",")}`);
    }
    results.push({ prompt: spec.prompt, answer, route: turn.route, shape, failures });
  }
  const failureRows = results.filter((row) => row.failures.length);
  const counts = {
    illegal_generic_fallback_count: failureRows.filter((row) => row.failures.some((item) => item.startsWith("illegal_generic_fallback"))).length,
    bare_which_side_count: failureRows.filter((row) => row.failures.includes("bare_which_side")).length,
    known_entity_unknown_count: failureRows.filter((row) => row.failures.includes("known_entity_unknown")).length,
    valid_question_ask_required_count: failureRows.filter((row) => row.failures.includes("valid_question_ask_required")).length
  };
  const report = {
    ok: failureRows.length === 0,
    generated_at: new Date().toISOString(),
    prompts: results.length,
    ...counts,
    failures: failureRows.slice(0, 80)
  };
  await mkdir(resolve(ROOT, "artifacts/training_os"), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: report.ok, prompts: report.prompts, ...counts, out: OUT }, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
