import { CULTURE_CARDS } from "./culture_cards.generated.js";
import { detectCultureDomain } from "./culture_runtime.js";
import { R23_KNOWLEDGE_PRIMITIVES } from "./r23_knowledge_primitives.js";

const R23_CARDS = [...CULTURE_CARDS, ...R23_KNOWLEDGE_PRIMITIVES];
const CARD_BY_ID = new Map(R23_CARDS.map((card) => [card.id, card]));
const ALIASES = R23_CARDS.flatMap((card) =>
  (card.names || [])
    .filter((name) => String(name || "").trim().length > 1)
    .map((name) => ({ name, compact: compact(name), id: card.id, length: compact(name).length }))
).sort((a, b) => b.length - a.length);

const R23_CONCEPTS = Object.freeze({
  seasonality: {
    ids: ["concept.seasonality"],
    labels: ["季节感", "季节", "季语"],
    domains: ["literature.japanese", "literature", "poetry", "film", "visual"],
    definition_units: ["季节或物候不只是背景", "它组织时间、情绪和变化感"],
    example_units: ["在俳句和日本文学里，季节常把短场景变成更长的时间感"],
    relation_units: ["season_to_time", "season_to_emotion"]
  },
  impermanence: {
    ids: ["concept.impermanence"],
    labels: ["无常"],
    domains: ["literature.japanese", "literature", "poetry", "visual"],
    definition_units: ["无常是对变化和消逝的敏感", "它让美感带着时间压力"],
    example_units: ["一处风景或一次相遇，会因为会消失而变得更重"],
    relation_units: ["change_to_beauty"]
  },
  modern_self: {
    ids: ["concept.modern_self"],
    labels: ["近代自我", "现代自我"],
    domains: ["literature.japanese", "literature", "history"],
    definition_units: ["近代自我指个人开始更强地意识到自己和社会秩序的冲突"],
    example_units: ["近代小说常把内心、职责和孤独放在一起写"],
    relation_units: ["self_to_social_pressure"]
  }
});

const THEME_LABELS = Object.freeze({
  modernization: "现代化",
  youth_memory: "青春记忆",
  urban_rural_displacement: "城乡变化",
  social_observation: "社会观察",
  public_private_overlap: "公共经验和私人记忆",
  plainspoken_pressure: "直白的压力",
  folk_rock_texture: "民谣/摇滚质感",
  narrative_songwriting: "叙事写作",
  mature_storytelling: "成熟叙事",
  historical_position: "时代位置",
  modern_self: "近代自我",
  seasonality: "季节感",
  impermanence: "无常",
  social_pressure: "社会压力",
  war_aftermath: "战后经验",
  urban_loneliness: "城市孤独",
  memory: "记忆",
  beauty: "美感",
  distance: "距离感",
  sensory_image: "感官意象"
  ,
  family: "家庭",
  daily_life: "日常",
  postwar_japan: "战后日本",
  static_framing: "固定机位",
  domestic_detail: "家庭细节",
  evolution: "进化论",
  natural_selection: "自然选择",
  scientific_argument: "科学论证",
  evidence_chain: "证据链",
  comparative_observation: "比较观察",
  viewing: "观看方式",
  material: "材料",
  institution: "制度语境",
  form_experiment: "形式实验"
});

