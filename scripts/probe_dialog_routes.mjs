#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";
import { ROOT } from "./r18_utils.mjs";

const DEFAULT_OUT = resolve(ROOT, "artifacts/training_os/p0_route_trace_report.json");

function parseArgs(argv) {
  const args = { prompts: [], out: DEFAULT_OUT, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--prompt") args.prompts.push(argv[++i] || "");
    else if (item === "--out") args.out = resolve(ROOT, argv[++i] || "");
    else if (item === "--json") args.json = true;
    else throw new Error(`Unknown arg ${item}`);
  }
  if (!args.prompts.length) {
    args.prompts = ["罗大佑是谁？", "罗大佑你知道吗？", "什么发生过？", "哪一边？", "你读过日本文学吗？", "我需要怎么提问？", "你知道我要干什么吗？"];
  }
  return args;
}

function questionCues(prompt) {
  return [...String(prompt).matchAll(/谁|什么|吗|怎么|为什么|哪|哪里|有没有|知道|介绍|代表|有哪些|[?？]/g)].map((m) => m[0]);
}

function entityHits(prompt) {
  return ["罗大佑", "日本文学", "之乎者也", "夏目漱石", "川端康成"].filter((term) => prompt.includes(term));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runtime = createDialogRuntime();
  const turns = [];
  for (const prompt of args.prompts) {
    const turn = await answerDialogPrompt(prompt, runtime, { withThinkingDelay: false });
    turns.push({
      prompt,
      answer: turn.answer,
      intent: turn.intent,
      route: turn.route,
      normalized_query: prompt.replace(/\s+/g, ""),
      question_cues: questionCues(prompt),
      expected_question_like: questionCues(prompt).length > 0,
      domain: turn.trace?.culture?.domain || (prompt.includes("日本文学") ? "literature.japanese" : prompt.includes("罗大佑") ? "music.mandopop" : ""),
      question_type: turn.trace?.question_type || turn.trace?.context_action || "",
      entity_hits: entityHits(prompt),
      work_hits: ["之乎者也", "鹿港小镇", "童年", "恋曲1990"].filter((term) => prompt.includes(term)),
      card_count: turn.culture?.cards?.length || turn.trace?.culture?.cards?.length || 0,
      operation: turn.trace?.context_action || "",
      gate_decision: turn.decision?.route || "",
      gate_reject_reasons: turn.trace?.fallback_firewall?.reason ? [turn.trace.fallback_firewall.reason] : [],
      fallback_id: /你需要提问/.test(turn.answer)
        ? "ask_required"
        : /你要问哪一边/.test(turn.answer)
          ? "which_side"
          : /也许发生过/.test(turn.answer)
            ? "external_event_unknown"
            : "",
      fallback_allowed: !turn.trace?.fallback_firewall || turn.trace.fallback_firewall.allowed !== false,
      draft_source: turn.trace?.answer_source || turn.route,
      final_source: turn.route,
      trace: turn.trace
    });
  }
  const report = {
    ok: turns.every((turn) => !turn.fallback_id),
    generated_at: new Date().toISOString(),
    turns
  };
  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else console.log(JSON.stringify({ ok: report.ok, turns: turns.length, out: args.out }, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
