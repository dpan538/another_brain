#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";
import { ROOT } from "./r18_utils.mjs";

const OUT = resolve(ROOT, "artifacts/training_os/repair_overtrigger_invariant_report.json");

function mode(turn) {
  return turn.trace?.response_mode?.mode || turn.trace?.state_after?.lastResponseMode || "";
}

async function runSequence() {
  const runtime = createDialogRuntime();
  const prompts = ["你知道罗大佑吗？", "他的歌曲有什么代表性？", "罗大佑的歌曲有什么代表性？", "是否能简单一点？"];
  const turns = [];
  for (const prompt of prompts) turns.push(await answerDialogPrompt(prompt, runtime, { withThinkingDelay: false }));
  return turns;
}

async function main() {
  const failures = [];
  const operationLayer = await readFile(resolve(ROOT, "web/operation_layer.js"), "utf8");
  const responseModeManager = await readFile(resolve(ROOT, "web/response_mode_manager.js"), "utf8");
  const draftVerifier = await readFile(resolve(ROOT, "web/draft_verifier.js"), "utf8");

  const flowStart = operationLayer.indexOf("export function answerWithOperationLayer");
  const flow = flowStart >= 0 ? operationLayer.slice(flowStart) : operationLayer;
  const selectIndex = flow.indexOf("selectResponseMode");
  const repairIndex = flow.indexOf("answerFallbackRepair");
  const simplifyIndex = operationLayer.indexOf("simplify_last_answer");
  const followupIndex = operationLayer.indexOf("followup_answer");
  if (selectIndex < 0) failures.push("operation_layer_missing_select_response_mode");
  if (repairIndex >= 0 && selectIndex >= 0 && repairIndex < selectIndex) failures.push("repair_referenced_before_response_mode_selection");
  if (!/responseMode\.mode === "fallback_repair"/.test(operationLayer)) failures.push("fallback_repair_not_mode_gated");
  if (!/simplify_last_answer/.test(responseModeManager) || !/SIMPLIFY_RE/.test(responseModeManager)) failures.push("simplify_mode_missing");
  if (simplifyIndex < 0) failures.push("operation_layer_missing_simplify_path");
  if (followupIndex < 0) failures.push("operation_layer_missing_followup_path");
  if (!/detectMethodLeak/.test(draftVerifier) || !/method_leak_verifier/.test(draftVerifier)) failures.push("draft_verifier_missing_method_leak_verifier");
  if (/replacement_policy:\s*["']repair_previous_bad_fallback["'][\s\S]{0,120}default/.test(operationLayer)) {
    failures.push("repair_previous_bad_fallback_looks_default");
  }

  const turns = await runSequence();
  const [first, second, third, fourth] = turns;
  if (mode(second) !== "followup_answer") failures.push(`turn2_expected_followup_answer_actual_${mode(second)}`);
  if (/我刚才没有接住问题|你可以直接说对象和方向/.test(second.answer)) failures.push("turn2_repair_phrase_overtrigger");
  if (mode(third) !== "culture_answer" && mode(third) !== "followup_answer") failures.push(`turn3_expected_culture_or_followup_actual_${mode(third)}`);
  if (/改变观看、阅读或判断关系|观看关系|阅读关系/.test(third.answer)) failures.push("turn3_method_leak");
  if (mode(fourth) !== "simplify_last_answer") failures.push(`turn4_expected_simplify_actual_${mode(fourth)}`);
  if (/我刚才没有接住问题|你可以直接说对象和方向/.test(fourth.answer)) failures.push("turn4_repair_phrase_overtrigger");

  const report = {
    ok: failures.length === 0,
    generated_at: new Date().toISOString(),
    failures,
    probe: turns.map((turn) => ({
      prompt: turn.prompt,
      answer: turn.answer,
      mode: mode(turn),
      route: turn.route,
      intent: turn.intent
    }))
  };
  await mkdir(resolve(ROOT, "artifacts/training_os"), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: report.ok, failures: failures.length, out: OUT }, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
