#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runDialogPrompts } from "./dialog_runtime.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT = resolve(ROOT, "artifacts/training_os/dialog_probe_report.json");
const DEFAULT_PROMPTS = [
  "门禁为什么不是为了好看？",
  "我们是什么关系？",
  "也许我认识你",
  "你认识我吗？"
];

function usage() {
  return [
    "Usage:",
    "  node scripts/dialog_probe.mjs --prompt \"门禁为什么不是为了好看？\"",
    "  node scripts/dialog_probe.mjs --prompt \"你是谁？\" --prompt \"你有什么功能？\"",
    "  node scripts/dialog_probe.mjs --jsonl evals/probe/prompts.jsonl --out artifacts/probe.json",
    "",
    "Options:",
    "  --prompt <text>            Add one prompt. Repeat for multi-turn context.",
    "  --jsonl, --input <path>    Read prompts from JSONL. Lines may be strings or objects with prompt/text/query.",
    "  --out <path>               Write JSON report. Default: artifacts/training_os/dialog_probe_report.json",
    "  --max-answer-ms <number>   Mark turns slower than this as failures.",
    "  --with-thinking-delay      Include the UI thinking delay in answerMs.",
    "  --include-state            Include compact final dialog state in the report.",
    "  --text                     Print a compact text transcript after the JSON summary.",
    "  --no-defaults             Do not use default sanity prompts when no prompt/input is provided."
  ].join("\n");
}

function parseArgs(argv) {
  const args = {
    prompts: [],
    inputs: [],
    out: DEFAULT_OUT,
    maxAnswerMs: 1500,
    withThinkingDelay: false,
    includeState: false,
    text: false,
    useDefaults: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--prompt") args.prompts.push(argv[++index] || "");
    else if (item === "--jsonl" || item === "--input") args.inputs.push(resolve(ROOT, argv[++index] || ""));
    else if (item === "--out") args.out = resolve(ROOT, argv[++index] || "");
    else if (item === "--max-answer-ms") args.maxAnswerMs = Number(argv[++index]);
    else if (item === "--with-thinking-delay") args.withThinkingDelay = true;
    else if (item === "--include-state") args.includeState = true;
    else if (item === "--text") args.text = true;
    else if (item === "--no-defaults") args.useDefaults = false;
    else if (item === "--help" || item === "-h") {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${item}\n\n${usage()}`);
    }
  }
  return args;
}

function promptFromLine(line, source, index) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "string") return parsed;
    const prompt = parsed.prompt || parsed.text || parsed.query || parsed.user;
    if (typeof prompt === "string" && prompt.trim()) return prompt.trim();
    throw new Error(`missing prompt/text/query/user`);
  } catch (error) {
    if (trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed.startsWith("\"")) {
      throw new Error(`${source}:${index + 1}: invalid JSONL prompt: ${error.message}`);
    }
    return trimmed;
  }
}

async function loadInputPrompts(paths) {
  const prompts = [];
  for (const path of paths) {
    const content = await readFile(path, "utf8");
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const prompt = promptFromLine(lines[index], path, index);
      if (prompt) prompts.push(prompt);
    }
  }
  return prompts;
}

function compactState(state = {}) {
  return {
    lastIntent: state.lastIntent || "",
    lastTopic: state.lastTopic || "",
    lastUserText: state.lastUserText || "",
    lastAnswer: state.lastAnswer || "",
    commitments: Array.isArray(state.commitments) ? state.commitments : [],
    frames: Array.isArray(state.frames) ? state.frames : []
  };
}

function buildReport(turns, runtime, args) {
  const failures = turns
    .filter((turn) => Number.isFinite(args.maxAnswerMs) && turn.answerMs > args.maxAnswerMs)
    .map((turn) => ({
      prompt: turn.prompt,
      answer: turn.answer,
      answerMs: turn.answerMs,
      maxAnswerMs: args.maxAnswerMs
    }));
  const fallbackTurns = turns.filter((turn) => turn.route === "fallback");
  const report = {
    ok: failures.length === 0,
    generated_at: new Date().toISOString(),
    options: {
      maxAnswerMs: args.maxAnswerMs,
      withThinkingDelay: args.withThinkingDelay
    },
    summary: {
      total: turns.length,
      passed: turns.length - failures.length,
      failed: failures.length,
      maxAnswerMs: turns.length ? Math.max(...turns.map((turn) => turn.answerMs)) : 0,
      usedModel: turns.filter((turn) => turn.usedModel).length,
      direct: turns.filter((turn) => turn.route === "direct").length,
      tinyRouter: turns.filter((turn) => turn.route === "tiny_router").length,
      structured: turns.filter((turn) => turn.route === "structured").length,
      fallback: fallbackTurns.length
    },
    turns,
    failures
  };
  if (args.includeState) {
    report.finalState = compactState(runtime.dialogState);
  }
  return report;
}

function printTranscript(turns) {
  for (const [index, turn] of turns.entries()) {
    console.log(`\n# ${index + 1} [${turn.route}/${turn.intent}] ${turn.answerMs}ms`);
    console.log(`Q: ${turn.prompt}`);
    console.log(`A: ${turn.answer}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPrompts = await loadInputPrompts(args.inputs);
  const prompts = [...args.prompts, ...inputPrompts];
  if (!prompts.length && args.useDefaults) prompts.push(...DEFAULT_PROMPTS);
  if (!prompts.length) {
    throw new Error(`No prompts provided.\n\n${usage()}`);
  }

  const { runtime, turns } = await runDialogPrompts(prompts, {
    withThinkingDelay: args.withThinkingDelay
  });
  const report = buildReport(turns, runtime, args);

  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ ok: report.ok, summary: report.summary, failures: report.failures.slice(0, 5), out: args.out }, null, 2));
  if (args.text) printTranscript(turns);
  process.exit(report.ok ? 0 : 2);
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
