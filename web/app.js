import { OBJECT_TABLE } from "./object_table.js?v=5";
import {
  createDialogState,
  detectIntent,
  directAnswerForObjectQuery,
  directAnswerForIntent,
  fallbackForIntent,
  nextDialogState,
} from "./dialog_rules.js?v=60";
import { decideStructuredRoute, retrieveEvidence, verifyProposedAnswer } from "./structured_decision.js?v=1";
import { buildDebugReport, downloadDebugReport } from "./debug_report.js?v=1";
import { answerWithOperationLayer } from "./operation_layer.js?v=2";
import { finalizeWithFallbackFirewall } from "./fallback_firewall.js?v=1";
import { sanitizeSurfaceIdentity } from "./surface_identity.js?v=6";
import { tinyDirectAnswer, tinyIntentHint, TINY_ROUTER_STATS } from "./tiny_router.js?v=15";
import {
  buildCompactStateFromTurns,
  compactExtractionTurnsFromState,
  CONTEXT_WINDOWS,
  rawRuntimeTurnsFromState,
  visibleTurnsFromState
} from "./compact_context.js?v=1";
import {
  buildInternalSessionMemory,
  modelUsableTurnsFromSession,
  SESSION_MEMORY_WINDOWS
} from "./internal_session_memory.js?v=1";
import { clampThinkingProfile, selectThinkingProfile } from "./thinking_profile.js?v=1";
import { RUNTIME_VERSION } from "./runtime_version.js?v=1";

const VISIBLE_CONTEXT_TURN_LIMIT = CONTEXT_WINDOWS.maxVisibleExchangeTurns;
const RAW_RUNTIME_CONTEXT_TURN_LIMIT = CONTEXT_WINDOWS.maxRawExchangeTurnsInRuntimePacket;
const REASONING_CONTEXT_TURN_LIMIT = SESSION_MEMORY_WINDOWS.internalRuntimeExchangeTurns;
const APP_VERSION = `0.1.0-p0-firewall-${RUNTIME_VERSION.p0FallbackFirewall ? "on" : "off"}`;
const PROMPT_MAX_HEIGHT_FALLBACK = 260;
const STRUCTURED_EVIDENCE_LIMIT = 5;
const KEYBOARD_VISUAL_VIEWPORT_DELTA = 120;
const chatHistory = [];
const contextTurns = [];
let dialogState = createDialogState();
let isResponding = false;
let currentAnswer = "";
let isContextOpen = false;
let lastDebugEvent = {
  route: "boot",
  intent: "boot",
  contextAction: "boot",
  answerSource: "boot",
  sanitizerChanged: false,
  latencyMs: 0,
  failureTag: "none"
};

const els = {
  form: document.querySelector("#chatForm"),
  prompt: document.querySelector("#prompt"),
  answer: document.querySelector("#answer"),
  status: document.querySelector("#status"),
  contextPanel: document.querySelector("#contextPanel"),
  contextList: document.querySelector("#contextList"),
  contextToggle: document.querySelector("#contextToggle")
};

