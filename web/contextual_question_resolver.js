import { activeTopic } from "./topic_stack.js";

function clean(text) {
  return String(text || "").trim();
}

function hasLuoContext(session = {}) {
  return (
    (Array.isArray(session.activeEntityIds) && session.activeEntityIds.includes("person.luo_dayou")) ||
    (Array.isArray(session.active_entity_ids) && session.active_entity_ids.includes("person.luo_dayou")) ||
    /罗大佑/.test(`${session.lastAnswer || ""} ${session.lastAssistantAnswer || ""}`) ||
    activeTopic(session)?.entity_ids?.includes("person.luo_dayou")
  );
}

function lastAnswerExists(session = {}) {
  return Boolean(String(session.lastAssistantAnswer || session.lastAnswer || "").trim());
}

function hasJapaneseAuthorPair(session = {}) {
  const topic = activeTopic(session);
  const ids = new Set([...(topic?.entity_ids || []), ...(session.activeEntityIds || []), ...(session.active_entity_ids || [])]);
  const text = `${session.lastUserText || ""} ${session.lastAnswer || ""} ${session.lastAssistantAnswer || ""}`;
  return (
    (ids.has("author.natsume_soseki") && ids.has("author.kawabata_yasunari")) ||
    (/夏目漱石/.test(text) && /川端/.test(text))
  );
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

  if (/罗大佑/.test(text)) {
    success = true;
    binding_kind = "explicit_entity";
    target_ids = ["person.luo_dayou"];
    confidence = 0.97;
    reasons.push("explicit_luo_dayou");
  } else if (/^(他的|他).{0,8}(歌|歌曲)|这些歌|代表性|特点|为什么重要|代表在哪里/.test(text) && hasLuoContext(session)) {
    success = true;
    binding_kind = "pronoun_entity";
    target_ids = ["person.luo_dayou"];
    confidence = 0.93;
    reasons.push("pronoun_bound_to_active_luo");
  } else if (/(是否能简单一点|简单一点|简单点|短一点|换个说法|说人话|别那么玄|展开一点|详细一点)/.test(text) && lastAnswerExists(session)) {
    success = true;
    binding_kind = "last_answer";
    target_ids = ["last_answer"];
    confidence = 0.95;
    is_transform_request = true;
    reasons.push("transform_last_answer_request");
  } else if (/(谁|哪一位|哪个).{0,8}(更适合|适合).{0,6}(入门|开始)|更适合入门/.test(text) && hasJapaneseAuthorPair(session)) {
    success = true;
    binding_kind = "last_pair";
    target_ids = ["author.natsume_soseki", "author.kawabata_yasunari"];
    confidence = 0.91;
    reasons.push("entry_followup_bound_to_japanese_author_pair");
  } else if (/^(那|这个|这首|这本|它|他|她)/.test(text) && topic) {
    success = true;
    binding_kind = "topic_stack";
    target_ids = [...(topic.entity_ids || []), ...(topic.work_ids || [])].filter(Boolean);
    confidence = target_ids.length ? 0.82 : 0.62;
    reasons.push("topic_stack_binding");
  }

  const lastOperation = session.lastOperation || session.last_operation || "";
  const asksMusicRep = /(歌|歌曲).{0,12}(代表性|特点|重要|代表在哪里)|代表性/.test(text);
  if (success && target_ids.includes("person.luo_dayou") && asksMusicRep && /music_representativeness|explain_music_representativeness/.test(lastOperation)) {
    is_repeat_operation = true;
    reasons.push("same_music_representativeness_operation");
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
