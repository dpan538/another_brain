#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";
import { ROOT } from "./r18_utils.mjs";

const OUT = resolve(ROOT, "artifacts/training_os/r19_response_mode_invariant_report.json");

async function main() {
  const runtime = createDialogRuntime();
  const prompts = ["你知道罗大佑吗？", "他的歌曲有什么代表性？", "罗大佑的歌曲有什么代表性？", "是否能简单一点？"];
  const turns = [];
  for (const prompt of prompts) turns.push(await answerDialogPrompt(prompt, runtime, { withThinkingDelay: false }));
  const modes = turns.map((turn) => turn.trace?.conversation_controller?.response_mode || "");
  const styles = turns.map((turn) => turn.trace?.conversation_controller?.answer_style || "");
  const failures = [];
  if (modes[1] !== "contextual_answer") failures.push("followup_not_contextual");
  if (modes[2] !== "contextual_answer") failures.push("explicit_repeat_not_contextual");
  if (modes[3] !== "transform_last_answer") failures.push("simplify_not_transform");
  if (turns.some((turn) => /我刚才没有接住问题/.test(turn.answer))) failures.push("repair_phrase_overtriggered");
  if (turns.some((turn) => /观看、阅读|观看关系|阅读关系|图像关系/.test(turn.answer))) failures.push("method_leak");
  if (styles[1] !== "culture") failures.push("followup_style_not_culture");
  if (styles[3] !== "summary") failures.push("simplify_style_not_summary");
  const report = { ok: failures.length === 0, generated_at: new Date().toISOString(), prompts, modes, styles, answers: turns.map((turn) => turn.answer), failures };
  await mkdir(resolve(ROOT, "artifacts/training_os"), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: report.ok, failures, out: OUT }, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
