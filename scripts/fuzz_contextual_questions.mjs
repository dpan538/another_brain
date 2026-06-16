#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";
import { ROOT } from "./r18_utils.mjs";

const OUT = resolve(ROOT, "artifacts/training_os/r19_contextual_question_fuzz_report.json");

async function main() {
  const seeds = [
    ["你知道罗大佑吗？", "他的歌曲有什么代表性？"],
    ["罗大佑是谁？", "他的歌有什么特点？"],
    ["罗大佑的歌曲有什么代表性？", "是否能简单一点？"],
    ["嗯。"],
    ["我需要怎么提问？"]
  ];
  const prompts = [];
  for (let i = 0; i < 80; i += 1) prompts.push(seeds[i % seeds.length]);
  let illegal_generic_fallback_count = 0;
  let contextual_binding_miss_count = 0;
  const samples = [];
  for (const sequence of prompts) {
    const runtime = createDialogRuntime();
    const turns = [];
    for (const prompt of sequence) turns.push(await answerDialogPrompt(prompt, runtime, { withThinkingDelay: false }));
    const last = turns.at(-1);
    if (/你需要提问。|你要问哪一边？|也许发生过，不在我眼前。/.test(last.answer || "")) illegal_generic_fallback_count += 1;
    if (/他的/.test(sequence.at(-1) || "") && !(last.trace?.conversation_controller?.binding?.target_ids || []).includes("person.luo_dayou")) contextual_binding_miss_count += 1;
    samples.push({ sequence, answer: last.answer, mode: last.trace?.conversation_controller?.response_mode || "" });
  }
  const report = {
    ok: illegal_generic_fallback_count === 0 && contextual_binding_miss_count === 0,
    generated_at: new Date().toISOString(),
    prompts: prompts.length,
    illegal_generic_fallback_count,
    contextual_binding_miss_count,
    samples: samples.slice(0, 20)
  };
  await mkdir(resolve(ROOT, "artifacts/training_os"), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: report.ok, prompts: prompts.length, illegal_generic_fallback_count, contextual_binding_miss_count, out: OUT }, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
