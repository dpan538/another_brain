import { PUBLIC_KNOWLEDGE_PACK } from "./public_knowledge_pack.generated.js";

const TERMINAL_PUNCTUATION_RE = /[\s\-＿_—–~～`"'“”‘’.,，。!?！？:：;；、()[\]{}<>《》「」『』〉》]/g;
const FORBIDDEN_VISIBLE_RE = /(Q[1-9][0-9]*|P[1-9][0-9]*|runtime|schema|source_only|pack|rural|urban|这个音乐对象|这个电影对象|华语流行里的入口|电影叙事里的入口|先看|换个说法)/i;

function clean(text) {
  return String(text || "").trim().replace(/\s+/g, " ");
}

function normalize(text) {
  return clean(text).normalize("NFKC").toLowerCase().replace(TERMINAL_PUNCTUATION_RE, "");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function displayName(entity = {}) {
  const labels = entity.labels || {};
  return labels.zh_hans || labels.zh || labels.zh_hant || labels.original || labels.en || "";
}

function entityTypeLabel(entity = {}) {
  const label = displayName(entity);
  const domains = (entity.domains || []).join(" ");
  const type = String(entity.entity_type || "");
  if (/city|place/.test(type) || /city/.test(domains)) return "地点";
  if (/person/.test(type)) {
    if (/music/.test(domains)) return "音乐人";
    if (/literature/.test(domains)) return "文学人物";
    if (/film/.test(domains)) return "电影人物";
    if (/science/.test(domains)) return "科学人物";
    if (/technology/.test(domains)) return "技术相关人物";
    if (/philosophy/.test(domains)) return "思想人物";
    return "人物";
  }
  if (/work/.test(type)) {
    if (/film/.test(domains) || /电影|film/i.test(label)) return "电影/作品";
    if (/music/.test(domains)) return "音乐作品";
    if (/literature/.test(domains)) return "文学作品";
    return "作品";
  }
  if (/institution|organization/.test(type)) return "机构";
  if (/movement/.test(type)) return "思潮/运动";
  if (/电影|film/i.test(label)) return "电影概念";
  if (/music|音乐|音樂/i.test(label)) return "音乐概念";
  return "概念";
}

function firstSentence(text = "", language = "zh") {
  const source = clean(text);
  if (!source) return "";
  const parts = language === "zh" ? source.split(/(?<=[。！？])/) : source.split(/(?<=[.!?])\s+/);
  return clean(parts.find((part) => clean(part).length >= (language === "zh" ? 12 : 24)) || parts[0] || source);
}

function evidenceSentence(entity = {}) {
  const zh = entity.passages?.zh?.[0]?.text;
  if (zh) return firstSentence(zh, "zh");
  const description = entity.descriptions?.zh;
  if (description) return clean(description);
  const en = entity.passages?.en?.[0]?.text;
  if (en) {
    const name = displayName(entity);
    const type = entityTypeLabel(entity);
    return `${name}是一个有公开百科证据支持的${type}；当前中文证据不足，先按结构化事实作简要说明。`;
  }
  return "";
}

function detectOperation(query = "") {
  const text = clean(query);
  if (/(代表作|代表作品|有哪些作品|有什么作品|作品有哪些|著作|歌曲|电影作品)/.test(text)) return "list_representative_works";
  if (/^(和我聊聊|跟我讲讲|说说|聊聊|我想了解)/.test(text)) return "open_topic";
  if (/(介绍一下|介绍下|你知道.+吗|是谁|谁是|是什么|是什么人)/.test(text)) return "identify_entity";
  if (/(什么意思|怎么定义|定义|概念)/.test(text)) return "define_concept";
  return "";
}

function buildAliasIndex() {
  const rows = [];
  for (const entity of PUBLIC_KNOWLEDGE_PACK.entities || []) {
    const names = unique([...(entity.names || []), ...Object.values(entity.labels || {}), ...(entity.aliases?.zh_hans || []), ...(entity.aliases?.zh_hant || []), ...(entity.aliases?.en || [])]);
    for (const name of names) {
      const normalized = normalize(name);
      if (normalized.length >= 2) rows.push({ normalized, name, entity });
    }
  }
  return rows.sort((a, b) => b.normalized.length - a.normalized.length);
}

const ALIAS_INDEX = buildAliasIndex();
const ENTITY_BY_QID = new Map((PUBLIC_KNOWLEDGE_PACK.entities || []).map((entity) => [entity.qid, entity]));

function resolveEntity(query = "") {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return null;
  return ALIAS_INDEX.find((row) => normalizedQuery.includes(row.normalized))?.entity || null;
}

function workLabels(entity = {}) {
  const labels = [];
  for (const id of entity.work_ids || []) {
    const work = ENTITY_BY_QID.get(String(id).replace(/^wd:/, ""));
    const label = work ? displayName(work) : "";
    if (label) labels.push(label);
  }
  return unique(labels).slice(0, 5);
}

function visibleSafe(answer) {
  return clean(answer).replace(FORBIDDEN_VISIBLE_RE, "").trim();
}

function identifyAnswer(entity) {
  const name = displayName(entity);
  const type = entityTypeLabel(entity);
  const evidence = evidenceSentence(entity);
  const answer = evidence ? `${name}是${type}。${evidence}` : `${name}是${type}；当前只有结构化名称和类型信息可用，我先不补未经证实的细节。`;
  return visibleSafe(answer);
}

function topicAnswer(entity) {
  const name = displayName(entity);
  const evidence = evidenceSentence(entity);
  const answer = evidence ? `${name}可以先这样把握：${evidence}` : `${name}可以先按“${entityTypeLabel(entity)}”理解；更细的事实需要可靠证据再展开。`;
  return visibleSafe(answer);
}

function worksAnswer(entity) {
  const labels = workLabels(entity);
  if (labels.length) return visibleSafe(`${labels.map((label) => `《${label.replace(/[《》]/g, "")}》`).join("、")}。这些是公开结构化关系里可连接到${displayName(entity)}的作品。`);
  return visibleSafe(`公开结构化关系里暂时没有足够作品条目可列；我先不编作品清单。`);
}

export function answerPublicKnowledgeTurn(query = "", state = {}) {
  const operation = detectOperation(query);
  if (!operation) return null;
  const entity = resolveEntity(query);
  if (!entity) return null;
  const answer =
    operation === "list_representative_works"
      ? worksAnswer(entity)
      : operation === "open_topic"
        ? topicAnswer(entity)
        : identifyAnswer(entity);
  if (!answer || FORBIDDEN_VISIBLE_RE.test(answer)) return null;
  const passage = entity.passages?.zh?.[0] || entity.passages?.en?.[0] || null;
  return {
    intent: "public_knowledge",
    answer,
    operation,
    questionType: operation === "list_representative_works" ? "representative_works" : operation === "open_topic" ? "topic_opening" : "identity",
    response_act: operation,
    contextAction: "ANSWER_PUBLIC_KNOWLEDGE",
    usedModel: false,
    route: "public_knowledge_runtime",
    cards: [entity.canonical_id || entity.qid].filter(Boolean),
    publicKnowledge: {
      qid: entity.qid,
      entity_type: entity.entity_type,
      label: displayName(entity),
      evidence_language: passage?.language || "",
      source_url: passage?.source_url || "",
      revision_id: passage?.revision_id || "",
      pack_generated_at: PUBLIC_KNOWLEDGE_PACK.generated_at || ""
    },
    compactStatePatch: {
      last_domain: entity.domains?.[0] || "",
      last_focus_entity_id: entity.canonical_id || entity.qid,
      last_mentions: [entity.canonical_id || entity.qid],
      last_answer_policy: "public_grounded_answer"
    }
  };
}
