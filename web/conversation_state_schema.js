import { bareFallbackId, mentionsGenericFallback } from "./generic_fallback_classifier.js";
import { detectMethodLeak } from "./method_leak_verifier.js";
import { detectCultureDomain, resolveCultureEntity } from "./culture_runtime.js";

export const LAST_ANSWER_QUALITY = Object.freeze({
  ACCEPTED: "accepted",
  ACCEPTED_BUT_TOO_GENERIC: "accepted_but_too_generic",
  BAD_FALLBACK: "bad_fallback",
  FIREWALL_REWRITTEN: "firewall_rewritten",
  VERIFIER_REJECTED: "verifier_rejected",
  BOUNDED_UNKNOWN: "bounded_unknown",
  UI_AFFORDANCE: "ui_affordance",
  NOT_ANSWER: "not_answer"
});

export const LAST_REPAIRABLE_ERROR = Object.freeze({
  NONE: "none",
  ASK_REQUIRED_ON_QUESTION: "ask_required_on_question",
  BARE_WHICH_SIDE: "bare_which_side",
  EXTERNAL_UNKNOWN_ON_ENTITY: "external_unknown_on_entity",
  WRONG_REFERENT: "wrong_referent",
  TOO_GENERIC: "too_generic",
  WRONG_DOMAIN: "wrong_domain",
  METHOD_LEAK: "method_leak",
  UNSUPPORTED_ANSWER: "unsupported_answer"
});

function clean(text) {
  return String(text || "").trim();
}

function summarize(answer) {
  return clean(answer)
    .replace(/\s+/g, " ")
    .slice(0, 140);
}

function mergeUnique(...lists) {
  return [...new Set(lists.flat().filter(Boolean))];
}

function inferActiveFromText(text) {
  const source = clean(text);
  const cards = resolveCultureEntity(source, {}).filter((card) => (card.names || []).some((name) => source.includes(name)));
  const entityIds = cards.filter((card) => card.entity_type === "person" || /^person\.|^author\./.test(card.id)).map((card) => card.id);
  const workIds = cards.filter((card) => card.entity_type === "work" || /^work\./.test(card.id)).map((card) => card.id);
  const domainCard = cards.find((card) => card.entity_type !== "concept");
  const detectedDomain = detectCultureDomain(source, {});
  const domain = domainCard?.domain || (detectedDomain !== "generic" ? detectedDomain : "");

  return { entityIds, workIds, domain };
}

export function inferActiveConversationFields({ query = "", answer = "", trace = {}, previousState = {} } = {}) {
  const fromQuery = inferActiveFromText(query);
  const fromAnswer = inferActiveFromText(answer);
  const patch = trace?.compactStatePatch || trace?.culture?.compactStatePatch || {};
  const focus = patch.last_focus_entity_id || previousState.last_focus_entity_id || "";
  const mentions = Array.isArray(patch.last_mentions) ? patch.last_mentions : Array.isArray(previousState.last_mentions) ? previousState.last_mentions : [];

  const activeEntityIds = mergeUnique(
    fromQuery.entityIds,
    fromAnswer.entityIds,
    Array.isArray(previousState.activeEntityIds) ? previousState.activeEntityIds : [],
    focus ? [focus] : [],
    focus ? [] : mentions.filter((id) => /person\.|author\./.test(id))
  ).slice(0, 6);

  const activeWorkIds = mergeUnique(
    fromQuery.workIds,
    fromAnswer.workIds,
    Array.isArray(previousState.activeWorkIds) ? previousState.activeWorkIds : [],
    Array.isArray(patch.last_works) ? patch.last_works : [],
    Array.isArray(previousState.last_works) ? previousState.last_works : []
  ).slice(0, 8);

  const activeDomain =
    fromQuery.domain ||
    fromAnswer.domain ||
    patch.last_domain ||
    previousState.activeDomain ||
    previousState.last_domain ||
    "";

  return { activeEntityIds, activeWorkIds, activeDomain };
}

