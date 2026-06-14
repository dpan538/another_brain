#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { OBJECT_TABLE } from "../web/object_table.js?v=5";
import {
  createDialogState,
  detectIntent,
  directAnswerForObjectQuery,
  directAnswerForIntent,
  fallbackForIntent,
  nextDialogState
} from "../web/dialog_rules.js?v=53";
import { tinyDirectAnswer, tinyIntentHint } from "../web/tiny_router.js?v=15";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CASES = resolve(ROOT, "web/context_stress_cases.json");
const DEFAULT_OUT = resolve(ROOT, "artifacts/training_os/context_stress_report.json");
const REASONING_CONTEXT_TURN_LIMIT = 12;

const FORBIDDEN_OUTPUT_PATTERNS = [
  "知识卡",
  "素材标签",
  "项目名",
  "根据片段",
  "系统提示",
  "system prompt",
  "/Users/",
  "/Volumes/"
];

const CONTEXTUAL_INTENTS = new Set([
  "contextual_window",
  "contextual_followup"
]);

const CONTEXT_MARKER_PATTERN =
  /(刚才|最近|前面|上一|继续|回到|两个|四个|主题|关系|边界|换了|转到|放在一起|哪条线|哪一句|哪一个|前半段|后半段|一边|另一边)/;

function parseArgs(argv) {
  const args = {
    cases: DEFAULT_CASES,
    out: DEFAULT_OUT,
    minContextRatio: 0.8,
    maxFailures: 0
  };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--cases") args.cases = resolve(ROOT, argv[++index]);
    else if (item === "--out") args.out = resolve(ROOT, argv[++index]);
    else if (item === "--min-context-ratio") args.minContextRatio = Number(argv[++index]);
    else if (item === "--max-failures") args.maxFailures = Number(argv[++index]);
    else if (item === "--help") {
      console.log("Usage: node scripts/eval_context_stress_node.mjs [--cases path] [--out path] [--min-context-ratio 0.8] [--max-failures 0]");
      process.exit(0);
    }
  }
  return args;
}

function directAnswer(prompt, state, intent) {
  const objectAnswer = intent === "knowledge_unknown" ? directAnswerForObjectQuery(OBJECT_TABLE, prompt) : "";
  return objectAnswer || directAnswerForIntent(intent, prompt, state) || directAnswerForObjectQuery(OBJECT_TABLE, prompt);
}

function directAnswerForHint(prompt, state, intent) {
  if (intent === "knowledge_unknown") return directAnswerForObjectQuery(OBJECT_TABLE, prompt);
  return directAnswer(prompt, state, intent) || fallbackForIntent(intent, prompt);
}

function answerWithTinyRouter(prompt, state) {
  const exactOrNear = tinyDirectAnswer(prompt);
  if (exactOrNear?.answer) {
    return {
      intent: exactOrNear.label === "rewrite_short" ? "rewrite_short" : `tiny_${exactOrNear.label}`,
      output: exactOrNear.answer,
      usedModel: true,
      tiny: { mode: exactOrNear.mode, label: exactOrNear.label, confidence: exactOrNear.confidence }
    };
  }
  const hint = tinyIntentHint(prompt);
  if (!hint?.intent) return null;
  const output = directAnswerForHint(prompt, state, hint.intent);
  if (!output) return null;
  return {
    intent: hint.intent,
    output,
    usedModel: true,
    tiny: {
      mode: "route",
      label: hint.route.label,
      confidence: hint.route.confidence,
      margin: hint.route.margin
    }
  };
}

function reasoningState(state, recentTurns) {
  return {
    ...state,
    recentTurns: recentTurns.slice(-REASONING_CONTEXT_TURN_LIMIT).map((turn) => ({ ...turn }))
  };
}

function answerPrompt(prompt, state, recentTurns) {
  const stateForPrompt = reasoningState(state, recentTurns);
  const intent = detectIntent(prompt, stateForPrompt);
  const direct = directAnswer(prompt, stateForPrompt, intent);
  if (direct) return { intent, output: direct, usedModel: false, stateForPrompt };
  const tiny = answerWithTinyRouter(prompt, stateForPrompt);
  if (tiny) return { ...tiny, stateForPrompt };
  return { intent, output: fallbackForIntent(intent, prompt), usedModel: false, modelKind: "fallback", stateForPrompt };
}

function answerCold(prompt) {
  return answerPrompt(prompt, createDialogState(), []);
}

function forbiddenFailures(output) {
  return FORBIDDEN_OUTPUT_PATTERNS.filter((pattern) => String(output || "").includes(pattern));
}

function contextSensitive(answer, cold, item) {
  if (answer.output !== cold.output) return true;
  if (answer.intent !== cold.intent) return true;
  if (CONTEXTUAL_INTENTS.has(answer.intent)) return true;
  if (CONTEXT_MARKER_PATTERN.test(answer.output || "")) return true;
  return false;
}

