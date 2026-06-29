import { bareFallbackId, mentionsGenericFallback } from "./generic_fallback_classifier.js";
import { classifyUserTurn } from "./user_turn_classifier.js";
import { classifyTurnFunction } from "./turn_function_classifier.js";
import { detectCultureDomain, resolveCultureEntity } from "./culture_runtime.js";

export const RESPONSE_MODES = Object.freeze({
  DIRECT_ANSWER: "direct_answer",
  FOLLOWUP_ANSWER: "followup_answer",
  REWRITE_LAST_ANSWER: "rewrite_last_answer",
  SIMPLIFY_LAST_ANSWER: "simplify_last_answer",
  EXPAND_LAST_ANSWER: "expand_last_answer",
  FALLBACK_REPAIR: "fallback_repair",
  SPECIFIC_CLARIFICATION: "specific_clarification",
  HELP_HOW_TO_ASK: "help_how_to_ask",
  QUIET_AFFORDANCE: "quiet_affordance",
  BOUNDARY_ANSWER: "boundary_answer",
  BOUNDED_UNKNOWN: "bounded_unknown",
  SOLVER_ANSWER: "solver_answer",
  CULTURE_ANSWER: "culture_answer",
  PERSONA_METHOD_ANSWER: "persona_method_answer"
});

const BAD_QUALITY = new Set(["bad_fallback", "firewall_rewritten", "verifier_rejected", "accepted_but_too_generic"]);
const SIMPLIFY_RE = /(是否能简单一点|能不能简单|简单一点|简单点|再短一点|短一点|一句话|说简单点|说人话|别那么玄|别那么复杂)/;
const REWRITE_RE = /(换个说法|重新说|说清楚|更具体|别这样说|别这么玄|换一种说法|讲清楚一点)/;
const EXPAND_RE = /(展开一点|展开说|详细一点|再具体一点|说具体点|具体点|多说一点|继续展开)/;
const EXPLICIT_REPAIR_RE = /(什么发生过|发生过什么|哪一边|什么哪一边|我不是已经问了吗|不是已经问|我已经问|已经问了|你刚才答偏|你没接住|刚才没接住|不是这个意思|你又绕回|你说的哪一边是什么意思|你刚才说.{0,20}是什么意思|你刚才什么意思|你刚才说什么|为什么这么答|是不是答偏|是不是在绕圈)/;
const HARD_BOUNDARY_RE = /(身份证|手机号|电话号码|住址|地址|银行卡|密码|护照|签证|完整歌词|整首歌词|全文|原文|我想消失|不想活|自杀|自伤|伤害自己)/;
const SOLVER_RE = /(A比B|所有.+都是|所有.+都会|所有.+都不是|还剩|一共|总共|谁最高|谁最大|星期|weekday)/i;
const HELP_RE = /(我需要怎么提问|怎么提问|怎么问你|我该怎么问|我该怎么开始|怎么开始问)/;
const FOLLOWUP_RE = /(^他|他的|她的|它的|这首|这张|这本|这个|那个|这些|代表性|为什么重要|再说|再展开|展开|继续|特点|歌曲|歌|这些歌|代表在哪里|说具体点|总结主题|不要原文|不贴原文|而不是给原文)/;

function clean(text) {
  return String(text || "").trim();
}

function hasActiveTopic(session = {}) {
  return Boolean(
    session.activeDomain ||
      session.lastDomain ||
      session.last_domain ||
      session.last_focus_entity_id ||
      (Array.isArray(session.active_topic_stack) && session.active_topic_stack.length > 0) ||
      (Array.isArray(session.activeTopicStack) && session.activeTopicStack.length > 0) ||
      (Array.isArray(session.activeEntityIds) && session.activeEntityIds.length > 0) ||
      (Array.isArray(session.last_mentions) && session.last_mentions.length > 0)
  );
}