const QUERY_CONTRASTS = Object.freeze([
  {
    id: "album_single_creation",
    test: /(专辑|单曲)/,
    domain: "music.mandopop",
    factual_units: ["专辑更像整体结构，单曲更像一次集中表达"],
    contrast_units: ["整体结构/集中表达"],
    concept_units: ["主题顺序", "钩子和情绪"]
  },
  {
    id: "japan_taiwan_literature",
    test: /(日本文学).*(台湾文学)|(台湾文学).*(日本文学)/,
    domain: "literature.asian_general",
    factual_units: ["两者都常写现代化里的个人、家庭和记忆"],
    contrast_units: ["日本文学常压细心理，台湾文学常连着殖民、乡土和身份转换"],
    concept_units: ["现代化", "记忆", "身份转换"]
  },
  {
    id: "stage_detail_conflict",
    test: /(舞台剧|舞台|戏剧).*(细节|冲突)|(细节|冲突).*(舞台剧|舞台|戏剧)/,
    domain: "theater",
    factual_units: ["细节让场景具体，冲突让人物行动"],
    contrast_units: ["细节/冲突", "场景/行动"],
    concept_units: ["场景", "冲突"]
  },
  {
    id: "music_literature_poetry",
    test: /(文学|诗歌|诗).*(像|相似)|像.*(文学|诗歌|诗)/,
    domain: "literature",
    factual_units: ["短形式依靠节奏和意象撑住"],
    contrast_units: ["短形式/情绪密度"],
    concept_units: ["节奏", "意象", "压缩表达"]
  }
]);

const INTERPRETIVE_UNITS = Object.freeze([
  {
    id: "childhood_not_only_literal",
    test: /(童年).*(真是|真的是|只是|讲的真|讲的是)/,
    factual_units: ["这里的童年不只是在说年龄阶段"],
    concept_units: ["共同记忆", "时间过去", "失去感"],
    relation_units: ["childhood_to_shared_memory"]
  }
]);

function clean(text) {
  return String(text || "").trim();
}

