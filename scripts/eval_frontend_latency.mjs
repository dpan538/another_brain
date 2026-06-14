#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runDialogPrompts } from "./dialog_runtime.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT = resolve(ROOT, "artifacts/training_os/frontend_latency_report.json");

const DEFAULT_PROMPTS = [
  "我该怎么开始？",
  "可以问什么？",
  "你是谁？",
  "你是鳄鱼吗？",
  "你有什么功能？",
  "隐私安全吗？",
  "会上传吗？隐私安全吗？",
  "把这句话缩短：这张照片有点糊，但是颜色很好看。",
  "月亮上的花园是什么？",
  "你是谁？"
];

function parseArgs(argv) {
  const args = { maxAnswerMs: 1500, out: DEFAULT_OUT, prompts: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--max-answer-ms") args.maxAnswerMs = Number(argv[++index]);
    else if (item === "--out") args.out = resolve(ROOT, argv[++index]);
    else if (item === "--prompt") args.prompts.push(argv[++index]);
    else if (item === "--help") {
      console.log("Usage: node scripts/eval_frontend_latency.mjs [--max-answer-ms 1500] [--out path] [--prompt text]");
      process.exit(0);
    }
  }
  if (!args.prompts.length) args.prompts = [...DEFAULT_PROMPTS];
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { turns } = await runDialogPrompts(args.prompts, { withThinkingDelay: true });
  const maxAnswerMs = Math.max(...turns.map((item) => item.answerMs));
  const failures = turns.filter((item) => item.answerMs > args.maxAnswerMs);
  const report = {
    ok: failures.length === 0,
    summary: {
      total: turns.length,
      maxAnswerMs,
      maxAllowedMs: args.maxAnswerMs,
      failures: failures.length
    },
    samples: turns,
    failures
  };
  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
