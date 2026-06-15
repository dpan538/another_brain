import { performance } from "node:perf_hooks";

import { OBJECT_TABLE } from "../web/object_table.js?v=5";
import {
  createDialogState,
  detectIntent,
  directAnswerForObjectQuery,
  directAnswerForIntent,
  fallbackForIntent,
  nextDialogState
} from "../web/dialog_rules.js?v=60";
import { decideStructuredRoute, retrieveEvidence, verifyProposedAnswer } from "../web/structured_decision.js?v=1";
import { detectContextAction } from "../web/context_state.js?v=2";
import { answerWithOperationLayer } from "../web/operation_layer.js?v=1";
import { finalizeWithFallbackFirewall } from "../web/fallback_firewall.js?v=1";
import { sanitizeSurfaceIdentity } from "../web/surface_identity.js?v=6";
import { tinyDirectAnswer, tinyIntentHint } from "../web/tiny_router.js?v=15";
import {
  buildCompactStateFromTurns,
  compactExtractionTurnsFromState,
  CONTEXT_WINDOWS,
  rawRuntimeTurnsFromState,
  visibleTurnsFromState
} from "../web/compact_context.js?v=1";
import {
  buildInternalSessionMemory,
  modelUsableTurnsFromSession,
  SESSION_MEMORY_WINDOWS
} from "../web/internal_session_memory.js?v=1";
import { clampThinkingProfile, selectThinkingProfile } from "../web/thinking_profile.js?v=1";

export const VISIBLE_CONTEXT_TURN_LIMIT = CONTEXT_WINDOWS.maxVisibleExchangeTurns;
export const RAW_RUNTIME_CONTEXT_TURN_LIMIT = CONTEXT_WINDOWS.maxRawExchangeTurnsInRuntimePacket;
export const REASONING_CONTEXT_TURN_LIMIT = SESSION_MEMORY_WINDOWS.internalRuntimeExchangeTurns;

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
  if (exactRepeat) {
    const profile = clampThinkingProfile(selectThinkingProfile({ query: text, repeated: true }));
    return { delay: profile.delayMs, mode: profile.mode, profile };
  }

  const identityLike = IDENTITY_REPETITION_PATTERN.test(text);
  const recentIdentityLike =
    IDENTITY_REPETITION_PATTERN.test(dialogState.lastUserText || "") ||
    /(identity|alias|name|identity_relation)/.test(dialogState.lastIntent || "");
  if (identityLike && recentIdentityLike) {
    const profile = clampThinkingProfile(selectThinkingProfile({ query: text, relatedIdentity: true }));
    return { delay: profile.delayMs, mode: profile.mode, profile };
  }

  const profile = clampThinkingProfile(selectThinkingProfile({ query: text }));
  return { delay: profile.delayMs, mode: profile.mode, profile };
}

export function reasoningStateFor(runtime) {
  const internalSessionMemory = buildInternalSessionMemory({ contextTurns: runtime.contextTurns });
  const compact_state = buildCompactStateFromTurns(
    compactExtractionTurnsFromState({ contextTurns: runtime.contextTurns }),
    runtime.dialogState?.compact_state || runtime.dialogState?.compactState || {}
  );
  return {
    ...runtime.dialogState,
    recentTurns: rawRuntimeTurnsFromState({ contextTurns: runtime.contextTurns }, RAW_RUNTIME_CONTEXT_TURN_LIMIT),
    visibleRecentTurns: visibleTurnsFromState({ contextTurns: runtime.contextTurns }, VISIBLE_CONTEXT_TURN_LIMIT),
    internalSessionMemory,
    modelUsableSessionTurns: modelUsableTurnsFromSession({ contextTurns: runtime.contextTurns }),
    compact_state,
    compactState: compact_state
  };
}

function compactState(state = {}) {
  return {
    lastIntent: state.lastIntent || "",
    lastTopic: state.lastTopic || "",
    lastUserText: state.lastUserText || "",
    lastAnswer: state.lastAnswer || "",
    commitments: Array.isArray(state.commitments)
      ? state.commitments.map((item) => ({
          id: item.id || "",
          type: item.type || "",
          ttl: item.ttl || 0,
          claim: item.claim || ""
        }))
      : [],
    frames: Array.isArray(state.frames) ? state.frames : [],
    recentTurns: Array.isArray(state.recentTurns)
      ? state.recentTurns.slice(-VISIBLE_CONTEXT_TURN_LIMIT).map((turn) => ({
          question: turn.question || "",
          answer: turn.answer || "",
          intent: turn.intent || "",
          topic: turn.topic || ""
        }))
      : []
  };
}

function isWhyQuestion(text) {
  return /^(为什么|为何|怎么会|why)\b|为什么/.test(String(text || "").trim());
}