function lastAssistantAnswer(session = {}) {
  return clean(session.lastAssistantAnswer || session.lastAnswer || session.recentTurns?.at?.(-1)?.answer || "");
}

function previousNamedAlternatives(session = {}) {
  return /(你是问|是问).{1,50}(还是|或者)|专辑.*标题曲|作者.*作品/.test(lastAssistantAnswer(session));
}

function lastAnswerIsBad(session = {}) {
  const quality = session.lastAnswerQuality || "";
  const answer = lastAssistantAnswer(session);
  return BAD_QUALITY.has(quality) || Boolean(bareFallbackId(answer)) || mentionsGenericFallback(answer).length > 0;
}

function activeTopicEntityIds(session = {}) {
  const stack = Array.isArray(session.active_topic_stack) ? session.active_topic_stack : Array.isArray(session.activeTopicStack) ? session.activeTopicStack : [];
  return [
    ...(session.activeEntityIds || []),
    ...(session.active_entity_ids || []),
    ...(session.last_focus_entity_id ? [session.last_focus_entity_id] : []),
    ...(session.last_mentions || []).filter((id) => /person\.|author\./.test(id)),
    ...stack.flatMap((topic) => topic.entity_ids || [])
  ].filter(Boolean);
}

function activeCultureFollowup(query, session = {}) {
  return activeTopicEntityIds(session).length > 0 && /(^他|他的|她的|它的|这些|这首|这本|代表性|特点|代表在哪里|为什么重要|共同点|作品|歌曲|歌)/.test(query);
}

function comparisonEntryFollowup(query, session = {}) {
  const stack = Array.isArray(session.active_topic_stack) ? session.active_topic_stack : Array.isArray(session.activeTopicStack) ? session.activeTopicStack : [];
  const ids = new Set([...activeTopicEntityIds(session), ...stack.flatMap((topic) => topic.entity_ids || [])]);
  const hasPair = ids.size >= 2;
  return hasPair && /(谁|哪一位|哪个).{0,8}(更适合|适合).{0,6}(入门|开始)|更适合入门/.test(query);
}

function cultureCandidate(query, session = {}) {
  if (/(什么关系|有什么关系|关系是什么)/.test(query)) {
    const explicitCultureTargets = resolveCultureEntity(query, {})
      .filter((card) => (card.names || []).some((name) => query.includes(name)))
      .filter((card) => card.entity_type !== "concept");
    const hasExplicitRelation = explicitCultureTargets.some((card) => card.entity_type === "relation" || /^relation\./.test(card.id || ""));
    const concreteTargets = explicitCultureTargets.filter((card) => /^(person|author|work)\./.test(card.id || "") || ["person", "author", "work"].includes(card.entity_type));
    if (!hasExplicitRelation && concreteTargets.length < 2) return false;
  }
  if (detectCultureDomain(query, session) !== "generic") return true;
  return resolveCultureEntity(query, session).some((card) => card && card.entity_type !== "concept");
}