function compact(text) {
  return clean(text).toLowerCase().replace(/[《》「」『』“”"'\s,，。.!！?？:：;；、]/g, "");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function card(id) {
  return CARD_BY_ID.get(id) || null;
}

function title(name = "") {
  const text = clean(name);
  if (!text) return "";
  if (/^《.*》$/.test(text)) return text;
  return `《${text.replace(/[《》]/g, "")}》`;
}

function displayName(item) {
  if (!item) return "";
  const name = item.names?.[0] || item.id || "";
  return item.entity_type === "work" || item.id?.startsWith("work.") ? title(name) : name;
}

function explicitCards(query = "") {
  const normalized = compact(query);
  const found = [];
  for (const alias of ALIASES) {
    if (!alias.compact || !normalized.includes(alias.compact)) continue;
    const item = card(alias.id);
    if (item && !found.some((existing) => existing.id === item.id)) found.push(item);
  }
  return found;
}

function activeCards(session = {}) {
  const ids = unique([
    ...(Array.isArray(session.activeEntityIds) ? session.activeEntityIds : []),
    ...(Array.isArray(session.active_entity_ids) ? session.active_entity_ids : []),
    ...(Array.isArray(session.activeWorkIds) ? session.activeWorkIds : []),
    ...(Array.isArray(session.active_work_ids) ? session.active_work_ids : []),
    ...(Array.isArray(session.last_bound_referent_ids) ? session.last_bound_referent_ids : []),
    session.last_focus_entity_id || "",
    ...(session.r23_active_referent_ids || [])
  ]);
  return ids.map(card).filter(Boolean);
}

function activeConcepts(session = {}) {
  return Array.isArray(session.r23_active_concepts) ? session.r23_active_concepts : [];
}

function subjectFromFamiliarity(query = "") {
  const text = clean(query);
  const match = text.match(/你(?:知道|了解|看过|读过|听过|懂)(.+?)(?:吗|么|嘛|[？?]|$)/);
  return clean(match?.[1] || "");
}

function asksLiteralHumanExperience(query = "") {
  return /(亲眼|亲身|现场|本人|作为人|真的(?:看过|读过|听过)|你自己(?:看过|读过|听过)|你的经历|你的记忆|你小时候)/.test(clean(query));
}

function queryContrast(query = "") {
  return QUERY_CONTRASTS.find((item) => item.test.test(clean(query))) || null;
}

function interpretiveUnit(query = "") {
  return INTERPRETIVE_UNITS.find((item) => item.test.test(clean(query))) || null;
}

function operationFromQuery(query = "", session = {}) {
  const text = clean(query);
  if (/(简单一点|简单点|短一点|能不能简单|说简单点|说人话)/.test(text)) return "simplify_previous";
  if (/(换个说法|重新说|换句话说|说清楚|别这么说)/.test(text)) return "rewrite_previous";
  if (/(展开|详细一点|多说一点)/.test(text)) return "expand_previous";
  if (/羡慕|想到童年|让我想起|有点难过|会想到/.test(text)) return "respond_to_affective_disclosure";
  if (/为什么.*(提到|说到)|怎么.*(提到|说到)/.test(text)) return "explain_relation";
  if (/很喜欢|喜欢你/.test(text)) return "acknowledge_compliment";
  if (/更深|更深的提问|还能问/.test(text)) return "ask_deepening_question";
  if (/你是谁|你是什么/.test(text)) return "state_boundary";
  if (/(作家|作者).{0,12}(作品|代表作)|(作品|代表作).{0,12}(作家|作者)/.test(text)) return "list_people_and_works";
  if (/有什么代表作|代表作品|代表作有哪些|哪些作品|有哪些作品|有什么作品|有什么歌|有哪些歌|哪几首/.test(text)) return "list_representative_works";
  if (/(作家|作者|代表人物|人物).{0,10}(列举|有哪些|三个|哪几位)|有哪些.{0,8}(作家|作者)/.test(text)) return "list_representative_people";
  if (/什么是|是什么意思|怎么理解/.test(text)) return "define_concept";
  if (/有什么特点|特点是什么|风格|代表性|代表在哪里/.test(text)) return "explain_characteristics";
  if (queryContrast(text)) return /像|相似/.test(text) && !/[？?吗]/.test(text) ? "respond_to_analogy" : "compare_forms";
  if (/区别|不同|差别|差在哪里|有什么共同|比较(?!羡慕)/.test(text)) return "compare_forms";
  if (interpretiveUnit(text)) return "evaluate_bounded";
  if (/(什么关系|有什么关系|关系吗)/.test(text)) return "explain_relation";
  if (/推荐|还有谁|还有其他|可以听谁|可以看谁|可以读谁/.test(text)) return "recommend_items";
  if (/像|很像|相似|有点像/.test(text)) return "respond_to_analogy";
  if (/你觉得|怎么样|厉害在哪里|好在哪里/.test(text)) return "evaluate_bounded";
  if (/你(?:知道|了解|看过|读过|听过|懂)/.test(text)) {
    return asksLiteralHumanExperience(text) ? "boundary_query" : "acknowledge_familiarity";
  }
  if (/^是|是不是|对吗|是那个/.test(text)) return "confirm_referent";
  if (/回到刚才|刚才那个人|刚才那个/.test(text)) return "topic_reentry";
  if (session.r23_last_content_plan?.requested_operation) return "followup_answer";
  return "direct_answer";
}

function inferResponseAct(operation) {
  const map = {
    acknowledge_familiarity: "acknowledge_familiarity",
    confirm_referent: "acknowledge_familiarity",
    list_representative_works: "list_works",
    list_representative_people: "list_people",
    list_people_and_works: "list_people",
    define_concept: "define_concept",
    explain_characteristics: "define_concept",
    evaluate_bounded: "evaluate_bounded",
    recommend_items: "recommend_items",
    compare_forms: "compare_forms",
    explain_relation: "explain_relation",
    simplify_previous: "transform_previous_answer",
    rewrite_previous: "transform_previous_answer",
    expand_previous: "transform_previous_answer",
    respond_to_analogy: "respond_to_analogy",
    respond_to_affective_disclosure: "respond_to_affective_disclosure",
    acknowledge_compliment: "acknowledge_compliment",
    ask_deepening_question: "ask_deepening_question",
    state_boundary: "state_boundary",
    boundary_query: "state_boundary",
    topic_reentry: "topic_reentry"
  };
  return map[operation] || "answer";
}

function selectedTarget({ query, session, operation }) {
  const explicit = explicitCards(query);
  if (explicit.length) return { card: explicit[0], binding_kind: "explicit", candidates: explicit };
  if (
    /^是|是不是|对吗|是那个/.test(clean(query)) ||
    /^(他|她|它|他的|她的|它的|这些|这个|这本|这首)/.test(clean(query)) ||
    /代表作|特点|怎么样|什么关系|像|相似|区别|差别/.test(query)
  ) {
    const active = activeCards(session);
    if (active.length) return { card: active[0], binding_kind: "active_referent", candidates: active };
  }
  if (["simplify_previous", "rewrite_previous", "expand_previous"].includes(operation)) {
    const last = session.r23_last_content_plan;
    const target = last?.subject_ids?.map(card).filter(Boolean)[0] || activeCards(session)[0] || null;
    return { card: target, binding_kind: "last_answer", candidates: target ? [target] : [] };
  }
  return { card: null, binding_kind: "none", candidates: [] };
}

function conceptFromQuery(query = "", session = {}) {
  const text = clean(query);
  const term = clean(text.match(/(?:什么是|是什么意思|怎么理解)(.+?)(?:[？?。.!！]|$)/)?.[1] || text);
  const candidates = Object.values(R23_CONCEPTS).filter((concept) =>
    concept.labels.some((label) => term.includes(label) || label.includes(term))
  );
  if (candidates.length) return { concept: candidates[0], binding_kind: "explicit_concept", term };
  const recent = activeConcepts(session);
  const found = recent.find((concept) => (concept.labels || []).some((label) => term.includes(label) || label.includes(term)));
  if (found) return { concept: found, binding_kind: "recent_concept", term };
  return { concept: null, binding_kind: "none", term };
}

function worksFor(target) {
  if (!target) return [];
  const ids = target.representative_works?.length ? target.representative_works : target.works || [];
  return ids.map(card).filter(Boolean).slice(0, 4);
}

function domainAllowedByQuery(itemDomain = "", query = "") {
  const text = clean(query);
  if (/港台/.test(text)) return /^music\.(taiwan|hongkong|mandopop)$/.test(itemDomain);
  if (/台湾/.test(text)) return /^music\.(taiwan|mandopop)$/.test(itemDomain);
  if (/香港|粤语/.test(text)) return /^music\.hongkong$/.test(itemDomain);
  return true;
}

function peopleForDomain(domain = "", excludeIds = [], query = "") {
  const family = domain.split(".")[0] || domain;
  return R23_CARDS.filter(
    (item) =>
      item.entity_type === "person" &&
      item.domain &&
      (item.domain === domain || item.domain.startsWith(`${family}.`) || domain.startsWith(item.domain.split(".")[0] || "")) &&
      domainAllowedByQuery(item.domain, query) &&
      !excludeIds.includes(item.id)
  ).slice(0, 4);
}

function representativePeopleForDomain(domain = "", query = "") {
  const concept = R23_CARDS.find((item) => item.entity_type === "concept" && item.domain === domain);
  const related = (concept?.related_entities || [])
    .map((rel) => card(rel.id))
    .filter((item) => item?.entity_type === "person" && domainAllowedByQuery(item.domain, query))
    .slice(0, 4);
  return related.length ? related : peopleForDomain(domain, [], query);
}

function firstRepresentativeWork(person) {
  const workId = person?.representative_works?.[0] || person?.works?.[0] || "";
  const work = card(workId);
  return work ? displayName(work) : "";
}

function themeLabels(cardLike) {
  return (cardLike?.themes || [])
    .map((theme) => THEME_LABELS[theme] || theme)
    .filter(Boolean)
    .slice(0, 4);
}

function styleLabels(cardLike) {
  return (cardLike?.style_axes || [])
    .map((axis) => THEME_LABELS[axis] || axis.replace(/_/g, " "))
    .filter(Boolean)
    .slice(0, 3);
}

function factualCoreFor(cardLike) {
  if (!cardLike) return "";
  if (cardLike.factual_core || cardLike.short_intro) return cardLike.factual_core || cardLike.short_intro;
  if (cardLike.roles?.length) return cardLike.roles.join("、");
  if (cardLike.entity_type === "concept" && cardLike.definition_units?.length) return cardLike.definition_units.join("、");
  return displayName(cardLike);
}

function conceptsFromCard(target) {
  const out = [];
  for (const concept of Object.values(R23_CONCEPTS)) {
    if ((target?.themes || []).some((theme) => concept.ids.includes(`concept.${theme}`) || concept.labels.includes(THEME_LABELS[theme]))) {
      out.push(concept);
    } else if ((target?.themes || []).includes("seasonality") && concept === R23_CONCEPTS.seasonality) {
      out.push(concept);
    }
  }
  return out;
}

function answerShape(operation) {
  if (/list/.test(operation)) return "items_first";
  if (/define/.test(operation)) return "definition_first";
  if (/evaluate/.test(operation)) return "judgment_first";
  if (/recommend/.test(operation)) return "items_with_criteria";
  if (/compare/.test(operation)) return "compact_contrast";
  if (/simplify/.test(operation)) return "one_sentence";
  if (/rewrite/.test(operation)) return "same_semantics_new_clause_order";
  return "compact_direct";
}

function contentUnitsFor({ operation, target, concept, session, query }) {
  const factual_units = [];
  const concept_units = [];
  const relation_units = [];
  const contrast_units = [];
  const list_items = [];
  const recommendation_items = [];
  const recommendation_criteria = [];
  let stance = "";
  let uncertainty = "";

  const contrast = queryContrast(query);
  if (contrast && ["compare_forms", "respond_to_analogy"].includes(operation)) {
    factual_units.push(...contrast.factual_units);
    concept_units.push(...contrast.concept_units);
    contrast_units.push(...contrast.contrast_units);
  }

  const interpretive = interpretiveUnit(query);
  if (interpretive && operation === "evaluate_bounded") {
    factual_units.push(...interpretive.factual_units);
    concept_units.push(...interpretive.concept_units);
    relation_units.push(...interpretive.relation_units);
  }

  if (target) {
    factual_units.push(factualCoreFor(target));
    concept_units.push(...themeLabels(target));
    relation_units.push(...styleLabels(target));
  }

  if (concept) {
    concept_units.push(...concept.definition_units);
    relation_units.push(...concept.relation_units);
  }

  if (operation === "list_representative_works" && target) {
    list_items.push(...worksFor(target).map((item) => ({ id: item.id, label: displayName(item), qualifier: themeLabels(item)[0] || "" })));
  }
  if (operation === "list_representative_people" || operation === "list_people_and_works") {
    const domain = target?.domain || detectCultureDomain(query, session);
    list_items.push(
      ...representativePeopleForDomain(domain, query).map((item) => ({
        id: item.id,
        label: displayName(item),
        qualifier: themeLabels(item)[0] || "",
        work_label: operation === "list_people_and_works" ? firstRepresentativeWork(item) : ""
      }))
    );
  }
  if (operation === "recommend_items") {
    const domain = target?.domain || session.activeDomain || detectCultureDomain(query, session);
    const active = activeCards(session)[0];
    const exclude = target ? [target.id] : active ? [active.id] : [];
    recommendation_items.push(
      ...peopleForDomain(domain, exclude, query).map((item) => ({
        id: item.id,
        label: displayName(item),
        criterion: styleLabels(item)[0] || themeLabels(item)[0] || "风格"
      }))
    );
    recommendation_criteria.push("风格差异", "入门性");
  }
  if (operation === "evaluate_bounded") {
    stance = "bounded_light_judgment";
  }
  if (operation === "explain_relation") {
    uncertainty = "no_direct_factual_relation";
    factual_units.push("没有直接事实关系");
    relation_units.push("conversation_association_only");
  }
  if (["simplify_previous", "rewrite_previous", "expand_previous"].includes(operation) && session.r23_last_content_plan) {
    const last = session.r23_last_content_plan;
    factual_units.push(...(last.factual_units || []).slice(0, 2));
    concept_units.push(...(last.concept_units || []).slice(0, 4));
    relation_units.push(...(last.relation_units || []).slice(0, 3));
    list_items.push(...(last.list_items || []).slice(0, 4));
    recommendation_items.push(...(last.recommendation_items || []).slice(0, 4));
    stance = last.stance || stance;
    uncertainty = last.uncertainty || uncertainty;
  }

  return {
    factual_units: unique(factual_units).slice(0, 4),
    concept_units: unique(concept_units).slice(0, 6),
    relation_units: unique(relation_units).slice(0, 5),
    contrast_units: unique(contrast_units).slice(0, 4),
    list_items: list_items.slice(0, 4),
    recommendation_items: recommendation_items.slice(0, 4),
    recommendation_criteria: unique(recommendation_criteria).slice(0, 3),
    stance,
    uncertainty
  };
}

export function buildR23ContentPlan({ query = "", session = {} } = {}) {
  const text = clean(query);
  const requested_operation = operationFromQuery(text, session);
  const conceptBinding = requested_operation === "define_concept" ? conceptFromQuery(text, session) : { concept: null, binding_kind: "none", term: "" };
  const targetBinding = selectedTarget({ query: text, session, operation: requested_operation });
  const target = targetBinding.card;
  const contrast = queryContrast(text);
  const domain =
    conceptBinding.concept?.domains?.[0] ||
    target?.domain ||
    contrast?.domain ||
    session.activeDomain ||
    session.active_domain ||
    detectCultureDomain(text, session);
  const units = contentUnitsFor({
    operation: requested_operation,
    target,
    concept: conceptBinding.concept,
    session,
    query: text
  });
  const subject_ids = unique([
    target?.id || "",
    ...(conceptBinding.concept?.ids || []),
    ...(requested_operation.includes("previous") ? session.r23_last_content_plan?.subject_ids || [] : [])
  ]);
  const active_referent = target?.id || conceptBinding.concept?.ids?.[0] || subject_ids[0] || "";
  const response_act = inferResponseAct(requested_operation);
  const evidence_ids = unique([
    ...(target ? [target.id] : []),
    ...(units.list_items || []).map((item) => item.id),
    ...(units.recommendation_items || []).map((item) => item.id),
    ...(conceptBinding.concept?.ids || [])
  ]);
  const plan = {
    version: "r23.content_plan.v1",
    response_act,
    subject_ids,
    active_referent,
    domain,
    requested_operation,
    ...units,
    boundary_requirements: [],
    answer_shape: answerShape(requested_operation),
    evidence_ids,
    binding: {
      kind: conceptBinding.concept ? conceptBinding.binding_kind : targetBinding.binding_kind,
      referent_candidates: targetBinding.candidates.map((item) => item.id),
      selected_referent: active_referent,
      selected_domain: domain,
      domain_candidates: unique([domain, target?.domain || "", session.activeDomain || ""]).filter(Boolean),
      selection_evidence: evidence_ids,
      ambiguity_reason: ""
    },
    active_concepts: unique([...conceptsFromCard(target), conceptBinding.concept].filter(Boolean).flatMap((item) => item.ids)).map((id) => {
      const concept = Object.values(R23_CONCEPTS).find((item) => item.ids.includes(id));
      return concept || null;
    }).filter(Boolean),
    source: "r23_candidate_plan"
  };
  if (!active_referent && ["list_representative_works", "explain_characteristics", "evaluate_bounded"].includes(requested_operation)) {
    plan.binding.ambiguity_reason = "missing_active_referent";
  }
  if (requested_operation === "acknowledge_familiarity" && !target && subjectFromFamiliarity(text)) {
    plan.binding.ambiguity_reason = "unrecognized_familiarity_subject";
  }
  return plan;
}

export function cardNameForR23(id = "") {
  return displayName(card(id));
}
