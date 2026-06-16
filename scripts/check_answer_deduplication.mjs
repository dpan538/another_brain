#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";
import { ROOT } from "./r18_utils.mjs";
import { answerSimilarity } from "../web/answer_deduper.js";

const OUT = resolve(ROOT, "artifacts/training_os/r19_answer_deduplication_report.json");

async function main() {
  const sessions = [
    ["你知道罗大佑吗？", "他的歌曲有什么代表性？", "罗大佑的歌曲有什么代表性？"],
    ["罗大佑是谁？", "他的歌有什么特点？", "罗大佑的歌有什么特点？"],
    ["罗大佑的歌曲有什么代表性？", "罗大佑的歌曲有什么代表性？"]
  ];
  let duplicates = 0;
  let comparisons = 0;
  const results = [];
  for (const prompts of sessions) {
    const runtime = createDialogRuntime();
    const turns = [];
    for (const prompt of prompts) turns.push(await answerDialogPrompt(prompt, runtime, { withThinkingDelay: false }));
    for (let i = 1; i < turns.length; i += 1) {
      const sim = answerSimilarity(turns[i - 1].answer, turns[i].answer);
      comparisons += 1;
      if (turns[i - 1].answer === turns[i].answer || sim > 0.82) duplicates += 1;
    }
    results.push({ prompts, turns: turns.map((turn) => turn.answer) });
  }
  const duplicate_answer_rate = comparisons ? duplicates / comparisons : 0;
  const report = {
    ok: duplicate_answer_rate <= 0.02,
    generated_at: new Date().toISOString(),
    duplicate_answer_rate,
    duplicates,
    comparisons,
    results
  };
  await mkdir(resolve(ROOT, "artifacts/training_os"), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: report.ok, duplicate_answer_rate, out: OUT }, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