export function classifyLastAnswerQuality({ query = "", answer = "", route = "", verifier = null, firewall = null, trace = {}, previousState = {} } = {}) {
  const text = clean(answer);
  if (!text) return { quality: LAST_ANSWER_QUALITY.NOT_ANSWER, repairableError: LAST_REPAIRABLE_ERROR.NONE };
  if (trace?.response_type === "ui_affordance" || route === "affordance") {
    return { quality: LAST_ANSWER_QUALITY.UI_AFFORDANCE, repairableError: LAST_REPAIRABLE_ERROR.NONE };
  }
  if (bareFallbackId(text)) {
    const id = bareFallbackId(text);
    return {
      quality: LAST_ANSWER_QUALITY.BAD_FALLBACK,
      repairableError:
        id === "ask_required"
          ? LAST_REPAIRABLE_ERROR.ASK_REQUIRED_ON_QUESTION
          : id === "which_side"
            ? LAST_REPAIRABLE_ERROR.BARE_WHICH_SIDE
            : id === "external_event_unknown"
              ? LAST_REPAIRABLE_ERROR.EXTERNAL_UNKNOWN_ON_ENTITY
              : LAST_REPAIRABLE_ERROR.TOO_GENERIC
    };
  }
  if (mentionsGenericFallback(text).length && /我刚才没有接住问题|你可以直接说对象和方向/.test(text)) {
    return { quality: LAST_ANSWER_QUALITY.FIREWALL_REWRITTEN, repairableError: LAST_REPAIRABLE_ERROR.TOO_GENERIC };
  }
  if (firewall?.rewrite_required || route === "fallback_firewall") {
    return { quality: LAST_ANSWER_QUALITY.FIREWALL_REWRITTEN, repairableError: LAST_REPAIRABLE_ERROR.TOO_GENERIC };
  }
  if (verifier && verifier.ok === false) {
    return { quality: LAST_ANSWER_QUALITY.VERIFIER_REJECTED, repairableError: LAST_REPAIRABLE_ERROR.UNSUPPORTED_ANSWER };
  }
  const active = inferActiveConversationFields({ query, answer, trace, previousState });
  const leak = detectMethodLeak({
    query,
    answer,
    domain: active.activeDomain || trace.domain || "",
    questionType: trace.questionType || trace.question_type || ""
  });
  if (!leak.ok) {
    return { quality: LAST_ANSWER_QUALITY.ACCEPTED_BUT_TOO_GENERIC, repairableError: LAST_REPAIRABLE_ERROR.METHOD_LEAK };
  }
  if (/不知道|没有足够|覆盖不足/.test(text)) {
    return { quality: LAST_ANSWER_QUALITY.BOUNDED_UNKNOWN, repairableError: LAST_REPAIRABLE_ERROR.NONE };
  }
  if (/玄学结论|对象和方向|没接住/.test(text)) {
    return { quality: LAST_ANSWER_QUALITY.ACCEPTED_BUT_TOO_GENERIC, repairableError: LAST_REPAIRABLE_ERROR.TOO_GENERIC };
  }
  return { quality: LAST_ANSWER_QUALITY.ACCEPTED, repairableError: LAST_REPAIRABLE_ERROR.NONE };
}

export function makeConversationStatePatch({
  lastUserQuery = "",
  lastAssistantAnswer = "",
  lastAnswerSource = "",
  lastAnswerQuality = "",
  lastResponseMode = "",
  lastResponseType = "",
  lastAnswerStyle = "",
  lastQuestionType = "",
  lastOperation = "",
  lastDomain = "",
  activeEntityIds = [],
  activeWorkIds = [],
  activeListIds = [],
  activeComparisonIds = [],
  activeReferents = [],
  activeTopicStack = [],
  activeDomain = "",
  lastAnswerSummary = "",
  lastRepairableError = "",
  lastVerifierReasons = [],
  lastBoundaryKind = "",
  lastClarificationCandidates = [],
  lastBoundReferentIds = [],
  lastAnswerSources = [],
  lastAnswerSignature = "",
  lastAnswerPlanId = "",
  userCorrections = [],
  declarationSignals = [],
  explicitUserPreferences = [],
  memoryPromotionCandidates = [],
  sessionFlags = {}
} = {}) {
  const userQuery = clean(lastUserQuery);
  const answer = clean(lastAssistantAnswer);
  return {
    lastUserQuery: userQuery,
    last_user_query_raw: userQuery,
    last_user_query_summary: userQuery.slice(0, 120),
    lastAssistantAnswer: answer,
    last_assistant_answer_raw: answer,
    lastAnswerSource: clean(lastAnswerSource),
    lastAnswerQuality: lastAnswerQuality || LAST_ANSWER_QUALITY.ACCEPTED,
    lastResponseMode: lastResponseMode || "direct_answer",
    last_response_mode: lastResponseMode || "direct_answer",
    lastResponseType: lastResponseType || "answer",
    last_response_type: lastResponseType || "answer",
    lastAnswerStyle: lastAnswerStyle || "direct",
    last_answer_style: lastAnswerStyle || "direct",
    lastQuestionType: clean(lastQuestionType),
    last_question_type: clean(lastQuestionType),
    lastOperation: clean(lastOperation),
    last_operation: clean(lastOperation),
    lastDomain: clean(lastDomain || activeDomain),
    activeEntityIds: Array.isArray(activeEntityIds) ? activeEntityIds.slice(0, 8) : [],
    active_entity_ids: Array.isArray(activeEntityIds) ? activeEntityIds.slice(0, 8) : [],
    activeWorkIds: Array.isArray(activeWorkIds) ? activeWorkIds.slice(0, 8) : [],
    active_work_ids: Array.isArray(activeWorkIds) ? activeWorkIds.slice(0, 8) : [],
    active_list_ids: Array.isArray(activeListIds) ? activeListIds.slice(0, 8) : [],
    active_comparison_ids: Array.isArray(activeComparisonIds) ? activeComparisonIds.slice(0, 8) : [],
    active_referents: Array.isArray(activeReferents) ? activeReferents.slice(0, 8) : [],
    active_topic_stack: Array.isArray(activeTopicStack) ? activeTopicStack.slice(0, 4) : [],
    activeDomain: clean(activeDomain || lastDomain),
    active_domain: clean(activeDomain || lastDomain),
    lastAnswerSummary: lastAnswerSummary || summarize(lastAssistantAnswer),
    last_assistant_answer_summary: lastAnswerSummary || summarize(lastAssistantAnswer),
    lastRepairableError: lastRepairableError || LAST_REPAIRABLE_ERROR.NONE,
    last_repairable_error: lastRepairableError || LAST_REPAIRABLE_ERROR.NONE,
    lastVerifierReasons: Array.isArray(lastVerifierReasons) ? lastVerifierReasons.slice(0, 8) : []
    ,
    last_verifier_reasons: Array.isArray(lastVerifierReasons) ? lastVerifierReasons.slice(0, 8) : [],
    last_boundary_kind: clean(lastBoundaryKind),
    last_clarification_candidates: Array.isArray(lastClarificationCandidates) ? lastClarificationCandidates.slice(0, 4) : [],
    last_bound_referent_ids: Array.isArray(lastBoundReferentIds) ? lastBoundReferentIds.slice(0, 8) : [],
    last_answer_sources: Array.isArray(lastAnswerSources) ? lastAnswerSources.slice(0, 8) : [],
    last_answer_signature: clean(lastAnswerSignature),
    last_answer_plan_id: clean(lastAnswerPlanId),
    user_corrections: Array.isArray(userCorrections) ? userCorrections.slice(-8) : [],
    declaration_signals: Array.isArray(declarationSignals) ? declarationSignals.slice(-8) : [],
    explicit_user_preferences: Array.isArray(explicitUserPreferences) ? explicitUserPreferences.slice(-8) : [],
    memory_promotion_candidates: Array.isArray(memoryPromotionCandidates) ? memoryPromotionCandidates.slice(-4) : [],
    session_flags: {
      last_turn_was_explicitly_challenged: Boolean(sessionFlags.last_turn_was_explicitly_challenged),
      last_turn_was_accepted: sessionFlags.last_turn_was_accepted !== false,
      ui_affordance_supported: sessionFlags.ui_affordance_supported !== false
    }
  };
}

