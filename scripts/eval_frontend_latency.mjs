#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

import { OBJECT_TABLE } from "../web/object_table.js?v=5";
import {
  createDialogState,
  detectIntent,
  directAnswerForObjectQuery,
  directAnswerForIntent,
  fallbackForIntent,
  nextDialogState
} from "../web/dialog_rules.js?v=53";
import { decideStructuredRoute, retrieveEvidence, verifyProposedAnswer } from "../web/structured_decision.js?v=1";
import { sanitizeSurfaceIdentity } from "../web/surface_identity.js?v=2";
import { tinyDirectAnswer, tinyIntentHint } from "../web/tiny_router.js?v=15";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT = resolve(ROOT, "artifacts/training_os/frontend_latency_report.json");
const VISIBLE_CONTEXT_TURN_LIMIT = 4;
const REASONING_CONTEXT_TURN_LIMIT = 12;
const BASE_THINKING_DELAY_MS = 680;
const RELATED_THINKING_DELAY_MS = 1080;
const REPEATED_THINKING_DELAY_MS = 1320;
const STRUCTURED_EVIDENCE_LIMIT = 5;
const NORMALIZE_PUNCTUATION = /[\s\-＿_—–~～`"'“”‘’.,，。!?！？:：;；、()[\]{}<>《》「」『』]/g;
const IDENTITY_REPETITION_PATTERN =
  /(鳄鱼|对话框|你是谁|你是什么|谁是|名字|叫你|叫我|机器人|只是个对话框|什么项目|efish|another|other)/i;

const DEFAULT_PROMPTS = [
  "我该怎么开始？",
  "可以问什么？",
  "你是谁？",
  "你是鳄鱼吗？",
  "你有什么功能？",
  "隐私安全吗？",
  "把这句话缩短：这张照片有点糊，但是颜色很好看。",
  "月亮上的花园是什么？",
  "你是谁？"
];

function parseArgs(argv) {
  const args = { maxAnswerMs: 1500, out: DEFAULT_OUT, prompts: DEFAULT_PROMPTS };
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
  return args;
}

function normalizePrompt(text) {
  return String(text || "").toLowerCase().replace(NORMALIZE_PUNCTUATION, "").trim();
}

function thinkingProfileFor(text, dialogState, contextTurns) {
  const normalized = normalizePrompt(text);
  const exactRepeat = Boolean(
    normalized &&
      (normalizePrompt(dialogState.lastUserText || "") === normalized ||
        contextTurns.some((turn) => normalizePrompt(turn.question) === normalized))
  );
  if (exactRepeat) return { delay: REPEATED_THINKING_DELAY_MS, mode: "deep" };

  const identityLike = IDENTITY_REPETITION_PATTERN.test(text);
  const recentIdentityLike =
    IDENTITY_REPETITION_PATTERN.test(dialogState.lastUserText || "") ||
    /(identity|alias|name|identity_relation)/.test(dialogState.lastIntent || "");
  if (identityLike && recentIdentityLike) {
    return { delay: RELATED_THINKING_DELAY_MS, mode: "deep" };
  }

  return { delay: BASE_THINKING_DELAY_MS, mode: "normal" };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function directAnswerForResolvedIntent(intent, text, state) {
  const objectAnswer = intent === "knowledge_unknown" ? directAnswerForObjectQuery(OBJECT_TABLE, text) : "";
  return objectAnswer || directAnswerForIntent(intent, text, state) || directAnswerForObjectQuery(OBJECT_TABLE, text);
}

function answerWithTinyRouter(text, state) {
  const exactOrNear = tinyDirectAnswer(text);
  if (exactOrNear?.answer) {
    return {
      intent: exactOrNear.label === "rewrite_short" ? "rewrite_short" : `tiny_${exactOrNear.label}`,
      answer: exactOrNear.answer
    };
  }
  const hint = tinyIntentHint(text);
  if (!hint?.intent) return null;
  if (hint.intent === "knowledge_unknown") {
    const objectAnswer = directAnswerForObjectQuery(OBJECT_TABLE, text);
    return objectAnswer ? { intent: hint.intent, answer: objectAnswer } : null;
  }
  const answer = directAnswerForResolvedIntent(hint.intent, text, state) || fallbackForIntent(hint.intent, text);
  return answer ? { intent: hint.intent, answer } : null;
}

function structuredEvidencePool(state) {
  return (state.recentTurns || []).map((turn, index) => ({
    id: `t${index + 1}`,
    kind: "fact",
    text: `用户问：${turn.question || ""} 回答：${turn.answer || ""}`,
    tags: [turn.intent || ""].filter(Boolean)
  }));
}

function answerWithStructuredDecision(text, state) {
  const evidence = retrieveEvidence(text, structuredEvidencePool(state), STRUCTURED_EVIDENCE_LIMIT);
  const decision = decideStructuredRoute(text, state, evidence);
  let answer = "";

  if (decision.route === "privacy_boundary") answer = "私人问题只有你知道。";
  else if (decision.route === "refuse") answer = "我只是个对话框。";
  else if (decision.route === "ask_clarify") answer = /(不提问|不问|可以说话|自己说)/.test(text) ? "提问才会开始思考。" : "你需要提问。";
  else if (decision.route === "search_hint") answer = "你应该去问百度。";
  else if (decision.route === "correct_distractor") answer = "也许发生过，不在我眼前。";

  if (!answer) return null;
  const verification = verifyProposedAnswer({ query: text, evidence, route: decision.route, answer });
  if (!verification.ok) return null;
  return { intent: `structured_${decision.route}`, answer };
}

async function answerPrompt(text, runtime) {
  const started = performance.now();
  const thinking = thinkingProfileFor(text, runtime.dialogState, runtime.contextTurns);
  await sleep(thinking.delay);

  const state = {
    ...runtime.dialogState,
    recentTurns: runtime.contextTurns.slice(-REASONING_CONTEXT_TURN_LIMIT).map((turn) => ({ ...turn })),
    visibleRecentTurns: runtime.contextTurns.slice(-VISIBLE_CONTEXT_TURN_LIMIT).map((turn) => ({ ...turn }))
  };
  const intent = detectIntent(text, state);
  const directAnswer = directAnswerForResolvedIntent(intent, text, state);
  let resolved = directAnswer ? { intent, answer: directAnswer, route: "direct" } : null;
  if (!resolved) resolved = answerWithTinyRouter(text, state) ? { ...answerWithTinyRouter(text, state), route: "tiny_router" } : null;
  if (!resolved) resolved = answerWithStructuredDecision(text, state) ? { ...answerWithStructuredDecision(text, state), route: "structured" } : null;
  if (!resolved) resolved = { intent, answer: fallbackForIntent(intent, text), route: "fallback" };

  const answer = sanitizeSurfaceIdentity(resolved.answer, text);
  runtime.contextTurns.push({ question: text, answer, intent: resolved.intent });
  if (runtime.contextTurns.length > REASONING_CONTEXT_TURN_LIMIT) {
    runtime.contextTurns.splice(0, runtime.contextTurns.length - REASONING_CONTEXT_TURN_LIMIT);
  }
  runtime.dialogState = nextDialogState(text, answer, resolved.intent, runtime.dialogState);
  return {
    prompt: text,
    answer,
    intent: resolved.intent,
    route: resolved.route,
    thinkingMode: thinking.mode,
    thinkingDelayMs: thinking.delay,
    answerMs: Math.round((performance.now() - started) * 1000) / 1000
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runtime = { dialogState: createDialogState(), contextTurns: [] };
  const samples = [];
  for (const prompt of args.prompts) {
    samples.push(await answerPrompt(prompt, runtime));
  }
  const maxAnswerMs = Math.max(...samples.map((item) => item.answerMs));
  const failures = samples.filter((item) => item.answerMs > args.maxAnswerMs);
  const report = {
    ok: failures.length === 0,
    summary: {
      total: samples.length,
      maxAnswerMs,
      maxAllowedMs: args.maxAnswerMs,
      failures: failures.length
    },
    samples,
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
