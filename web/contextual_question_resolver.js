import { activeTopic } from "./topic_stack.js";
import { detectCultureQuestionType, resolveCultureEntity } from "./culture_runtime.js";

function clean(text) {
  return String(text || "").trim();
}

function lastAnswerExists(session = {}) {
  return Boolean(String(session.lastAssistantAnswer || session.lastAnswer || "").trim());
}

function activeEntityIds(session = {}) {
  const topic = activeTopic(session);
  return [
    ...(topic?.entity_ids || []),
    ...(session.activeEntityIds || []),
    ...(session.active_entity_ids || []),
    ...(Array.isArray(session.last_two_entity_ids) ? session.last_two_entity_ids : []),
    ...(Array.isArray(session.last_mentions) ? session.last_mentions.filter((id) => /person\.|author\./.test(id)) : [])
  ].filter(Boolean);
}

function activeWorkIds(session = {}) {
  const topic = activeTopic(session);
  return [...(topic?.work_ids || []), ...(session.activeWorkIds || []), ...(session.active_work_ids || []), ...(session.last_works || [])].filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function activePairIds(session = {}) {
  return unique(activeEntityIds(session)).slice(0, 2);
}

function explicitCultureTargets(query, session = {}) {
  const cards = resolveCultureEntity(query, session);
  return cards
    .filter((card) => clean(query).includes(card.names?.[0] || "") || (card.names || []).some((name) => clean(query).includes(name)))
    .filter((card) => card && card.entity_type !== "concept")
    .slice(0, 4);
}

function followupTargets(session = {}) {
  const ids = unique([...activeEntityIds(session), ...activeWorkIds(session)]);
  return ids.length ? ids : activeTopic(session)?.id ? [activeTopic(session).id] : [];
}

export function resolveContextualQuestion({ query = "", session = {} } = {}) {
  const text = clean(query);
  const candidates = [];
  const topic = activeTopic(session);
  let success = false;
  let binding_kind = "no_context";
  let target_ids = [];
  let confidence = 0.35;
  let is_repeat_operation = false;
  let is_transform_request = false;
  let should_clarify = false;
  const reasons = [];

  if (/(是否能简单一点|简单一点|简单点|短一点|换个说法|说人话|别那么玄|展开一点|详细一点)/.test(text) && lastAnswerExists(session)) {
    success = true;
    binding_kind = "last_answer";
    target_ids = ["last_answer"];
    confidence = 0.95;
    is_transform_request = true;
    reasons.push("transform_last_answer_request");
  }

  const explicitTargets = success ? [] : explicitCultureTargets(text, session);
  if (explicitTargets.length > 0) {
    success = true;
    binding_kind = explicitTargets[0].entity_type === "work" ? "explicit_work" : "explicit_entity";
    target_ids = explicitTargets.map((card) => card.id);
    confidence = 0.97;
    reasons.push("explicit_culture_target");
  } else if (/^(他的|她的|它的|他|她|它).{0,8}(歌|歌曲|作品|书|专辑)|这些(歌|作品|书)|代表性|特点|为什么重要|代表在哪里|共同点/.test(text) && followupTargets(session).length > 0) {
    success = true;
    binding_kind = activeWorkIds(session).length ? "pronoun_work" : "pronoun_entity";
    target_ids = followupTargets(session);
    confidence = 0.93;
    reasons.push("pronoun_bound_to_active_topic");
  } else if (/(谁|哪一位|哪个).{0,8}(更适合|适合).{0,6}(入门|开始)|更适合入门/.test(text) && activePairIds(session).length >= 2) {
    success = true;
    binding_kind = "last_pair";
    target_ids = activePairIds(session);
    confidence = 0.91;
    reasons.push("entry_followup_bound_to_active_pair");
  } else if (/^(那|这个|这首|这本|它|他|她)/.test(text) && topic) {
    success = true;
    binding_kind = "topic_stack";
    target_ids = [...(topic.entity_ids || []), ...(topic.work_ids || [])].filter(Boolean);
    confidence = target_ids.length ? 0.82 : 0.62;
    reasons.push("topic_stack_binding");
  }

  const lastOperation = session.lastOperation || session.last_operation || "";
  const questionType = detectCultureQuestionType(text, session);
  const asksRepeatableCultureOperation = /(代表性|特点|重要|代表在哪里|共同点|作品|作家|入门)/.test(text);
  if (success && asksRepeatableCultureOperation && questionType && lastOperation.includes(questionType.replace("music_", ""))) {
    is_repeat_operation = true;
    reasons.push("same_culture_operation");
  } else if (success && asksRepeatableCultureOperation && /music_representativeness|music_characteristics/.test(questionType) && /music_representativeness|music_characteristics|explain_music/.test(lastOperation)) {
    is_repeat_operation = true;
    reasons.push("same_music_operation_family");
  }

  if (!success && /^(哪一个|哪个|那这本呢|那这首呢|哪种)/.test(text)) {
    should_clarify = true;
    candidates.push(...(Array.isArray(session.last_clarification_candidates) ? session.last_clarification_candidates : []));
    reasons.push("ellipsis_without_confident_binding");
  }

  return {
    success,
    binding_kind,
    target_ids,
    active_topic_id: topic?.id || "",
    confidence,
    candidates,
    is_repeat_operation,
    is_transform_request,
    should_clarify,
    reasons
  };
}
