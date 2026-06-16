import { detectCultureDomain, resolveCultureEntity } from "./culture_runtime.js";

function clean(text) {
  return String(text || "").trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function explicitTopicFromQuery(query = "", domain = "") {
  const text = clean(query);
  const cards = resolveCultureEntity(text, {});
  const explicitCards = cards.filter((card) => (card.names || []).some((name) => text.includes(name)));
  const focusCards = explicitCards.length ? explicitCards : cards.filter((card) => card.entity_type !== "concept");
  if (focusCards.length > 0) {
    const entityIds = unique(focusCards.filter((card) => ["person", "author"].some((kind) => card.id.startsWith(`${kind}.`) || card.entity_type === "person")).map((card) => card.id));
    const workIds = unique(focusCards.filter((card) => card.entity_type === "work" || card.id.startsWith("work.")).map((card) => card.id));
    const inferredDomain = domain || focusCards[0]?.domain || detectCultureDomain(text, {});
    return {
      id: entityIds[0] ? `topic.${entityIds[0]}` : workIds[0] ? `topic.${workIds[0]}` : `topic.domain.${inferredDomain}`,
      entity_ids: entityIds,
      work_ids: workIds,
      domain: inferredDomain,
      label: focusCards[0]?.names?.[0] || inferredDomain || "当前话题"
    };
  }
  const inferredDomain = detectCultureDomain(text, {});
  if (inferredDomain && inferredDomain !== "generic") {
    return {
      id: `topic.domain.${inferredDomain}`,
      entity_ids: [],
      work_ids: [],
      domain: domain || inferredDomain,
      label: inferredDomain
    };
  }
  return null;
}

function topicFromSession(session = {}) {
  const entityIds = Array.isArray(session.activeEntityIds) ? session.activeEntityIds : [];
  const workIds = Array.isArray(session.activeWorkIds) ? session.activeWorkIds : [];
  if (entityIds.length > 0 || workIds.length > 0 || session.last_focus_entity_id) {
    return {
      id: `topic.${session.last_focus_entity_id || entityIds[0] || workIds[0]}`,
      entity_ids: unique([session.last_focus_entity_id || "", ...entityIds]).filter((id) => /person\.|author\./.test(id)),
      work_ids: unique(workIds),
      domain: session.activeDomain || session.lastDomain || session.last_domain || "",
      label: session.last_focus_entity_id || entityIds[0] || workIds[0] || "当前话题"
    };
  }
  const domain = session.activeDomain || session.lastDomain || session.last_domain;
  if (domain) {
    return {
      id: `topic.domain.${domain}`,
      entity_ids: unique(entityIds),
      work_ids: unique(workIds),
      domain,
      label: domain
    };
  }
  return null;
}

export function scoreTopicSalience(topic = {}, turnIndex = 0) {
  const explicitBoost = topic.explicit ? 1.2 : 0;
  const recency = Math.max(0, 1 - Math.max(0, turnIndex) * 0.08);
  const focusBoost = topic.last_answer_focus ? 0.4 : 0;
  return Math.round((recency + explicitBoost + focusBoost) * 1000) / 1000;
}

export function updateTopicStack({ session = {}, query = "", boundReferents = [], domain = "", operation = "" } = {}) {
  const currentStack = Array.isArray(session.active_topic_stack)
    ? session.active_topic_stack
    : Array.isArray(session.activeTopicStack)
      ? session.activeTopicStack
      : [];
  const explicit = explicitTopicFromQuery(query, domain);
  const fallback = topicFromSession(session);
  const base = explicit || fallback;
  if (!base && (!boundReferents || boundReferents.length === 0)) return currentStack.slice(0, 4);

  const referentIds = unique(boundReferents.map((item) => (typeof item === "string" ? item : item.id)));
  const topic = {
    ...(base || {
      id: `topic.${referentIds[0] || domain || "unknown"}`,
      entity_ids: referentIds.filter((id) => /person\.|author\./.test(id)),
      work_ids: referentIds.filter((id) => /work\./.test(id)),
      domain,
      label: referentIds[0] || domain || "当前话题"
    }),
    explicit: Boolean(explicit),
    last_operation: operation || session.lastOperation || "",
    last_touched_at: Date.now()
  };
  topic.salience = scoreTopicSalience(topic, 0);

  const next = [topic, ...currentStack.filter((item) => item.id !== topic.id)];
  return next.slice(0, 4).map((item, index) => ({
    ...item,
    salience: scoreTopicSalience(item, index)
  }));
}

export function activeTopic(session = {}) {
  const stack = Array.isArray(session.active_topic_stack)
    ? session.active_topic_stack
    : Array.isArray(session.activeTopicStack)
      ? session.activeTopicStack
      : [];
  return stack[0] || topicFromSession(session) || null;
}

export function detectTopicShift({ query = "", session = {} } = {}) {
  const explicit = explicitTopicFromQuery(query);
  const current = activeTopic(session);
  if (!explicit || !current) return { shifted: false, from: current?.id || "", to: explicit?.id || "", confidence: 0.4 };
  return {
    shifted: explicit.id !== current.id,
    from: current.id,
    to: explicit.id,
    confidence: explicit.id !== current.id ? 0.9 : 0.2
  };
}
