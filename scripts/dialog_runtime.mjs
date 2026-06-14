import { performance } from "node:perf_hooks";

import { OBJECT_TABLE } from "../web/object_table.js?v=5";
import {
  createDialogState,
  detectIntent,
  directAnswerForObjectQuery,
  directAnswerForIntent,
  fallbackForIntent,
  nextDialogState
} from "../web/dialog_rules.js?v=59";
import { decideStructuredRoute, retrieveEvidence, verifyProposedAnswer } from "../web/structured_decision.js?v=1";
import { sanitizeSurfaceIdentity } from "../web/surface_identity.js?v=6";
import { tinyDirectAnswer, tinyIntentHint } from "../web/tiny_router.js?v=15";

export const VISIBLE_CONTEXT_TURN_LIMIT = 4;
export const REASONING_CONTEXT_TURN_LIMIT = 12;
export const BASE_THINKING_DELAY_MS = 680;
export const RELATED_THINKING_DELAY_MS = 1080;
export const REPEATED_THINKING_DELAY_MS = 1320;

const STRUCTURED_EVIDENCE_LIMIT = 5;
const NORMALIZE_PUNCTUATION = /[\s\-＿_—–~～`"'“”‘’.,，。!?！？:：;；、()[\]{}<>《》「」『』]/g;
const IDENTITY_REPETITION_PATTERN =
  /(鳄鱼|对话框|你是谁|你是什么|谁是|名字|叫你|叫我|机器人|只是个对话框|什么项目|efish|another|other)/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePrompt(text) {
  return String(text || "").toLowerCase().replace(NORMALIZE_PUNCTUATION, "").trim();
}

export function createDialogRuntime() {
  return {
    dialogState: createDialogState(),
    contextTurns: []
  };
}

export function thinkingProfileFor(text, dialogState, contextTurns) {
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

export function reasoningStateFor(runtime) {
  return {
    ...runtime.dialogState,
    recentTurns: runtime.contextTurns.slice(-REASONING_CONTEXT_TURN_LIMIT).map((turn) => ({ ...turn })),
    visibleRecentTurns: runtime.contextTurns.slice(-VISIBLE_CONTEXT_TURN_LIMIT).map((turn) => ({ ...turn }))
  };
}

function directAnswerForResolvedIntent(intent, text, state) {
  const objectAnswer = intent === "knowledge_unknown" ? directAnswerForObjectQuery(OBJECT_TABLE, text) : "";
  return objectAnswer || directAnswerForIntent(intent, text, state) || directAnswerForObjectQuery(OBJECT_TABLE, text);
}

function answerWithTinyRouter(text, state) {
  const exactOrNear = tinyDirectAnswer(text);
  if (exactOrNear?.answer) {
    return {
      intent: exactOrNear.label === "SHORTEN_TEXT" ? "rewrite_short" : `tiny_${exactOrNear.label}`,
      answer: exactOrNear.answer,
      usedModel: true,
      tiny: exactOrNear
    };
  }
  const hint = tinyIntentHint(text);
  if (!hint?.intent) return null;
  if (hint.intent === "knowledge_unknown") {
    const objectAnswer = directAnswerForObjectQuery(OBJECT_TABLE, text);
    return objectAnswer ? { intent: hint.intent, answer: objectAnswer, usedModel: true, tiny: hint.route } : null;
  }
  const answer = directAnswerForResolvedIntent(hint.intent, text, state) || fallbackForIntent(hint.intent, text);
  return answer ? { intent: hint.intent, answer, usedModel: true, tiny: hint.route } : null;
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

  if (decision.route === "privacy_boundary") {
    answer = "私人问题只有你知道。";
  } else if (decision.route === "refuse") {
    answer = "我只是个对话框。";
  } else if (decision.route === "ask_clarify") {
    answer = /(不提问|不问|可以说话|自己说)/.test(text) ? "提问才会开始思考。" : "你需要提问。";
  } else if (decision.route === "search_hint") {
    answer = "你应该去问百度。";
  } else if (decision.route === "correct_distractor") {
    answer = "也许发生过，不在我眼前。";
  }

  if (!answer) return null;
  const verification = verifyProposedAnswer({ query: text, evidence, route: decision.route, answer });
  if (!verification.ok) return null;
  return {
    intent: `structured_${decision.route}`,
    answer,
    usedModel: false,
    decision,
    evidence
  };
}

function resolveAnswer(text, state) {
  const intent = detectIntent(text, state);
  const directAnswer = directAnswerForResolvedIntent(intent, text, state);
  if (directAnswer) return { intent, answer: directAnswer, route: "direct", usedModel: false };

  const tinyAnswer = answerWithTinyRouter(text, state);
  if (tinyAnswer?.answer) return { ...tinyAnswer, route: "tiny_router" };

  const structuredAnswer = answerWithStructuredDecision(text, state);
  if (structuredAnswer?.answer) return { ...structuredAnswer, route: "structured" };

  return { intent, answer: fallbackForIntent(intent, text), route: "fallback", usedModel: false };
}

export async function answerDialogPrompt(text, runtime, options = {}) {
  const started = performance.now();
  const withThinkingDelay = Boolean(options.withThinkingDelay);
  const thinking = thinkingProfileFor(text, runtime.dialogState, runtime.contextTurns);
  if (withThinkingDelay) await sleep(thinking.delay);

  const state = reasoningStateFor(runtime);
  const resolved = resolveAnswer(text, state);
  const answer = sanitizeSurfaceIdentity(resolved.answer, text);

  runtime.contextTurns.push({ question: text, answer, intent: resolved.intent });
  if (runtime.contextTurns.length > REASONING_CONTEXT_TURN_LIMIT) {
    runtime.contextTurns.splice(0, runtime.contextTurns.length - REASONING_CONTEXT_TURN_LIMIT);
  }
  runtime.dialogState = nextDialogState(text, answer, resolved.intent, runtime.dialogState);

  const answerMs = Math.round((performance.now() - started) * 1000) / 1000;
  return {
    prompt: text,
    answer,
    output: answer,
    intent: resolved.intent,
    route: resolved.route,
    usedModel: Boolean(resolved.usedModel),
    thinkingMode: thinking.mode,
    thinkingDelayMs: withThinkingDelay ? thinking.delay : 0,
    suggestedThinkingDelayMs: thinking.delay,
    answerMs,
    outputChars: answer.length,
    tiny: resolved.tiny || null,
    decision: resolved.decision || null
  };
}

export async function runDialogPrompts(prompts, options = {}) {
  const runtime = createDialogRuntime();
  const turns = [];
  for (const prompt of prompts) {
    turns.push(await answerDialogPrompt(prompt, runtime, options));
  }
  return { runtime, turns };
}
