import { CULTURE_CARDS } from "./culture_cards.generated.js";

const VARIATION_VERSION = "semantic-plan-zh-v2";

const FORBIDDEN_VISIBLE_RE =
  /(可放在.{0,20}语境中谈|属于.{0,20}语境|常放在.{0,20}语境中讨论|一个具体线索是|同一个方向|先看|重点在|可以从.{0,24}进入|这个对象|这个音乐对象|这个电影对象|代表性在三点|可以抓三点|华语流行里的入口|电影叙事里的入口|换个说法|runtime|schema|pack|\brural\b|\burban\b|\bmandopop\b)/i;
const RAW_INTERNAL_RE = /\b(rural|urban|gender|war|mandopop|hongkong|factual_core|source_only|pack|runtime|schema|Q[1-9][0-9]*|P[1-9][0-9]*)\b/i;
const BOUNDARY_RE = /(隐私|私人|版权|完整歌词|全文|法律|医疗|金融|自伤|伤害|不能|不提供|不贴|边界)/;

const TERM_LABELS = {
  modern_self: "现代自我",
  loneliness: "孤独感",
  social_role: "社会角色",
  education: "教育压力",
  psychological_modernity: "心理现代性",
  ironic_clarity: "带讽刺感的清晰叙述",
  intellectual_pressure: "知识分子的精神压力",
  seasonality: "季节感",
  impermanence: "无常感",
  social_pressure: "社会压力",
  war_aftermath: "战后经验",
  urban_loneliness: "都市孤独",
  lyrical_image: "抒情意象",
  social_dislocation: "社会失序",
  popular_modern_voice: "大众化的现代声音",
  compressed_silence: "克制的沉默感",
  modernity: "现代性",
  alienation: "疏离感",
  self_negation: "自我否定",
  confession: "自白式叙述",
  love_memory: "爱情记忆",
  social_observation: "社会观察",
  urban_memory: "城市记忆",
  rural_memory: "乡土记忆",
  voice_quality: "声音辨识度",
  period_style: "时代风格",
  musical_arrangement: "编曲方式",
  transience: "无常和易逝感",
  sensitivity: "细腻感受",
  pathos: "哀感",
  recognition: "对变化的体认",
  restraint: "克制",
  weathering: "时间留下的痕迹",
  irregularity: "不规则感",
  patina: "旧痕和包浆",
  impermanence: "无常",
  form: "形式",
  material: "材料",
  institution: "制度语境",
  process: "过程",
  medium: "媒介",
  everyday_life: "日常生活",
  family: "家庭关系",
  youth: "青年经验",
  fiction_as_thought: "把虚构作为思想实验",
  labyrinth: "迷宫式结构"
};
const OMIT_INTERNAL_TERMS = new Set(["historical_position"]);