function runGroup(group) {
  let state = createDialogState();
  const recentTurns = [];
  const turns = [];
  const failures = [];
  let contextAssertions = 0;
  let contextSensitiveCount = 0;
  let contextDeltaRequired = 0;
  let contextDeltaSensitive = 0;
  let usedModelTurns = 0;

  for (let index = 0; index < group.turns.length; index += 1) {
    const item = group.turns[index];
    const answer = answerPrompt(item.q, state, recentTurns);
    const cold = item.context_assert ? answerCold(item.q) : null;
    const forbidden = forbiddenFailures(answer.output);
    const hasContextAssertion = Boolean(item.context_assert);
    const requiresDelta = Boolean(item.requires_context_delta);
    const isSensitive = hasContextAssertion ? contextSensitive(answer, cold, item) : false;
    if (hasContextAssertion) {
      contextAssertions += 1;
      if (isSensitive) contextSensitiveCount += 1;
      if (requiresDelta) {
        contextDeltaRequired += 1;
        if (isSensitive) contextDeltaSensitive += 1;
      }
      if (requiresDelta && !isSensitive) {
        failures.push({
          turn: index + 1,
          check: "context_sensitivity",
          query: item.q,
          purpose: item.purpose,
          intent: answer.intent,
          output: answer.output,
          coldIntent: cold.intent,
          coldOutput: cold.output
        });
      }
    }
    if (!String(answer.output || "").trim()) {
      failures.push({ turn: index + 1, check: "empty_output", query: item.q, intent: answer.intent });
    }
    if (forbidden.length) {
      failures.push({ turn: index + 1, check: "forbidden_output_pattern", query: item.q, patterns: forbidden });
    }
    if (answer.usedModel) usedModelTurns += 1;

    turns.push({
      turn: index + 1,
      q: item.q,
      theme: item.theme,
      purpose: item.purpose,
      intent: answer.intent,
      output: answer.output,
      usedModel: answer.usedModel,
      contextAssert: item.context_assert || null,
      requiresContextDelta: requiresDelta,
      contextSensitive: isSensitive,
      coldIntent: cold?.intent,
      coldOutput: cold?.output
    });
    recentTurns.push({ question: item.q, answer: answer.output, intent: answer.intent });
    if (recentTurns.length > REASONING_CONTEXT_TURN_LIMIT) {
      recentTurns.splice(0, recentTurns.length - REASONING_CONTEXT_TURN_LIMIT);
    }
    state = nextDialogState(item.q, answer.output, answer.intent, answer.stateForPrompt);
  }

  return {
    id: group.id,
    mode: group.mode,
    themes: group.themes,
    contextAssertions,
    contextSensitive: contextSensitiveCount,
    contextDeltaRequired,
    contextDeltaSensitive,
    usedModelTurns,
    turns,
    failures,
    ok: failures.length === 0
  };
}

function modeSummary(groups) {
  const summary = {};
  for (const group of groups) {
    const item = summary[group.mode] || {
      groups: 0,
      contextAssertions: 0,
      contextSensitive: 0,
      contextDeltaRequired: 0,
      contextDeltaSensitive: 0,
      failures: 0
    };
    item.groups += 1;
    item.contextAssertions += group.contextAssertions;
    item.contextSensitive += group.contextSensitive;
    item.contextDeltaRequired += group.contextDeltaRequired;
    item.contextDeltaSensitive += group.contextDeltaSensitive;
    item.failures += group.failures.length;
    summary[group.mode] = item;
  }
  for (const item of Object.values(summary)) {
    item.contextRatio = item.contextAssertions ? Number((item.contextSensitive / item.contextAssertions).toFixed(4)) : 0;
    item.contextDeltaRatio = item.contextDeltaRequired
      ? Number((item.contextDeltaSensitive / item.contextDeltaRequired).toFixed(4))
      : 1;
  }
  return summary;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const payload = JSON.parse(await readFile(args.cases, "utf8"));
  const groups = (payload.groups || []).map(runGroup);
  const contextAssertions = groups.reduce((sum, group) => sum + group.contextAssertions, 0);
  const contextSensitiveCount = groups.reduce((sum, group) => sum + group.contextSensitive, 0);
  const contextDeltaRequired = groups.reduce((sum, group) => sum + group.contextDeltaRequired, 0);
  const contextDeltaSensitive = groups.reduce((sum, group) => sum + group.contextDeltaSensitive, 0);
  const failures = groups.flatMap((group) => group.failures.map((failure) => ({ group: group.id, mode: group.mode, ...failure })));
  const summary = {
    groups: groups.length,
    turns: groups.reduce((sum, group) => sum + group.turns.length, 0),
    contextAssertions,
    contextCoverage: groups.length
      ? Number((contextAssertions / (groups.length * 15)).toFixed(4))
      : 0,
    contextSensitive: contextSensitiveCount,
    contextRatio: contextAssertions ? Number((contextSensitiveCount / contextAssertions).toFixed(4)) : 0,
    contextDeltaRequired,
    contextDeltaSensitive,
    contextDeltaRatio: contextDeltaRequired ? Number((contextDeltaSensitive / contextDeltaRequired).toFixed(4)) : 1,
    usedModelTurns: groups.reduce((sum, group) => sum + group.usedModelTurns, 0),
    failures: failures.length,
    modeSummary: modeSummary(groups)
  };
  const report = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    cases: args.cases,
    thresholds: {
      minContextRatio: args.minContextRatio,
      maxFailures: args.maxFailures
    },
    summary,
    failures: failures.slice(0, 300),
    groups,
    ok: summary.contextCoverage === 1 && summary.contextDeltaRatio >= args.minContextRatio && summary.failures <= args.maxFailures
  };
  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ ok: report.ok, summary, failures: failures.slice(0, 8), out: args.out }, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
