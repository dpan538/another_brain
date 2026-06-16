import { selectResponseMode } from "./response_mode_manager.js";
import { classifyUserTurn } from "./user_turn_classifier.js";
import { resolveContextualQuestion } from "./contextual_question_resolver.js";
import { updateTopicStack, activeTopic } from "./topic_stack.js";
import { makeAnswerPlan } from "./answer_plan.js";
import { selectAnswerDensity } from "./answer_density_policy.js";
import { formatMobileAnswer } from "./mobile_answer_formatter.js";
import { detectRepeatAnswer, rewriteForNonRepeat } from "./answer_deduper.js";
import { finalizeWithFallbackFirewall } from "./fallback_firewall.js";
import { sanitizeSurfaceIdentity } from "./surface_identity.js";

function clean(text) {
  return String(text || "").trim();
}

function controllerModeFromLegacy(legacy = "", query = "") {
  if (legacy === "followup_answer") return "contextual_answer";
  if (["simplify_last_answer", "rewrite_last_answer", "expand_last_answer"].includes(legacy)) return "transform_last_answer";
  if (legacy === "fallback_repair") return "repair_last_answer";
  if (legacy === "specific_clarification") return "specific_clarification";
  if (legacy === "help_how_to_ask") return "help_how_to_ask";
  if (legacy === "quiet_affordance") return "quiet_affordance";
  if (legacy === "boundary_answer") return "boundary_answer";
  if (legacy === "bounded_unknown") return "bounded_unknown";
  if (legacy === "solver_answer") return "direct_answer";
  if (legacy === "culture_answer") return /^(他|他的|这|那|这些)/.test(query) ? "contextual_answer" : "direct_answer";
  return "direct_answer";
}

function answerStyleFromDraft(draft = {}, controllerMode = "") {
  if (controllerMode === "transform_last_answer") return "summary";
  if (["works_list", "representative_works", "author_list", "representative_authors", "listen_recommendation"].includes(draft.questionType)) return "list";
  if (/compare/.test(draft.questionType || "")) return "comparison";
  if (/operation_|solver|arithmetic|syllogism|comparison/.test(draft.intent || "")) return "solver";
  if (draft.contextAction === "ANSWER_CULTURE" || draft.intent === "culture_awareness" || /^music_|overview|works_list|author_list/.test(draft.questionType || "")) return "culture";
  return "direct";
}

function responseTypeFromMode(controllerMode = "") {
  if (controllerMode === "quiet_affordance") return "ui_affordance";
  if (controllerMode === "repair_last_answer") return "repair";
  if (controllerMode === "specific_clarification") return "clarification";
  if (controllerMode === "boundary_answer") return "boundary";
  return "answer";
}

function boundTargetsFrom({ binding = {}, draft = {}, session = {} } = {}) {
  const ids = [];
  if (Array.isArray(binding.target_ids)) ids.push(...binding.target_ids);
  if (Array.isArray(draft.cards)) ids.push(...draft.cards.filter((id) => /person\.|author\.|work\./.test(id)));
  if (Array.isArray(session.activeEntityIds)) ids.push(...session.activeEntityIds);
  if (draft.questionType === "music_representativeness" || draft.questionType === "music_characteristics") ids.unshift("person.luo_dayou");
  return [...new Set(ids.filter(Boolean))].slice(0, 8);
}