function clean(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function compact(value) {
  return clean(value).replace(/\s+/g, "");
}

function hashString(text = "") {
  let hash = 2166136261;
  for (const char of String(text || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function finish(text = "") {
  const out = clean(text).replace(/[；;，,、\s]+$/g, "");
  return out && !/[。！？!?]$/.test(out) ? `${out}。` : out;
}

function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function chineseLabel(card = {}) {
  return clean((card.names || []).find((name) => /[\u3400-\u9fff]/.test(String(name))) || card.names?.[0] || card.id || "");
}

function cardById(id = "") {
  return CULTURE_CARDS.find((card) => card.id === id) || null;
}

function aliases(card = {}) {
  return unique([...(card.names || []), chineseLabel(card)].map((name) => String(name || "").replace(/[《》]/g, "")));
}

function cardMatchesQuery(card = {}, query = "") {
  const text = compact(query);
  return aliases(card).some((name) => {
    const key = compact(name);
    return key.length >= 2 && text.includes(key);
  });
}

function mentionedCards(query = "") {
  return CULTURE_CARDS.filter((card) => cardMatchesQuery(card, query)).sort((a, b) => chineseLabel(b).length - chineseLabel(a).length);
}

function cardsFromIds(ids = []) {
  return unique(ids).map(cardById).filter(Boolean);
}

function visibleTerm(value = "") {
  const raw = clean(value);
  if (!raw) return "";
  if (OMIT_INTERNAL_TERMS.has(raw) || OMIT_INTERNAL_TERMS.has(raw.toLowerCase())) return "";
  if (/[\u3400-\u9fff]/.test(raw)) return raw.replace(/[；;。]+$/g, "");
  const mapped = TERM_LABELS[raw] || TERM_LABELS[raw.toLowerCase()];
  return mapped || "";
}

function visibleList(values = [], limit = 3) {
  return unique(values.map(visibleTerm)).slice(0, limit);
}

function visibleStatements(values = [], limit = 3) {
  return unique(values)
    .filter((item) => /[\u3400-\u9fff]/.test(item) && !/[A-Za-z]/.test(item) && !RAW_INTERNAL_RE.test(item))
    .slice(0, limit);
}

function roleLabel(card = {}) {
  if (card.entity_type === "work") return "作品";
  if (["concept", "movement", "genre", "theme"].includes(card.entity_type)) return "概念";
  if (card.entity_type !== "person") return "文化对象";
  const domain = String(card.domain || "");
  if (/music/.test(domain)) return "音乐人";
  if (/literature|poetry/.test(domain)) return "作家";
  if (/film|cinema/.test(domain)) return "电影人";
  if (/art|design/.test(domain)) return "艺术或设计人物";
  if (/science/.test(domain)) return "科学人物";
  if (/technology/.test(domain)) return "技术相关人物";
  if (/philosophy|thought/.test(domain)) return "思想人物";
  return "文化人物";
}

function titlesFor(ids = [], limit = 4) {
  return unique(
    ids
      .map((id) => cardById(typeof id === "string" ? id : id?.id))
      .filter(Boolean)
      .map(chineseLabel)
      .filter((title) => /[\u3400-\u9fff]/.test(title))
      .map((title) => `《${title.replace(/[《》]/g, "")}》`)
  ).slice(0, limit);
}

function operationFromQuery(query = "", subject = null) {
  const text = clean(query).replace(/[？?。.!！〉》]+$/g, "");
  if (/(代表作|代表作品|有哪些作品|有什么作品|作品有哪些|有哪些歌|有什么歌|歌曲)/.test(text)) return "list_representative_works";
  if (/(不同|区别|差别|比较|共同点|关系)/.test(text) && mentionedCards(text).length >= 2) return "simple_comparison";
  if (/^(和我聊聊|跟我讲讲|讲讲|说说|聊聊|我想了解)/.test(text)) return subject?.entity_type === "person" ? "open_entity_topic" : "open_topic";
  if (/是什么作品$/.test(text)) return "identify_entity";
  if (/^什么是/.test(text) && subject && subject.entity_type !== "person") return "define_concept";
  if (/(是什么意思|什么意思|怎么理解|如何理解|定义|是什么)$/.test(text) && subject && subject.entity_type !== "person") return "define_concept";
  if (/(是谁|谁是|介绍一下|介绍下|你知道.+吗|是什么人|是什么)$/.test(text)) return subject?.entity_type === "person" ? "identify_person" : "identify_entity";
  return "";
}

function sourceCardsFor({ query = "", evidenceIds = [], subjectIds = [] } = {}) {
  const byId = cardsFromIds([...subjectIds, ...evidenceIds]);
  const byQuery = mentionedCards(query);
  return unique([...byId, ...byQuery].map((card) => card.id)).map(cardById).filter(Boolean);
}

function semanticSignature(operation = "", cards = [], query = "") {
  const ids = cards.map((card) => card.id).filter(Boolean).slice(0, 3);
  return [operation || "answer", ...ids, hashString(query).toString(16).slice(0, 6)].join("|");
}

function unit(id, kind, value, sourceIds = []) {
  return { id, kind, value, source_ids: unique(sourceIds) };
}

function factUnits(card = {}) {
  const units = [];
  const name = chineseLabel(card);
  const works = titlesFor([...(card.representative_works || []), ...(card.works || [])], 4);
  if (works.length) units.push(unit("representative_work", "work_titles", works, [card.id]));
  const themes = visibleList([...(card.themes || []), ...(card.style_axes || [])], 3);
  if (themes.length) units.push(unit("style_or_theme", "term_list", themes, [card.id]));
  const periods = visibleList(card.periods || [], 2);
  if (periods.length) units.push(unit("period", "term_list", periods, [card.id]));
  const context = unique(card.historical_context || [])
    .filter((item) => /[\u3400-\u9fff]/.test(item) && !/[A-Za-z]/.test(item))
    .slice(0, 2);
  if (context.length) units.push(unit("historical_context", "statement", context, [card.id]));
  const factual = clean(card.factual_core || "").replace(/[。]+$/g, "");
  if (factual && factual !== name && /[\u3400-\u9fff]/.test(factual) && !/[A-Za-z]/.test(factual) && !RAW_INTERNAL_RE.test(factual)) {
    units.push(unit("factual_core", "statement", [factual], [card.id]));
  }
  const definitions = visibleList(card.definition_units || [], 4);
  if (definitions.length) units.push(unit("definition_units", "term_list", definitions, [card.id]));
  const entry = visibleStatements(card.entry_points || [], 2);
  if (entry.length) units.push(unit("entry_example", "statement", entry, [card.id]));
  const axes = visibleStatements(card.comparison_axes || [], 3);
  if (axes.length) units.push(unit("comparison_axes", "statement", axes, [card.id]));
  return units;
}

function stripLeadingSubject(text = "", subject = "") {
  let out = clean(text).replace(/[。]+$/g, "");
  const name = clean(subject);
  if (name) {
    out = out.replace(new RegExp(`^${name}(?:通常|一般)?(?:指的是|是指|是|：|:)`), "");
    out = out.replace(new RegExp(`^${name}`), "");
    out = out.replace(new RegExp(`，?${name}(?:通常|一般)?(?:指的是|是指|指|是)`), "，");
  }
  return clean(out)
    .replace(/，{2,}/g, "，")
    .replace(/^，/, "")
    .replace(/^(通常|一般)?(?:指的是|是指|是|指)/, "")
    .trim();
}

function relationCards(card = {}, limit = 4) {
  return unique((card.related_entities || []).map((item) => item.id))
    .map(cardById)
    .filter(Boolean)
    .slice(0, limit);
}

export function buildSemanticVariationPlan({
  query = "",
  plan = {},
  draft = {},
  evidenceIds = [],
  subjectIds = []
} = {}) {
  const cards = sourceCardsFor({
    query,
    evidenceIds: [...evidenceIds, ...(draft.cards || []), ...(plan.evidence_ids || [])],
    subjectIds: [...subjectIds, ...(plan.entity_ids || []), ...(plan.boundTargets || [])]
  });
  const subject = cards.find((card) => ["person", "work", "concept", "movement", "genre", "theme"].includes(card.entity_type)) || cards[0] || null;
  const comparisonCards = cards.filter((card) => cardMatchesQuery(card, query)).slice(0, 2);
  const operation = draft.operation || plan.requested_operation || plan.response_act || operationFromQuery(query, subject);
  if (!subject || !operation || BOUNDARY_RE.test(`${query} ${draft.operation || ""}`)) return null;
  const name = chineseLabel(subject);
  const role = roleLabel(subject);
  const facts = factUnits(subject);
  const works = titlesFor([...(subject.representative_works || []), ...(subject.works || [])], 5);
  const related = relationCards(subject, 5);
  const mandatory = [];
  if (/identify|open_entity_topic|open_topic/.test(operation)) {
    mandatory.push(unit("subject_name", "label", name, [subject.id]), unit("subject_role", "role", role, [subject.id]));
  } else if (operation === "list_representative_works") {
    mandatory.push(unit("subject_name", "label", name, [subject.id]), unit("core_works", "work_titles", works.slice(0, Math.min(2, works.length || 2)), [subject.id]));
  } else if (operation === "define_concept") {
    const definitionSource = facts.find((item) => item.id === "factual_core")?.value?.[0] || visibleList(subject.definition_units || [], 3).join("、");
    mandatory.push(unit("subject_name", "label", name, [subject.id]), unit("definition", "definition", stripLeadingSubject(definitionSource, name), [subject.id]));
  } else if (operation === "simple_comparison" && comparisonCards.length >= 2) {
    mandatory.push(unit("left_subject", "label", chineseLabel(comparisonCards[0]), [comparisonCards[0].id]), unit("right_subject", "label", chineseLabel(comparisonCards[1]), [comparisonCards[1].id]));
  }
  const optional = facts.filter((item) => !["factual_core"].includes(item.id) || operation !== "define_concept");
  const contrastIds =
    operation === "simple_comparison"
      ? comparisonCards.map((card) => card.id)
      : related.filter((card) => ["concept", "movement", "genre", "theme", "person", "work"].includes(card.entity_type)).map((card) => card.id);
  return {
    semantic_signature: semanticSignature(operation, operation === "simple_comparison" ? comparisonCards : [subject], query),
    response_act: operation,
    subject_ids: operation === "simple_comparison" ? comparisonCards.map((card) => card.id) : [subject.id],
    active_referent: subject.id,
    requested_operation: operation,
    mandatory_units: mandatory.filter((item) => Array.isArray(item.value) ? item.value.length : clean(item.value)),
    optional_focus_groups: optional,
    optional_example_ids: unique([...works.slice(2).map((title) => title.replace(/[《》]/g, "")), ...related.map((card) => card.id)]).slice(0, 5),
    optional_work_ids: works,
    optional_relation_ids: unique((subject.related_entities || []).map((item) => item.id)).slice(0, 4),
    optional_contrast_ids: contrastIds.slice(0, 4),
    stance: "neutral",
    uncertainty: "bounded_to_available_card_fields",
    boundary_requirements: [],
    evidence_ids: unique([subject.id, ...facts.flatMap((item) => item.source_ids || [])]),
    target_density: "compact",
    allowed_shapes: ["direct_one_sentence", "two_sentence_example", "definition_example", "definition_contrast", "works_list"],
    language: "zh",
    source_cards: operation === "simple_comparison" ? comparisonCards : [subject]
  };
}

function makeCandidate(id, text, focusId, shapeId, axes = []) {
  return {
    id,
    text: finish(text),
    focus_id: focusId,
    shape_id: shapeId,
    meaningful_axes: unique(axes),
    skeleton: normalizeSurfaceSkeleton(text),
    opener_id: openerId(text),
    effective_key: unique([focusId, shapeId, ...axes]).join("|")
  };
}

function makeOutline({ id, focusId, explanationMove, exampleIds = [], workIds = [], relationIds = [], shapeId, mandatoryUnits = [], optionalUnits = [] }) {
  return {
    id,
    focus_id: focusId,
    explanation_move: explanationMove,
    example_or_work_relation_ids: unique([...exampleIds, ...workIds, ...relationIds]),
    sentence_shape_id: shapeId,
    mandatory_units: mandatoryUnits,
    optional_units: optionalUnits
  };
}

function unitValues(plan = {}, id = "") {
  const found = [...(plan.mandatory_units || []), ...(plan.optional_focus_groups || [])].find((item) => item.id === id);
  return Array.isArray(found?.value) ? found.value : clean(found?.value) ? [clean(found.value)] : [];
}

function renderFocus(unit = null, subjectName = "") {
  if (!unit) return "";
  const values = Array.isArray(unit.value) ? unit.value : [unit.value];
  const first = values.filter(Boolean)[0] || "";
  if (!first) return "";
  if (unit.kind === "work_titles") return `${values.slice(0, 3).join("、")}常被用来定位${subjectName || "这个对象"}的创作面貌`;
  if (unit.kind === "term_list") return values.slice(0, 3).join("、");
  if (unit.kind === "statement") return first;
  return first;
}

function identityOutlines(plan = {}) {
  const works = unitValues(plan, "representative_work");
  const focus = plan.optional_focus_groups || [];
  const relations = plan.optional_relation_ids || [];
  const outlines = [
    makeOutline({ id: "identity_core", focusId: "role", explanationMove: "role_plus_first_focus", shapeId: "direct_one_sentence", mandatoryUnits: ["subject_name", "subject_role"], optionalUnits: [focus[0]?.id].filter(Boolean) })
  ];
  if (focus[1]) outlines.push(makeOutline({ id: "identity_focus_alt", focusId: "alternate_focus", explanationMove: "role_plus_alternate_focus", shapeId: "direct_one_sentence", mandatoryUnits: ["subject_name", "subject_role"], optionalUnits: [focus[1].id] }));
  if (works.length) outlines.push(makeOutline({ id: "identity_work_example", focusId: "representative_work", explanationMove: "role_plus_work_example", workIds: works, shapeId: "two_sentence_example", mandatoryUnits: ["subject_name", "subject_role"], optionalUnits: ["representative_work"] }));
  if (relations.length) outlines.push(makeOutline({ id: "identity_relation", focusId: "relation", explanationMove: "role_plus_relation", relationIds: relations.slice(0, 2), shapeId: "two_sentence_example", mandatoryUnits: ["subject_name", "subject_role"], optionalUnits: ["optional_relation_ids"] }));
  return outlines;
}

function realizeIdentityOutline(outline, plan = {}) {
  const card = plan.source_cards?.[0] || {};
  const name = unitValues(plan, "subject_name")[0] || chineseLabel(card);
  const role = unitValues(plan, "subject_role")[0] || roleLabel(card);
  const focusUnits = plan.optional_focus_groups || [];
  const facts = focusUnits.map((focus) => renderFocus(focus, name)).filter(Boolean);
  const works = unitValues(plan, "representative_work");
  const related = (plan.optional_relation_ids || []).map(cardById).filter(Boolean).map(chineseLabel).filter(Boolean).slice(0, 2);
  if (outline.id === "identity_focus_alt" && facts[1]) return makeCandidate(outline.id, `${name}是${role}，创作特征包括${facts[1]}`, outline.focus_id, outline.sentence_shape_id, ["grounded_focus"]);
  if (outline.id === "identity_work_example" && works.length) return makeCandidate(outline.id, `${name}是${role}；代表作包括${works.slice(0, 2).join("、")}`, outline.focus_id, outline.sentence_shape_id, ["grounded_example", "density"]);
  if (outline.id === "identity_relation" && plan.optional_relation_ids?.length) {
    const related = plan.optional_relation_ids.map(cardById).filter(Boolean).map(chineseLabel).filter(Boolean).slice(0, 2);
    if (related.length) return makeCandidate(outline.id, `${name}是${role}；相关线索包括${related.join("、")}`, outline.focus_id, outline.sentence_shape_id, ["grounded_relation"]);
  }
  if (facts[0]) {
    const factText = focusUnits[0]?.kind === "term_list" ? `创作特征包括${facts[0]}` : facts[0];
    return makeCandidate(outline.id, `${name}是${role}。${factText}`, outline.focus_id, outline.sentence_shape_id, ["density"]);
  }
  if (related.length) return makeCandidate(outline.id, `${name}是${role}；相关线索包括${related.join("、")}`, outline.focus_id, outline.sentence_shape_id, ["density", "grounded_relation"]);
  return makeCandidate(outline.id, `${name}是${role}`, outline.focus_id, outline.sentence_shape_id, ["density"]);
}

function topicOutlines(plan = {}) {
  const works = unitValues(plan, "representative_work");
  const focus = plan.optional_focus_groups || [];
  const outlines = [];
  if (focus[0]) outlines.push(makeOutline({ id: "topic_focus_a", focusId: "grounded_focus", explanationMove: "topic_focus", shapeId: "direct_one_sentence", mandatoryUnits: ["subject_name"], optionalUnits: [focus[0].id] }));
  if (focus[1]) outlines.push(makeOutline({ id: "topic_focus_b", focusId: "alternate_focus", explanationMove: "topic_alternate_focus", shapeId: "two_sentence_example", mandatoryUnits: ["subject_name", "subject_role"], optionalUnits: [focus[1].id] }));
  if (works.length) outlines.push(makeOutline({ id: "topic_work", focusId: "representative_work", explanationMove: "topic_work_example", workIds: works, shapeId: "two_sentence_example", mandatoryUnits: ["subject_name"], optionalUnits: ["representative_work"] }));
  return outlines;
}

function realizeTopicOutline(outline, plan = {}) {
  const card = plan.source_cards?.[0] || {};
  const name = unitValues(plan, "subject_name")[0] || chineseLabel(card);
  const role = unitValues(plan, "subject_role")[0] || roleLabel(card);
  const focusUnits = plan.optional_focus_groups || [];
  const facts = focusUnits.map((focus) => renderFocus(focus, name)).filter(Boolean);
  const works = unitValues(plan, "representative_work");
  if (outline.id === "topic_focus_b" && facts[1]) return makeCandidate(outline.id, `${name}是${role}。可谈${facts[1]}`, outline.focus_id, outline.sentence_shape_id, ["grounded_focus", "density"]);
  if (outline.id === "topic_work" && works.length) return makeCandidate(outline.id, `${name}的代表作品包括${works.slice(0, 2).join("、")}；这些作品能说明他的创作位置`, outline.focus_id, outline.sentence_shape_id, ["grounded_example"]);
  if (facts[0]) {
    const factText = focusUnits[0]?.kind === "term_list" ? `创作特征包括${facts[0]}` : facts[0];
    return makeCandidate(outline.id, `${name}是${role}，可谈${factText}`, outline.focus_id, outline.sentence_shape_id, ["grounded_focus"]);
  }
  return null;
}

function worksOutlines(plan = {}) {
  const works = unique([...(unitValues(plan, "core_works") || []), ...(plan.optional_work_ids || [])]).slice(0, 5);
  if (!works.length) return [];
  const focus = (plan.optional_focus_groups || []).filter((item) => item.id !== "representative_work");
  const outlines = [makeOutline({ id: "works_core", focusId: "core_works", explanationMove: "stable_core_list", workIds: works.slice(0, 3), shapeId: "works_list", mandatoryUnits: ["subject_name", "core_works"], optionalUnits: ["representative_work"] })];
  if (works.length > 2) outlines.push(makeOutline({ id: "works_plus_secondary", focusId: "secondary_work", explanationMove: "core_plus_secondary", workIds: works.slice(0, 4), shapeId: "works_list_with_criterion", mandatoryUnits: ["subject_name", "core_works"], optionalUnits: ["secondary_work"] }));
  if (focus[0]) outlines.push(makeOutline({ id: "works_with_criterion", focusId: "organizing_criterion", explanationMove: "works_plus_supported_criterion", workIds: works.slice(0, 3), shapeId: "works_list_with_criterion", mandatoryUnits: ["subject_name", "core_works"], optionalUnits: [focus[0].id] }));
  return outlines;
}

function realizeWorksOutline(outline, plan = {}) {
  const card = plan.source_cards?.[0] || {};
  const name = unitValues(plan, "subject_name")[0] || chineseLabel(card);
  const works = unique([...(unitValues(plan, "core_works") || []), ...(plan.optional_work_ids || [])]).slice(0, 5);
  if (!works.length) return [];
  const stable = works.slice(0, Math.min(3, works.length));
  if (outline.id === "works_plus_secondary" && works.length > 2) {
    return makeCandidate(outline.id, `${name}的代表作可列${works.slice(0, 2).join("、")}；也可补${works.slice(2, 4).join("、")}看创作面向`, outline.focus_id, outline.sentence_shape_id, ["grounded_example", "density"]);
  }
  if (outline.id === "works_with_criterion") {
    const focus = (plan.optional_focus_groups || [])
      .filter((item) => item.id !== "representative_work")
      .map((item) => renderFocus(item, name))
      .filter(Boolean)[0];
    if (focus) return makeCandidate(outline.id, `${stable.join("、")}是${name}的代表作；这些作品可联系${focus}`, outline.focus_id, outline.sentence_shape_id, ["grounded_example", "organizing_criterion"]);
  }
  return makeCandidate(outline.id, `${stable.join("、")}是${name}较常被提到的代表作`, outline.focus_id, outline.sentence_shape_id, ["grounded_example"]);
}

function definitionOutlines(plan = {}) {
  const terms = unitValues(plan, "definition_units").slice(0, 3);
  const examples = plan.optional_example_ids || [];
  const focus = plan.optional_focus_groups || [];
  const outlines = [makeOutline({ id: "definition_plain", focusId: "definition", explanationMove: "plain_definition", shapeId: "direct_one_sentence", mandatoryUnits: ["subject_name", "definition"], optionalUnits: [] })];
  if (terms.length || examples.length) outlines.push(makeOutline({ id: "definition_example", focusId: "example", explanationMove: "definition_plus_example", exampleIds: examples.slice(0, 2), shapeId: "definition_example", mandatoryUnits: ["subject_name", "definition"], optionalUnits: ["definition_units"] }));
  const entry = focus.find((item) => item.id === "entry_example");
  if (entry) outlines.push(makeOutline({ id: "definition_entry", focusId: "entry_example", explanationMove: "definition_plus_entry_example", shapeId: "definition_example", mandatoryUnits: ["subject_name", "definition"], optionalUnits: ["entry_example"] }));
  const axes = focus.find((item) => item.id === "comparison_axes");
  if (axes) outlines.push(makeOutline({ id: "definition_axis", focusId: "comparison_axis", explanationMove: "definition_plus_axis", shapeId: "definition_example", mandatoryUnits: ["subject_name", "definition"], optionalUnits: ["comparison_axes"] }));
  return outlines;
}

function realizeDefinitionOutline(outline, plan = {}) {
  const card = plan.source_cards?.[0] || {};
  const name = unitValues(plan, "subject_name")[0] || chineseLabel(card);
  const definition = stripLeadingSubject(unitValues(plan, "definition")[0] || renderFocus((plan.optional_focus_groups || [])[0]), name);
  if (!definition) return [];
  const terms = unitValues(plan, "definition_units").slice(0, 3);
  if (outline.id === "definition_example" && terms.length) {
    return makeCandidate(outline.id, `${name}可以理解为${definition}；常见线索包括${terms.join("、")}`, outline.focus_id, outline.sentence_shape_id, ["explanation_move"]);
  }
  if (outline.id === "definition_example") return null;
  if (outline.id === "definition_entry") {
    const entry = (plan.optional_focus_groups || []).find((item) => item.id === "entry_example");
    const value = Array.isArray(entry?.value) ? entry.value[0] : entry?.value;
    if (value) return makeCandidate(outline.id, `${name}指${definition}；一个具体例子是：${value}`, outline.focus_id, outline.sentence_shape_id, ["explanation_move", "grounded_example"]);
  }
  if (outline.id === "definition_axis") {
    const axis = (plan.optional_focus_groups || []).find((item) => item.id === "comparison_axes");
    const value = Array.isArray(axis?.value) ? axis.value[0] : axis?.value;
    if (value) return makeCandidate(outline.id, `${name}指${definition}；可用${value}来限定它`, outline.focus_id, outline.sentence_shape_id, ["explanation_move", "comparison_axis"]);
  }
  return makeCandidate(outline.id, `${name}指${definition}`, outline.focus_id, outline.sentence_shape_id, ["density"]);
}

function comparisonOutlines(plan = {}) {
  const cards = plan.source_cards || [];
  if (cards.length < 2) return [];
  const [left, right] = cards;
  const leftTerms = visibleList([...(left.themes || []), ...(left.style_axes || [])], 2);
  const rightTerms = visibleList([...(right.themes || []), ...(right.style_axes || [])], 2);
  const leftWorks = titlesFor(left.representative_works || left.works || [], 1);
  const rightWorks = titlesFor(right.representative_works || right.works || [], 1);
  const outlines = [];
  if (leftTerms.length && rightTerms.length) outlines.push(makeOutline({ id: "comparison_style", focusId: "comparison_axis_style", explanationMove: "style_or_theme_contrast", shapeId: "comparison", mandatoryUnits: ["left_subject", "right_subject"], optionalUnits: ["style_or_theme"] }));
  if (leftWorks.length && rightWorks.length && leftTerms.length && rightTerms.length) outlines.push(makeOutline({ id: "comparison_work", focusId: "comparison_axis_work", explanationMove: "work_based_contrast", workIds: [...leftWorks, ...rightWorks], shapeId: "comparison", mandatoryUnits: ["left_subject", "right_subject"], optionalUnits: ["representative_work", "style_or_theme"] }));
  return outlines;
}

function realizeComparisonOutline(outline, plan = {}) {
  const cards = plan.source_cards || [];
  if (cards.length < 2) return [];
  const [left, right] = cards;
  const leftName = chineseLabel(left);
  const rightName = chineseLabel(right);
  const leftTerms = visibleList([...(left.themes || []), ...(left.style_axes || [])], 2);
  const rightTerms = visibleList([...(right.themes || []), ...(right.style_axes || [])], 2);
  const leftWorks = titlesFor(left.representative_works || left.works || [], 1);
  const rightWorks = titlesFor(right.representative_works || right.works || [], 1);
  if (outline.id === "comparison_style" && leftTerms.length && rightTerms.length) {
    return makeCandidate(outline.id, `${leftName}偏向${leftTerms.join("、")}；${rightName}偏向${rightTerms.join("、")}，区别在关注的风格和问题不同`, outline.focus_id, outline.sentence_shape_id, ["comparison_axis"]);
  }
  if (outline.id === "comparison_work" && leftWorks.length && rightWorks.length && leftTerms.length && rightTerms.length) {
    return makeCandidate(outline.id, `${leftName}可用${leftWorks[0]}看${leftTerms[0]}，${rightName}可用${rightWorks[0]}看${rightTerms[0]}；差别在作品呈现的重心不同`, outline.focus_id, outline.sentence_shape_id, ["comparison_axis", "grounded_example"]);
  }
  return null;
}

export function normalizeSurfaceSkeleton(answer = "") {
  return clean(answer)
    .replace(/《[^》]+》/g, "《X》")
    .replace(/[A-Z][A-Za-z0-9_. -]{1,40}/g, "E")
    .replace(/[一二三四五六七八九十百千万亿两0-9]+(?:世纪|年代|年|个|位|条|项)?/g, "N")
    .replace(/[，,；;：:。！？!?]/g, "P")
    .replace(/[\u4e00-\u9fff]{2,8}(?=是(?:音乐人|作家|电影人|导演|歌手|词作者|艺术或设计人物|科学人物|技术相关人物|思想人物|文化人物|作品|概念))/g, "X")
    .replace(/\s+/g, "")
    .trim();
}

function semanticEffectiveKey(candidate = {}) {
  return clean(candidate.effective_key || "")
    .replace(/shape_order_only/g, "")
    .replace(/[，,；;：:。！？!?\s]/g, "");
}

export function dedupeEffectiveCandidates(candidates = []) {
  const seen = new Set();
  const out = [];
  const collapsed = [];
  for (const candidate of candidates) {
    const failures = candidateFailures(candidate.text);
    const key = semanticEffectiveKey(candidate) || normalizeSurfaceSkeleton(candidate.text);
    if (seen.has(key)) {
      collapsed.push({ candidate_id: candidate.id, reason: "semantic_effective_duplicate", key });
      continue;
    }
    if (failures.length) {
      collapsed.push({ candidate_id: candidate.id, reason: "candidate_failed_guard", failures });
      continue;
    }
    seen.add(key);
    out.push(candidate);
  }
  return { candidates: out.slice(0, 3), collapsed };
}

function openerId(answer = "") {
  const text = clean(answer);
  if (/^《/.test(text)) return "starts_with_work";
  if (/^[^，。；：:]{1,18}是/.test(text)) return "identity_is";
  if (/^聊/.test(text)) return "topic_direct";
  if (/^理解/.test(text)) return "understand";
  return text.slice(0, 8);
}

function candidateFailures(text = "") {
  const failures = [];
  if (!clean(text)) failures.push("empty_candidate");
  if (FORBIDDEN_VISIBLE_RE.test(text)) failures.push("forbidden_template");
  if (RAW_INTERNAL_RE.test(text)) failures.push("raw_internal_leakage");
  if (/另一种创作面向|自身风格|差别会更具体|某种特点|另一条线/.test(text)) failures.push("vague_comparison");
  if (/^(.{1,16})指的是?\1/.test(clean(text))) failures.push("tautological_definition");
  return failures;
}

function outlinesForPlan(semanticPlan = {}) {
  if (semanticPlan.response_act === "list_representative_works") return worksOutlines(semanticPlan);
  if (semanticPlan.response_act === "define_concept") return definitionOutlines(semanticPlan);
  if (semanticPlan.response_act === "simple_comparison") return comparisonOutlines(semanticPlan);
  if (/open/.test(semanticPlan.response_act || "")) return topicOutlines(semanticPlan);
  return identityOutlines(semanticPlan);
}

function realizeOutline(outline = {}, semanticPlan = {}) {
  if (semanticPlan.response_act === "list_representative_works") return realizeWorksOutline(outline, semanticPlan);
  if (semanticPlan.response_act === "define_concept") return realizeDefinitionOutline(outline, semanticPlan);
  if (semanticPlan.response_act === "simple_comparison") return realizeComparisonOutline(outline, semanticPlan);
  if (/open/.test(semanticPlan.response_act || "")) return realizeTopicOutline(outline, semanticPlan);
  return realizeIdentityOutline(outline, semanticPlan);
}

function verifierFailures(candidate = {}, outline = {}, semanticPlan = {}) {
  const failures = candidateFailures(candidate?.text || "");
  const text = clean(candidate?.text || "");
  for (const unitItem of semanticPlan.mandatory_units || []) {
    const values = Array.isArray(unitItem.value) ? unitItem.value : [unitItem.value];
    const mustMention = ["label", "role", "work_titles"].includes(unitItem.kind);
    if (mustMention && values.some((value) => clean(value) && !text.includes(clean(value)))) failures.push("missing_mandatory_unit");
  }
  if (semanticPlan.response_act === "simple_comparison") {
    const labels = (semanticPlan.mandatory_units || []).filter((item) => item.kind === "label").map((item) => clean(item.value));
    if (labels.some((label) => label && !text.includes(label))) failures.push("wrong_entity");
    if (!/(区别|不同|偏向|相比|强调|处理的问题不同|差别是)/.test(text)) failures.push("vague_comparison");
  }
  if (semanticPlan.response_act === "define_concept" && /^(.{1,16})指(?:的是)?\1/.test(text)) failures.push("tautological_definition");
  if (!outline?.explanation_move) failures.push("verifier_internal_error");
  return [...new Set(failures)];
}

export function generateCandidateLifecycle(semanticPlan = {}) {
  const planId = semanticPlan?.semantic_signature || "missing_plan";
  if (!semanticPlan?.mandatory_units?.length) {
    return {
      plan_id: planId,
      planned_candidate_outlines: [],
      generated_candidates: [],
      effective_dedup_groups: [],
      verifier_rejections: [{ candidate_id: null, reasons: ["missing_mandatory_unit"] }],
      rejection_reasons: ["missing_semantic_plan"],
      surviving_candidates: [],
      selected_candidate: null
    };
  }
  const outlines = outlinesForPlan(semanticPlan);
  const generated = [];
  const verifierRejections = [];
  for (const outline of outlines) {
    const candidate = realizeOutline(outline, semanticPlan);
    if (!candidate) {
      verifierRejections.push({ candidate_id: outline.id, outline, reasons: ["unsupported_fact"] });
      continue;
    }
    generated.push({ ...candidate, outline });
  }
  const dedupGroups = [];
  const seen = new Map();
  const seenText = new Map();
  const survivors = [];
  for (const candidate of generated) {
    const failures = verifierFailures(candidate, candidate.outline, semanticPlan);
    const key = semanticEffectiveKey(candidate) || normalizeSurfaceSkeleton(candidate.text);
    const textKey = compact(candidate.text);
    if (seenText.has(textKey)) {
      const group = { key: textKey, kept_candidate_id: seenText.get(textKey), duplicate_candidate_id: candidate.id, reason: "duplicate_meaning" };
      dedupGroups.push(group);
      verifierRejections.push({ candidate_id: candidate.id, outline: candidate.outline, reasons: ["duplicate_meaning"] });
      continue;
    }
    if (seen.has(key)) {
      const group = { key, kept_candidate_id: seen.get(key), duplicate_candidate_id: candidate.id, reason: "duplicate_meaning" };
      dedupGroups.push(group);
      verifierRejections.push({ candidate_id: candidate.id, outline: candidate.outline, reasons: ["duplicate_meaning"] });
      continue;
    }
    if (failures.length) {
      verifierRejections.push({ candidate_id: candidate.id, outline: candidate.outline, reasons: failures });
      continue;
    }
    seen.set(key, candidate.id);
    seenText.set(textKey, candidate.id);
    survivors.push(candidate);
  }
  return {
    plan_id: planId,
    planned_candidate_outlines: outlines,
    generated_candidates: generated,
    effective_dedup_groups: dedupGroups,
    verifier_rejections: verifierRejections,
    rejection_reasons: unique(verifierRejections.flatMap((item) => item.reasons || [])),
    surviving_candidates: survivors.slice(0, 3),
    selected_candidate: survivors[0] || null
  };
}

export function generateControlledVariationCandidates(semanticPlan = {}) {
  const lifecycle = generateCandidateLifecycle(semanticPlan);
  const deduped = { candidates: lifecycle.surviving_candidates, collapsed: lifecycle.verifier_rejections };
  return {
    ...deduped,
    lifecycle,
    one_candidate_reason: deduped.candidates.length <= 1 ? "insufficient_supported_meaningful_axes" : ""
  };
}

function sessionId(session = {}) {
  return clean(session.surface_session_id || session.session_id || session.sessionId || "");
}

export function ensureSurfaceSessionId(session = {}) {
  const existing = sessionId(session);
  if (existing) return existing;
  const basis = `${session.lastUserText || ""}|${session.lastAnswer || ""}|${session.recentTurns?.length || 0}`;
  return `surface-${hashString(basis).toString(16)}`;
}

function variationSeed({ session = {}, turnIndex = 0, semanticSignature = "" } = {}) {
  return hashString(`${ensureSurfaceSessionId(session)}|${turnIndex}|${semanticSignature}|${VARIATION_VERSION}`);
}

function recentHistory(session = {}) {
  return Array.isArray(session.surface_history) ? session.surface_history.slice(-8) : [];
}

function rankCandidates(candidates = [], session = {}, seed = 0) {
  const history = recentHistory(session);
  const last = history.at(-1) || {};
  return candidates
    .map((candidate) => {
      let penalty = 0;
      if (candidate.skeleton && candidate.skeleton === last.normalized_surface_skeleton) penalty += 4;
      if (candidate.opener_id && candidate.opener_id === last.opener_id) penalty += 1.5;
      if (candidate.focus_id && candidate.focus_id === last.chosen_focus_id) penalty += 1.2;
      const seeded = ((hashString(`${seed}|${candidate.id}`) % 1000) / 1000) * 0.1;
      return { ...candidate, repetition_penalty: Number(penalty.toFixed(3)), score: Number((10 - penalty + seeded).toFixed(3)) };
    })
    .sort((a, b) => b.score - a.score);
}

function appendHistory(session = {}, record = {}) {
  return [...recentHistory(session), record].slice(-8);
}

export function realizeControlledVariation({
  query = "",
  answer = "",
  session = {},
  plan = {},
  draft = {},
  semanticPlan = null,
  evidenceIds = []
} = {}) {
  const sid = ensureSurfaceSessionId(session);
  const turnIndex = Array.isArray(session.recentTurns) ? session.recentTurns.length : 0;
  const builtPlan = semanticPlan || buildSemanticVariationPlan({ query, plan, draft, evidenceIds });
  const semanticSignature = clean(builtPlan?.semantic_signature || plan.semantic_signature || `${draft.operation || ""}|${query}`);
  const seed = variationSeed({ session: { ...session, surface_session_id: sid }, turnIndex, semanticSignature });
  const generated = builtPlan ? generateControlledVariationCandidates(builtPlan) : { candidates: [], collapsed: [], one_candidate_reason: "missing_semantic_plan" };
  const ranked = rankCandidates(generated.candidates, { ...session, surface_session_id: sid }, seed);
  const selected = ranked[0] || null;
  const finalText = selected?.text || clean(answer);
  const record = {
    semantic_signature: semanticSignature,
    chosen_focus_id: selected?.focus_id || "stable",
    sentence_shape_id: selected?.shape_id || "stable",
    opener_id: selected?.opener_id || openerId(finalText),
    clause_plan_id: selected?.shape_id || "stable",
    normalized_surface_skeleton: selected?.skeleton || normalizeSurfaceSkeleton(finalText),
    evidence_ids: builtPlan?.evidence_ids || evidenceIds,
    answer_length: clean(finalText).length,
    turn_index: turnIndex
  };
  return {
    answer: finalText,
    nextSession: { surface_session_id: sid, surface_history: appendHistory(session, record) },
    trace: {
      variation_version: VARIATION_VERSION,
      eligible: Boolean(builtPlan),
      content_authority: builtPlan ? "semantic_plan" : "stable_answer_fallback",
      variation_seed: seed,
      candidate_count: generated.candidates.length || 1,
      effective_candidate_count: generated.candidates.length || 1,
      candidate_shape_ids: generated.candidates.map((candidate) => candidate.shape_id),
      candidate_focus_ids: generated.candidates.map((candidate) => candidate.focus_id),
      candidate_skeletons: generated.candidates.map((candidate) => candidate.skeleton),
      collapsed_candidate_reasons: generated.collapsed || [],
      selected_candidate_id: selected?.id || "stable_fallback",
      one_candidate_reason: generated.one_candidate_reason || "",
      repetition_penalty: selected?.repetition_penalty || 0,
      semantic_plan: builtPlan
        ? {
            semantic_signature: builtPlan.semantic_signature,
            response_act: builtPlan.response_act,
            subject_ids: builtPlan.subject_ids,
            mandatory_units: builtPlan.mandatory_units,
            optional_focus_group_count: builtPlan.optional_focus_groups.length,
            evidence_ids: builtPlan.evidence_ids,
            language: builtPlan.language
          }
        : null,
      semantic_verifier_result: { ok: !candidateFailures(finalText).length, hard_failures: candidateFailures(finalText) }
    }
  };
}

export { FORBIDDEN_VISIBLE_RE };
