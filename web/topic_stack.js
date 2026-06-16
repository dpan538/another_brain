function clean(text) {
  return String(text || "").trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function explicitTopicFromQuery(query = "", domain = "") {
  const text = clean(query);
  if (/罗大佑|童年|鹿港小镇|恋曲1990|之乎者也|东方之珠/.test(text)) {
    return {
      id: "topic.person.luo_dayou",
      entity_ids: ["person.luo_dayou"],
      work_ids: unique([
        /童年/.test(text) ? "work.song.tongnian" : "",
        /鹿港小镇/.test(text) ? "work.song.lukang_xiaozhen" : "",
        /恋曲1990/.test(text) ? "work.song.lianqu_1990" : "",
        /之乎者也/.test(text) ? "work.album.zhihu_zheye" : ""
      ]),
      domain: domain || "music.mandopop",
      label: "罗大佑"
    };
  }
  if (/日本文学|夏目漱石|川端康成|村上春树|太宰治/.test(text)) {
    return {
      id: "topic.domain.japanese_literature",
      entity_ids: unique([
        /夏目漱石/.test(text) ? "author.natsume_soseki" : "",
        /川端康成/.test(text) ? "author.kawabata_yasunari" : ""
      ]),
      work_ids: [],
      domain: domain || "literature.japanese",
      label: "日本文学"
    };
  }
  return null;
}

function topicFromSession(session = {}) {
  const entityIds = Array.isArray(session.activeEntityIds) ? session.activeEntityIds : [];
  const workIds = Array.isArray(session.activeWorkIds) ? session.activeWorkIds : [];
  if (entityIds.includes("person.luo_dayou") || /罗大佑/.test(`${session.lastAnswer || ""} ${session.lastAssistantAnswer || ""}`)) {
    return {
      id: "topic.person.luo_dayou",
      entity_ids: unique(["person.luo_dayou", ...entityIds]),
      work_ids: unique(workIds),
      domain: session.activeDomain || session.lastDomain || "music.mandopop",
      label: "罗大佑"
    };
  }
  if ((session.activeDomain || session.lastDomain) === "literature.japanese") {
    return {
      id: "topic.domain.japanese_literature",
      entity_ids: unique(entityIds),
      work_ids: unique(workIds),
      domain: "literature.japanese",
      label: "日本文学"
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