const NORMALIZE_PUNCTUATION = /[\s\-＿_—–~～`"'“”‘’.,，。!?！？:：;；、()[\]{}<>《》「」『』]/g;
const IDENTITY_REPETITION_PATTERN =
  /(鳄鱼|对话框|你是谁|你是什么|谁是|名字|叫你|叫我|机器人|只是个对话框|什么项目|efish|another|other)/i;

function normalizePrompt(text) {
  return text.toLowerCase().replace(NORMALIZE_PUNCTUATION, "").trim();
}

function thinkingProfileFor(text) {
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

function setThinking(isThinking, mode = "") {
  els.status.hidden = !isThinking;
  els.status.classList.toggle("is-thinking", isThinking);
  els.form.classList.toggle("is-thinking", isThinking);
  document.documentElement.classList.toggle("is-thinking", isThinking);
  document.documentElement.classList.toggle("is-deep-thinking", isThinking && mode === "deep");
}

function setAnswer(text) {
  currentAnswer = text;
  els.answer.hidden = !text || isContextOpen;
  els.answer.textContent = text;
}

function renderContext() {
  const fragment = document.createDocumentFragment();
  for (const turn of contextTurns.slice(-VISIBLE_CONTEXT_TURN_LIMIT)) {
    const item = document.createElement("article");
    item.className = "turn";

    const question = document.createElement("p");
    question.className = "turn-question";
    question.textContent = turn.question;

    const answer = document.createElement("p");
    answer.className = "turn-answer";
    answer.textContent = turn.answer;

    item.append(question, answer);
    fragment.append(item);
  }

  els.contextList.replaceChildren(fragment);
  requestAnimationFrame(() => {
    els.contextPanel.scrollTop = els.contextPanel.scrollHeight;
  });
}

function rememberTurn(question, answer, intent) {
  contextTurns.push({ question, answer, intent });
  if (contextTurns.length > REASONING_CONTEXT_TURN_LIMIT) {
    contextTurns.splice(0, contextTurns.length - REASONING_CONTEXT_TURN_LIMIT);
  }
  chatHistory.push({ role: "user", content: question }, { role: "assistant", content: answer });
  if (chatHistory.length > REASONING_CONTEXT_TURN_LIMIT * 2) {
    chatHistory.splice(0, chatHistory.length - REASONING_CONTEXT_TURN_LIMIT * 2);
  }
  renderContext();
}

function currentReasoningState() {
  const internalSessionMemory = buildInternalSessionMemory({ contextTurns });
  const compact_state = buildCompactStateFromTurns(
    compactExtractionTurnsFromState({ contextTurns }),
    dialogState.compact_state || dialogState.compactState || {}
  );
  return {
    ...dialogState,
    recentTurns: rawRuntimeTurnsFromState({ contextTurns }, RAW_RUNTIME_CONTEXT_TURN_LIMIT),
    visibleRecentTurns: visibleTurnsFromState({ contextTurns }, VISIBLE_CONTEXT_TURN_LIMIT),
    internalSessionMemory,
    modelUsableSessionTurns: modelUsableTurnsFromSession({ contextTurns }),
    compact_state,
    compactState: compact_state
  };
}

function contextActionForIntent(intent, route) {
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
  if (intent.startsWith("help_")) return "ANSWER_HELP";
  if (intent.startsWith("surface_identity_")) return "SURFACE_IDENTITY";
  if (intent === "relation_between_us") return "ANSWER_RELATION_BOUNDARY";
  if (intent === "relation_statement") return "ANSWER_RELATION_STATEMENT";
  if (intent === "relation_memory_boundary") return "ANSWER_MEMORY_BOUNDARY";
  if (intent === "rewrite_short") return "SHORTEN_TEXT";
  if (/privacy/.test(intent)) return "REFUSE_PRIVACY";
  if (/unknown|suspicious/.test(intent)) return "ANSWER_WITH_UNCERTAINTY";
  if (route === "fallback") return "FALLBACK";
  return "ANSWER_LOCAL";
}

function commitAnswer(question, answer, intent, previousState = dialogState, meta = {}) {
  const finalized = finalizeWithFallbackFirewall({
    query: question,
    state: previousState,
    candidateAnswer: answer,
    intent,
    route: meta.route || "unknown",
    trace: {
      answerSource: meta.answerSource || meta.route || "unknown",
      questionType: meta.questionType || "",
      question_type: meta.questionType || "",
      operation: meta.operation || meta.contextAction || ""
    }
  });
  const finalIntent = finalized.intent || intent;
  const route = finalized.route || meta.route || "unknown";
  const finalAnswer = sanitizeSurfaceIdentity(finalized.answer, question);
  const latencyMs = meta.startedAt ? performance.now() - meta.startedAt : 0;
  lastDebugEvent = {
    route,
    intent: finalIntent,
    contextAction: meta.contextAction || contextActionForIntent(finalIntent, route),
    answerSource: meta.answerSource || route,
    sanitizerChanged: finalAnswer !== String(answer || "").trim(),
    latencyMs,
    failureTag: finalized.firewall?.reason || meta.failureTag || "none",
    fallbackFirewall: finalized.firewall || null
  };
  setAnswer(finalAnswer);
  rememberTurn(question, finalAnswer, finalIntent);
  dialogState = nextDialogState(question, finalAnswer, finalIntent, previousState);
}

function setContextOpen(isOpen) {
  isContextOpen = isOpen;
  els.contextPanel.hidden = !isOpen;
  els.answer.hidden = !currentAnswer || isOpen;
  els.contextToggle.setAttribute("aria-expanded", String(isOpen));
  els.contextToggle.setAttribute("aria-label", isOpen ? "收起上下文" : "展开上下文");
  document.documentElement.classList.toggle("context-open", isOpen);
  if (isOpen) renderContext();
}

function autosize() {
  const maxHeight = Number.parseFloat(getComputedStyle(els.prompt).maxHeight) || PROMPT_MAX_HEIGHT_FALLBACK;
  els.prompt.style.height = "auto";
  els.prompt.style.height = `${Math.min(els.prompt.scrollHeight, maxHeight)}px`;
}

function updateViewportMetrics() {
  const root = document.documentElement;
  const viewport = window.visualViewport;
  const width = viewport?.width || window.innerWidth;
  const height = viewport?.height || window.innerHeight;
  const offsetTop = viewport?.offsetTop || 0;
  const layoutHeight = window.innerHeight;
  const screenHeight = window.screen?.height || layoutHeight;
  const promptFocused = document.activeElement === els.prompt;
  const keyboardOpen =
    promptFocused &&
    (height < layoutHeight - KEYBOARD_VISUAL_VIEWPORT_DELTA ||
      height < screenHeight - KEYBOARD_VISUAL_VIEWPORT_DELTA ||
      height < screenHeight * 0.78);
  const chatTopRatio = keyboardOpen ? 0.56 : 0.5;

  root.style.setProperty("--app-width", `${Math.round(width)}px`);
  root.style.setProperty("--app-height", `${Math.round(height)}px`);
  root.style.setProperty("--chat-top", `${Math.round(offsetTop + height * chatTopRatio)}px`);
  root.classList.toggle("keyboard-open", keyboardOpen);
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
    decision
  };
}

async function submitPrompt(event) {
  event.preventDefault();
  if (isResponding) return;

  const text = els.prompt.value.trim();
  if (!text) return;

  isResponding = true;
  const startedAt = performance.now();
  els.prompt.value = "";
  autosize();
  setAnswer("");
  const thinking = thinkingProfileFor(text);
  setThinking(true, thinking.mode);

  try {
    await new Promise((resolve) => setTimeout(resolve, thinking.delay));

    const reasoningState = currentReasoningState();
    const operationAnswer = answerWithOperationLayer(text, reasoningState);
    if (operationAnswer?.answer) {
      commitAnswer(text, operationAnswer.answer, operationAnswer.intent, reasoningState, {
        route: "operation",
        answerSource: "operation_layer",
        contextAction: operationAnswer.contextAction,
        operation: operationAnswer.operation,
        questionType: operationAnswer.questionType,
        startedAt
      });
      return;
    }

    const intent = detectIntent(text, reasoningState);
    const directAnswer = directAnswerForResolvedIntent(intent, text, reasoningState);
    if (directAnswer) {
      commitAnswer(text, directAnswer, intent, reasoningState, {
        route: "direct",
        answerSource: "direct",
        startedAt
      });
      return;
    }

    const tinyAnswer = answerWithTinyRouter(text, reasoningState);
    if (tinyAnswer?.answer) {
      commitAnswer(text, tinyAnswer.answer, tinyAnswer.intent, reasoningState, {
        route: "tiny_router",
        answerSource: "tiny_router",
        startedAt
      });
      return;
    }

    const structuredAnswer = answerWithStructuredDecision(text, reasoningState);
    if (structuredAnswer?.answer) {
      commitAnswer(text, structuredAnswer.answer, structuredAnswer.intent, reasoningState, {
        route: "structured",
        answerSource: "structured_decision",
        contextAction: structuredAnswer.decision?.route || "STRUCTURED_DECISION",
        operation: structuredAnswer.decision?.route || "structured_decision",
        questionType: structuredAnswer.decision?.route || "structured_decision",
        startedAt
      });
      return;
    }

    const answer = fallbackForIntent(intent, text);
    commitAnswer(text, answer, intent, reasoningState, {
      route: "fallback",
      answerSource: "fallback",
      startedAt
    });
  } catch (error) {
    console.error(error);
    setAnswer("我卡住了。也许只是恰好忘记了。");
    lastDebugEvent = {
      route: "error",
      intent: "error",
      contextAction: "ERROR",
      answerSource: "error",
      sanitizerChanged: false,
      latencyMs: performance.now() - startedAt,
      failureTag: "runtime_error"
    };
  } finally {
    isResponding = false;
    setThinking(false);
    els.prompt.focus();
  }
}

els.form.addEventListener("submit", submitPrompt);
els.contextToggle.addEventListener("click", () => {
  setContextOpen(els.contextPanel.hidden);
});
els.prompt.addEventListener("input", autosize);
els.prompt.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    els.form.requestSubmit();
  }
});

window.exportAnotherBrainDebugReport = function exportAnotherBrainDebugReport(options = {}) {
  const report = buildDebugReport({
    appVersion: APP_VERSION,
    commit: document.documentElement.dataset.commit || RUNTIME_VERSION.commit || "local",
    modelVersion: `tiny-router:${TINY_ROUTER_STATS.examples || 0}`,
    lastEvent: lastDebugEvent,
    transcript: contextTurns,
    includeTranscript: Boolean(options.includeTranscript),
    visibleContextTurnLimit: VISIBLE_CONTEXT_TURN_LIMIT,
    rawRuntimeContextTurnLimit: RAW_RUNTIME_CONTEXT_TURN_LIMIT,
    internalCompactContextTurnLimit: REASONING_CONTEXT_TURN_LIMIT
  });
  if (options.download !== false) downloadDebugReport(report);
  return report;
};

window.addEventListener("keydown", (event) => {
  if (event.altKey && event.shiftKey && event.key.toLowerCase() === "d") {
    event.preventDefault();
    window.exportAnotherBrainDebugReport({ includeTranscript: false });
  }
});

window.addEventListener("resize", updateViewportMetrics);
window.addEventListener("orientationchange", () => {
  requestAnimationFrame(updateViewportMetrics);
});
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", updateViewportMetrics);
  window.visualViewport.addEventListener("scroll", updateViewportMetrics);
}
els.prompt.addEventListener("focus", () => {
  requestAnimationFrame(updateViewportMetrics);
  window.setTimeout(updateViewportMetrics, 260);
});
els.prompt.addEventListener("blur", () => {
  requestAnimationFrame(updateViewportMetrics);
  window.setTimeout(updateViewportMetrics, 120);
});

updateViewportMetrics();
autosize();
setContextOpen(false);