export function buildConversationStatePatch({ query = "", answer = "", resolved = {}, finalized = {}, previousState = {} } = {}) {
  const trace = {
    ...(resolved || {}),
    ...(resolved?.culture || {}),
    ...(finalized || {})
  };
  const active = inferActiveConversationFields({ query, answer, trace, previousState });
  const quality = classifyLastAnswerQuality({
    query,
    answer,
    route: finalized.route || resolved.route || "",
    verifier: resolved.verifier || resolved.culture?.verifier?.shared || null,
    firewall: finalized.firewall || null,
    trace,
    previousState
  });
  return makeConversationStatePatch({
    lastUserQuery: query,
    lastAssistantAnswer: answer,
    lastAnswerSource: finalized.route || resolved.route || "",
    lastAnswerQuality: resolved.lastAnswerQuality || quality.quality,
    lastResponseMode: resolved.responseMode?.mode || resolved.response_mode || resolved.mode || "direct_answer",
    lastResponseType: resolved.responseType || resolved.response_type || trace.response_type || "answer",
    lastAnswerStyle: resolved.answerStyle || resolved.answer_style || trace.answer_style || "direct",
    lastQuestionType: resolved.questionType || resolved.question_type || "",
    lastOperation: resolved.operation || "",
    lastDomain: active.activeDomain,
    activeEntityIds: active.activeEntityIds,
    activeWorkIds: active.activeWorkIds,
    activeListIds: resolved.activeListIds || resolved.active_list_ids || [],
    activeComparisonIds: resolved.activeComparisonIds || resolved.active_comparison_ids || [],
    activeReferents: resolved.binding?.target_ids || resolved.lastBoundReferentIds || [],
    activeTopicStack: resolved.activeTopicStack || resolved.active_topic_stack || [],
    activeDomain: active.activeDomain,
    lastAnswerSummary: summarize(answer),
    lastRepairableError: resolved.lastRepairableError || quality.repairableError,
    lastVerifierReasons: [
      ...(Array.isArray(resolved.verifier?.reasons) ? resolved.verifier.reasons : []),
      ...(Array.isArray(finalized.firewall?.second_pass?.reasons) ? finalized.firewall.second_pass.reasons : [])
    ],
    lastBoundaryKind: resolved.boundaryKind || "",
    lastClarificationCandidates: resolved.lastClarificationCandidates || [],
    lastBoundReferentIds: resolved.binding?.target_ids || resolved.lastBoundReferentIds || [],
    lastAnswerSources: [finalized.route || resolved.route || ""].filter(Boolean),
    lastAnswerSignature: resolved.answerPlan?.semantic_signature || resolved.lastAnswerSignature || "",
    lastAnswerPlanId: resolved.answerPlan?.plan_id || resolved.lastAnswerPlanId || "",
    sessionFlags: {
      last_turn_was_explicitly_challenged: /答偏|没接住|不是这个意思|不对|错了/.test(query),
      last_turn_was_accepted: quality.quality === LAST_ANSWER_QUALITY.ACCEPTED,
      ui_affordance_supported: true
    }
  });
}