export function selectResponseMode({ query, session = {}, trace = {} } = {}) {
  const text = clean(query);
  const userTurn = classifyUserTurn({ query: text, session, trace });
  const turnFunction = classifyTurnFunction({ query: text, session, userTurn, binding: trace?.binding || {} });
  const reasons = [];

  if (!text) {
    return { mode: RESPONSE_MODES.QUIET_AFFORDANCE, confidence: 0.9, reasons: ["empty_input"], userTurn };
  }

  const safeSummaryFollowup = /(总结主题|不要原文|不贴原文|而不是给原文|但不要原文)/.test(text) && hasActiveTopic(session);
  if (HARD_BOUNDARY_RE.test(text) && !safeSummaryFollowup) {
    return { mode: RESPONSE_MODES.BOUNDARY_ANSWER, confidence: 0.96, reasons: ["hard_boundary"], userTurn };
  }

  const explicitRepair = EXPLICIT_REPAIR_RE.test(text);
  if ((explicitRepair || userTurn.kind === "fallback_repair") && lastAnswerIsBad(session)) {
    return {
      mode: RESPONSE_MODES.FALLBACK_REPAIR,
      confidence: 0.94,
      reasons: [explicitRepair ? "explicit_repair_after_bad_answer" : "classified_repair_after_bad_answer"],
      should_skip_repair: false,
      userTurn
    };
  }

  if (["analogy_statement", "affective_disclosure", "compliment", "deepening_invitation"].includes(turnFunction.turn_function)) {
    return {
      mode: RESPONSE_MODES.DIRECT_ANSWER,
      confidence: turnFunction.confidence || 0.82,
      reasons: [`turn_function_${turnFunction.turn_function}`],
      should_skip_repair: true,
      userTurn,
      turnFunction
    };
  }

  if (SIMPLIFY_RE.test(text) && lastAssistantAnswer(session)) {
    return {
      mode: RESPONSE_MODES.SIMPLIFY_LAST_ANSWER,
      confidence: 0.95,
      reasons: ["explicit_simplify_last_answer"],
      should_skip_repair: true,
      userTurn
    };
  }

  if (REWRITE_RE.test(text) && lastAssistantAnswer(session)) {
    return {
      mode: RESPONSE_MODES.REWRITE_LAST_ANSWER,
      confidence: 0.92,
      reasons: ["explicit_rewrite_last_answer"],
      should_skip_repair: true,
      userTurn
    };
  }

  if (EXPAND_RE.test(text) && lastAssistantAnswer(session)) {
    return {
      mode: RESPONSE_MODES.EXPAND_LAST_ANSWER,
      confidence: 0.86,
      reasons: ["explicit_expand_last_answer"],
      should_skip_repair: true,
      userTurn
    };
  }

  if (turnFunction.turn_function === "confirmation" && hasActiveTopic(session)) {
    return {
      mode: RESPONSE_MODES.FOLLOWUP_ANSWER,
      confidence: 0.9,
      reasons: ["turn_function_confirmation_with_active_topic"],
      should_skip_repair: true,
      userTurn,
      turnFunction
    };
  }

  if (
    [
      "evaluation_request",
      "recommendation_request",
      "abstract_comparison",
      "cross_domain_comparison",
      "list_request",
      "interpretive_question",
      "boundary_clarification",
      "identity_probe"
    ].includes(turnFunction.turn_function)
  ) {
    return {
      mode: turnFunction.turn_function === "identity_probe" ? RESPONSE_MODES.BOUNDARY_ANSWER : hasActiveTopic(session) ? RESPONSE_MODES.FOLLOWUP_ANSWER : RESPONSE_MODES.CULTURE_ANSWER,
      confidence: turnFunction.confidence || 0.82,
      reasons: [`turn_function_${turnFunction.turn_function}`],
      should_skip_repair: true,
      userTurn,
      turnFunction
    };
  }

  if (userTurn.kind === "declaration_with_signal" && hasActiveTopic(session)) {
    return {
      mode: RESPONSE_MODES.DIRECT_ANSWER,
      confidence: userTurn.confidence || 0.82,
      reasons: ["declaration_signal_with_active_context"],
      should_skip_repair: true,
      userTurn
    };
  }

  if (activeCultureFollowup(text, session)) {
    return {
      mode: RESPONSE_MODES.FOLLOWUP_ANSWER,
      confidence: 0.93,
      reasons: ["active_culture_followup"],
      should_skip_repair: true,
      userTurn
    };
  }

  if (comparisonEntryFollowup(text, session)) {
    return {
      mode: RESPONSE_MODES.FOLLOWUP_ANSWER,
      confidence: 0.9,
      reasons: ["active_comparison_entry_followup"],
      should_skip_repair: true,
      userTurn
    };
  }

  if (FOLLOWUP_RE.test(text) && hasActiveTopic(session)) {
    return {
      mode: RESPONSE_MODES.FOLLOWUP_ANSWER,
      confidence: 0.86,
      reasons: ["active_topic_followup"],
      should_skip_repair: true,
      userTurn
    };
  }

  if (explicitRepair && !lastAnswerIsBad(session)) {
    return {
      mode: /哪一边/.test(text) ? RESPONSE_MODES.SPECIFIC_CLARIFICATION : RESPONSE_MODES.BOUNDED_UNKNOWN,
      confidence: 0.72,
      reasons: ["repair_phrase_without_bad_previous_answer"],
      should_skip_repair: true,
      userTurn
    };
  }

  if (/(哪一个|哪个|是哪一个|是哪种|哪种意思)/.test(text) && previousNamedAlternatives(session)) {
    return {
      mode: RESPONSE_MODES.SPECIFIC_CLARIFICATION,
      confidence: 0.88,
      reasons: ["answer_previous_named_alternatives"],
      should_skip_repair: true,
      userTurn
    };
  }

  if (HELP_RE.test(text) || userTurn.kind === "help_how_to_ask") {
    return { mode: RESPONSE_MODES.HELP_HOW_TO_ASK, confidence: 0.93, reasons: ["help_how_to_ask"], userTurn };
  }

  if (turnFunction.turn_function === "confirmation" && hasActiveTopic(session)) {
    return {
      mode: RESPONSE_MODES.FOLLOWUP_ANSWER,
      confidence: 0.9,
      reasons: ["turn_function_confirmation_with_active_topic"],
      should_skip_repair: true,
      userTurn,
      turnFunction
    };
  }

  if (["analogy_statement", "affective_disclosure", "compliment", "deepening_invitation"].includes(turnFunction.turn_function)) {
    return {
      mode: RESPONSE_MODES.DIRECT_ANSWER,
      confidence: turnFunction.confidence || 0.82,
      reasons: [`turn_function_${turnFunction.turn_function}`],
      should_skip_repair: true,
      userTurn,
      turnFunction
    };
  }

  if (
    [
      "evaluation_request",
      "recommendation_request",
      "abstract_comparison",
      "cross_domain_comparison",
      "list_request",
      "interpretive_question",
      "boundary_clarification",
      "identity_probe"
    ].includes(turnFunction.turn_function)
  ) {
    return {
      mode: turnFunction.turn_function === "identity_probe" ? RESPONSE_MODES.BOUNDARY_ANSWER : hasActiveTopic(session) ? RESPONSE_MODES.FOLLOWUP_ANSWER : RESPONSE_MODES.CULTURE_ANSWER,
      confidence: turnFunction.confidence || 0.82,
      reasons: [`turn_function_${turnFunction.turn_function}`],
      should_skip_repair: true,
      userTurn,
      turnFunction
    };
  }

  if (SOLVER_RE.test(text)) {
    return { mode: RESPONSE_MODES.SOLVER_ANSWER, confidence: 0.88, reasons: ["solver_candidate"], userTurn };
  }

  if (cultureCandidate(text, session)) {
    return { mode: RESPONSE_MODES.CULTURE_ANSWER, confidence: 0.87, reasons: ["culture_candidate"], userTurn };
  }

  if (userTurn.recommended_action === "quiet_affordance") {
    return { mode: RESPONSE_MODES.QUIET_AFFORDANCE, confidence: userTurn.confidence || 0.7, reasons: userTurn.reasons || ["quiet_declaration"], userTurn };
  }

  if (userTurn.recommended_action === "help") {
    return { mode: RESPONSE_MODES.HELP_HOW_TO_ASK, confidence: userTurn.confidence || 0.8, reasons: userTurn.reasons || ["help"], userTurn };
  }

  reasons.push(userTurn.kind || "default_direct");
  return { mode: RESPONSE_MODES.DIRECT_ANSWER, confidence: Math.max(0.6, userTurn.confidence || 0.6), reasons, userTurn };
}