export function handleConversationTurn({ query = "", session = {}, runtimeProfile = "standard", uiProfile = "mobile", draftResolver = null } = {}) {
  const text = clean(query);
  const userTurn = classifyUserTurn({ query: text, session });
  const binding = resolveContextualQuestion({ query: text, session });
  const modeDecision = selectResponseMode({ query: text, session, trace: { binding, userTurn } });
  const legacyMode = modeDecision?.mode || "direct_answer";
  const controllerMode = controllerModeFromLegacy(legacyMode, text);
  const draftState = {
    ...session,
    r19_binding: binding,
    r19_response_mode: controllerMode,
    r19_user_turn_kind: userTurn.kind
  };
  const draft = draftResolver ? draftResolver(text, draftState) : null;

  if (draft?.type === "ui_affordance") {
    const trace = {
      user_turn_kind: userTurn.kind,
      response_type: "ui_affordance",
      response_mode: "quiet_affordance",
      legacy_response_mode: legacyMode,
      answer_style: "affordance",
      question_type: draft.questionType || userTurn.kind || "",
      operation: draft.operation || "quiet_affordance",
      binding,
      active_topic: activeTopic(session) || null,
      density_policy: {},
      dedupe: {},
      verifier: {},
      finalizer: { skipped: true, reason: "ui_affordance_not_answer" },
      webgpu_assist: { available: false, authoritative: false }
    };
    return {
      response: {
        type: "ui_affordance",
        answer: "",
        affordance: draft.affordance,
        trace,
        persist_as_assistant_message: false,
        count_as_exchange_turn: false
      },
      nextSession: {},
      trace,
      resolved: { ...draft, responseMode: modeDecision, controllerMode, answerStyle: "affordance", binding },
      finalized: null
    };
  }

  const rawDraft = draft?.answer || "我没接住这个问题。你可以直接说对象和方向。";
  const finalized = finalizeWithFallbackFirewall({
    query: text,
    state: session,
    candidateAnswer: rawDraft,
    intent: draft?.intent || "conversation_controller",
    route: draft?.route || "conversation_controller",
    trace: {
      intent: draft?.intent || "",
      route: draft?.route || "",
      questionType: draft?.questionType || "",
      question_type: draft?.questionType || "",
      operation: draft?.operation || "",
      response_mode: legacyMode,
      controller_response_mode: controllerMode
    }
  });
  const sanitized = sanitizeSurfaceIdentity(finalized.answer, text);
  const answerStyle = answerStyleFromDraft(draft, controllerMode);
  const density = selectAnswerDensity({ responseMode: controllerMode, answerStyle, uiProfile, query: text, session });
  const boundTargets = boundTargetsFrom({ binding, draft, session });
  const plan = makeAnswerPlan({
    domain: session.activeDomain || session.lastDomain || draft?.culture?.compactStatePatch?.last_domain || "",
    questionType: draft?.questionType || "",
    operation: draft?.operation || "",
    responseMode: controllerMode,
    answerStyle,
    boundTargets,
    evidenceIds: draft?.cards || [],
    mobileDensity: density
  });
  let finalAnswer = formatMobileAnswer({ answer: sanitized, density, plan, query: text });
  const dedupe = detectRepeatAnswer({ answer: finalAnswer, session, plan });
  if (dedupe.repeated && !/重复|原样|再说一遍/.test(text)) {
    const rewritten = rewriteForNonRepeat({ answer: finalAnswer, session, plan, query: text });
    finalAnswer = formatMobileAnswer({ answer: rewritten, density, plan, query: text });
    dedupe.rewritten = true;
    dedupe.rewrite_answer = finalAnswer;
  }

  const topicStack = updateTopicStack({
    session,
    query: text,
    boundReferents: boundTargets,
    domain: session.activeDomain || draft?.culture?.compactStatePatch?.last_domain || "",
    operation: draft?.operation || ""
  });
  const trace = {
    user_turn_kind: userTurn.kind,
    response_type: responseTypeFromMode(controllerMode),
    response_mode: controllerMode,
    legacy_response_mode: legacyMode,
    answer_style: answerStyle,
    question_type: draft?.questionType || "",
    operation: draft?.operation || "",
    binding,
    active_topic: topicStack[0] || null,
    density_policy: density,
    answer_plan: plan,
    dedupe,
    verifier: draft?.verifier || draft?.culture?.verifier || {},
    finalizer: { route: finalized.route || draft?.route || "", fallback_firewall: finalized.firewall || null },
    webgpu_assist: { available: false, authoritative: false, runtime_profile: runtimeProfile }
  };

  return {
    response: {
      type: "answer",
      answer: finalAnswer,
      trace,
      intent: finalized.intent || draft?.intent || "conversation_controller",
      route: finalized.route || draft?.route || "conversation_controller",
      persist_as_assistant_message: true,
      count_as_exchange_turn: true
    },
    nextSession: {
      active_topic_stack: topicStack,
      last_answer_signature: plan.semantic_signature,
      last_answer_plan_id: plan.plan_id,
      last_bound_referent_ids: boundTargets
    },
    trace,
    resolved: {
      ...(draft || {}),
      responseMode: modeDecision,
      controllerMode,
      answerStyle,
      responseType: responseTypeFromMode(controllerMode),
      binding,
      densityPolicy: density,
      answerPlan: plan,
      dedupe,
      activeTopicStack: topicStack
    },
    finalized: {
      ...finalized,
      answer: finalAnswer
    }
  };
}
