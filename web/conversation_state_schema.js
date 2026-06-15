import { bareFallbackId, mentionsGenericFallback } from "./generic_fallback_classifier.js";
import { detectMethodLeak } from "./method_leak_verifier.js";

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
  const entityIds = [];
  const workIds = [];
  let domain = "";

  if (/罗大佑|童年|鹿港小镇|恋曲1990|恋曲1980|之乎者也|东方之珠/.test(source)) {
    entityIds.push("person.luo_dayou");
    domain = "music.mandopop";
  }
  if (/日本文学|夏目漱石|川端康成|太宰治|村上春树|雪国|少爷|人间失格|挪威的森林/.test(source)) {
    domain ||= "literature.japanese";
    if (/夏目漱石/.test(source)) entityIds.push("author.natsume_soseki");
    if (/川端康成/.test(source)) entityIds.push("author.kawabata_yasunari");
  }

  const works = [
    ["work.album.zhihu_zheye", /之乎者也/],
    ["work.song.lukang_xiaozhen", /鹿港小镇/],
    ["work.song.tongnian", /童年/],
    ["work.song.lianqu_1990", /恋曲1990/],
    ["work.song.lianqu_1980", /恋曲1980/]
  ];
  for (const [id, re] of works) {
    if (re.test(source)) workIds.push(id);
  }

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
    mentions.filter((id) => /person\.|author\./.test(id))
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
  lastQuestionType = "",
  lastOperation = "",
  lastDomain = "",
  activeEntityIds = [],
  activeWorkIds = [],
  activeDomain = "",
  lastAnswerSummary = "",
  lastRepairableError = "",
  lastVerifierReasons = []
} = {}) {
  return {
    lastUserQuery: clean(lastUserQuery),
    lastAssistantAnswer: clean(lastAssistantAnswer),
    lastAnswerSource: clean(lastAnswerSource),
    lastAnswerQuality: lastAnswerQuality || LAST_ANSWER_QUALITY.ACCEPTED,
    lastResponseMode: lastResponseMode || "direct_answer",
    lastQuestionType: clean(lastQuestionType),
    lastOperation: clean(lastOperation),
    lastDomain: clean(lastDomain || activeDomain),
    activeEntityIds: Array.isArray(activeEntityIds) ? activeEntityIds.slice(0, 8) : [],
    activeWorkIds: Array.isArray(activeWorkIds) ? activeWorkIds.slice(0, 8) : [],
    activeDomain: clean(activeDomain || lastDomain),
    lastAnswerSummary: lastAnswerSummary || summarize(lastAssistantAnswer),
    lastRepairableError: lastRepairableError || LAST_REPAIRABLE_ERROR.NONE,
    lastVerifierReasons: Array.isArray(lastVerifierReasons) ? lastVerifierReasons.slice(0, 8) : []
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
    lastQuestionType: resolved.questionType || resolved.question_type || "",
    lastOperation: resolved.operation || "",
    lastDomain: active.activeDomain,
    activeEntityIds: active.activeEntityIds,
    activeWorkIds: active.activeWorkIds,
    activeDomain: active.activeDomain,
    lastAnswerSummary: summarize(answer),
    lastRepairableError: resolved.lastRepairableError || quality.repairableError,
    lastVerifierReasons: [
      ...(Array.isArray(resolved.verifier?.reasons) ? resolved.verifier.reasons : []),
      ...(Array.isArray(finalized.firewall?.second_pass?.reasons) ? finalized.firewall.second_pass.reasons : [])
    ]
  });
}