function inferContextActionLabel(text, contextDecision, resolved) {
  if (contextDecision?.action) return contextDecision.action;
  const intent = resolved.intent || "";
  if (intent === "self_identity_known") return "SELF_IDENTITY_KNOWN";
  if (intent === "self_knowledge_scope") return "SELF_KNOWLEDGE_SCOPE";
  if (intent === "self_stop_boundary") return "SELF_STOP_BOUNDARY";
  if (intent === "animal_green_water_quantifier") return "REFERENT_CLASS_MEMBERSHIP";
  if (intent === "animal_crocodile_body") return "REFERENT_DISTINGUISH_SENSE";
  if (intent === "animal_crocodile_fact") return "REFERENT_ANIMAL_FACT";
  if (intent === "self_dialog_box_body" || intent === "self_body_boundary") return "SELF_BODY_BOUNDARY";
  if (intent.startsWith("operation_culture_")) return "ANSWER_CULTURE";
  if (intent.startsWith("operation_sentence_")) return "EXPLAIN_SENTENCE";
  if (intent.startsWith("operation_")) return "SOLVE_REASONING";
  if (intent === "culture_awareness") return "ANSWER_CULTURE";
  if (intent === "gate_function" && isWhyQuestion(text)) return "ANSWER_LOCAL_WHY";
  if (intent === "gate_function") return "ANSWER_LOCAL";
  if (intent === "training_next") return "SURFACE_PROJECT_ANSWER";
  if (intent.startsWith("help_")) return "ANSWER_HELP";
  if (intent.startsWith("surface_identity_")) return "SURFACE_IDENTITY";
  if (intent === "relation_between_us") return "ANSWER_RELATION_BOUNDARY";
  if (intent === "relation_statement") return "ANSWER_RELATION_STATEMENT";
  if (intent === "relation_memory_boundary") return "ANSWER_MEMORY_BOUNDARY";
  if (/privacy/.test(intent)) return "REFUSE_PRIVACY";
  if (/unknown|suspicious/.test(intent)) return "ANSWER_WITH_UNCERTAINTY";
  if (intent === "rewrite_short") return "SHORTEN_TEXT";
  if (resolved.route === "fallback") return "FALLBACK";
  return "ANSWER_LOCAL";
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
  const turns = state.internalSessionMemory?.model_usable_turns || state.modelUsableSessionTurns || state.recentTurns || [];
  return turns.map((turn, index) => ({
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
  const operationAnswer = answerWithOperationLayer(text, state);
  if (operationAnswer?.answer) return { ...operationAnswer, route: "operation" };

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
  const stateBefore = compactState(state);
  const contextDecision = detectContextAction(text, state);
  const resolved = resolveAnswer(text, state);
  const finalized = finalizeWithFallbackFirewall({
    query: text,
    state,
    candidateAnswer: resolved.answer,
    intent: resolved.intent,
    route: resolved.route,
    trace: {
      intent: resolved.intent,
      route: resolved.route,
      questionType: resolved.questionType || "",
      question_type: resolved.questionType || "",
      operation: resolved.operation || "",
      context_decision: contextDecision
    }
  });
  const rawAnswer = String(finalized.answer || "").trim();
  const answer = sanitizeSurfaceIdentity(finalized.answer, text);
  const sanitizerChanged = rawAnswer !== answer;

  runtime.contextTurns.push({ question: text, answer, intent: finalized.intent || resolved.intent });
  if (runtime.contextTurns.length > REASONING_CONTEXT_TURN_LIMIT) {
    runtime.contextTurns.splice(0, runtime.contextTurns.length - REASONING_CONTEXT_TURN_LIMIT);
  }
  runtime.dialogState = nextDialogState(text, answer, finalized.intent || resolved.intent, runtime.dialogState);
  const stateAfter = compactState(runtime.dialogState);
  const finalResolved = { ...resolved, intent: finalized.intent || resolved.intent, route: finalized.route || resolved.route };
  const contextAction = inferContextActionLabel(text, contextDecision, finalResolved);
  const trace = {
    input: text,
    state_before: stateBefore,
    intent: finalResolved.intent,
    context_action: contextAction,
    context_decision: contextDecision
      ? {
          action: contextDecision.action || "",
          commitment: contextDecision.commitment
            ? {
                id: contextDecision.commitment.id || "",
                type: contextDecision.commitment.type || "",
                ttl: contextDecision.commitment.ttl || 0,
                claim: contextDecision.commitment.claim || ""
              }
            : null
        }
      : null,
    matched_rule: resolved.intent,
    answer_source: finalResolved.route,
    raw_answer: rawAnswer,
    sanitizer_changed: sanitizerChanged,
    fallback_firewall: finalized.firewall || null,
    final_answer: answer,
    state_after: stateAfter
  };

  const answerMs = Math.round((performance.now() - started) * 1000) / 1000;
  return {
    prompt: text,
    answer,
    output: answer,
    intent: finalResolved.intent,
    route: finalResolved.route,
    usedModel: Boolean(resolved.usedModel),
    thinkingMode: thinking.mode,
    thinkingDelayMs: withThinkingDelay ? thinking.delay : 0,
    suggestedThinkingDelayMs: thinking.delay,
    answerMs,
    outputChars: answer.length,
    trace,
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
