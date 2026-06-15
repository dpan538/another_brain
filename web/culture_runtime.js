import { CULTURE_CARDS } from "./culture_cards.generated.js";
import { planCultureAnswer, verifyCultureDraft } from "./culture_planner.js";

const COPYRIGHT_REQUEST_RE = /(歌词|原文|唱词|逐字|整首|全文|整段|一大段|贴出来|逐句翻译)/;

function clean(text) {
  return String(text || "").trim();
}

function compact(text) {
  return clean(text).toLowerCase().replace(/[《》「」『』“”"'\s,，。.!！?？:：;；、]/g, "");
}

function includesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function makeOperation(questionType) {
  const map = {
    overview: "culture_overview_with_cards",
    works_list: "culture_list_works_from_cards",
    representative_works: "culture_list_representative_works_from_cards",
    author_list: "culture_list_authors_from_cards",
    explain_work: "culture_explain_entity_from_card",
    entry_path: "culture_recommend_entry_path_from_cards",
    reading_recommendation: "culture_recommend_entry_path_from_cards",
    listen_recommendation: "culture_recommend_listening_path_from_cards",
    compare: "culture_compare_with_axes",
    country_relation: "culture_explain_country_relation",
    period_relation: "culture_explain_period_relation",
    theme_explanation: "culture_explain_theme",
    why_it_matters: "culture_explain_significance",
    no_lyrics_boundary: "copyright_boundary_check",
    follow_up_explain_last_entity: "bind_then_explain_culture_entity",
    follow_up_compare_last_two: "bind_then_compare_culture_entities",
    user_asks_opinion: "culture_opinion_with_boundaries",
    user_asks_fact: "culture_fact_with_cards",
    user_asks_interpretation: "culture_interpretation_with_cards"
  };
  return map[questionType] || "culture_answer_with_cards";
}

function primaryName(card) {
  return card?.names?.[0] || card?.id || "";
}

function isOneCharAlias(alias) {
  return [...alias].length <= 1;
}

export function buildCultureIndex(cards = CULTURE_CARDS) {
  const byId = new Map();
  const byDomain = new Map();
  const aliases = [];
  for (const card of cards) {
    byId.set(card.id, card);
    if (!byDomain.has(card.domain)) byDomain.set(card.domain, []);
    byDomain.get(card.domain).push(card);
    for (const name of card.names || []) {
      const alias = compact(name);
      if (!alias) continue;
      aliases.push({ alias, raw: name, id: card.id, length: alias.length });
    }
  }
  aliases.sort((a, b) => b.length - a.length);
  return { cards, byId, byDomain, aliases };
}

const DEFAULT_INDEX = buildCultureIndex(CULTURE_CARDS);

export function detectCultureDomain(query, state = {}) {
  const text = clean(query);
  if (includesAny(text, [/罗大佑|李宗盛|Lo Ta-yu|Luo Dayou|华语流行|中文流行|台湾流行|之乎者也|鹿港小镇|童年|恋曲1980|恋曲1990|东方之珠/])) return "music.mandopop";
  if (includesAny(text, [/日本文学|日本小说|日本作家|夏目漱石|川端康成|太宰治|人间失格|村上春树|芭蕉|俳句|雪国|少爷|《心》|战后日本/])) return "literature.japanese";
  if (includesAny(text, [/存在主义|真实性|本真|德里达|解构|记忆和叙述|记忆与叙述|沉默.*回答|名字.*记忆|语言.*背叛|问题没有答案|没有答案.*值得问/])) return "philosophy";
  if (includesAny(text, [/Robert Lowell|罗伯特·洛厄尔|洛厄尔|自白诗|摄影|照片|杜尚|美术馆|艺术史|诗和歌词|失败情绪|照片没有失败/])) return "poetry.art";
  if (state?.last_domain) return state.last_domain;
  return "generic";
}

export function detectCultureQuestionType(query, state = {}) {
  const text = clean(query);
  const hasNoLyricsExplain = /(不要|不贴|不用).{0,6}歌词/.test(text) && /(解释|讲讲|重要|为什么|意义)/.test(text);
  const hasSafeSummaryInstead = /(总结|概括|主题).{0,12}(不是|而不是|不要).{0,12}(原文|歌词)/.test(text);
  const hasFollowup = /(这首|这本|这个(?!国家)|那他呢|^他|他适合|第一首|第一本|那两个|继续说|再展开|它为什么重要|那谁更冷|这张专辑|那战后呢|那这首)/.test(text);
  if (hasSafeSummaryInstead) return "follow_up_explain_last_entity";
  if (hasNoLyricsExplain) return "why_it_matters";
  if (COPYRIGHT_REQUEST_RE.test(text)) return "no_lyrics_boundary";
  if (hasFollowup && /(那两个|谁更|传统和现代|共同|比较)/.test(text) && Array.isArray(state.last_two_entity_ids) && state.last_two_entity_ids.length >= 2) return "follow_up_compare_last_two";
  if (/(日本和日本文学|国家.*文学|文学.*国家|一回事|同一个东西|关系)/.test(text) && /日本/.test(text)) return "country_relation";
  if (/(代表作家|作家有哪些|有哪些.*作家|哪些.*作家|重要作家)/.test(text)) return "author_list";
  if (/(代表作|代表性作品|代表作品|经典作品)/.test(text)) return "representative_works";
  if (/(先听|从哪.*听|听哪|入门歌)/.test(text)) return "listen_recommendation";
  if (/(从什么开始|从哪.*开始|开始读|入门|第一本|先读|读什么|怎么读|适合从哪本)/.test(text)) return "reading_recommendation";
  if (/那两个|谁更|共同点|区别|不同|差在哪|比较(?!好)|和.+有什么共同|vs|VS/.test(text)) return hasFollowup && /那两个|谁更/.test(text) ? "follow_up_compare_last_two" : "compare";
  if (hasFollowup && /(继续说|再展开|这首|这本|这个(?!国家)|第一首|第一本|这张专辑|它为什么重要|那这首|那战后)/.test(text)) return "follow_up_explain_last_entity";
  if (/(有什么歌曲|有哪些歌|哪几首|作品有哪些|有哪些作品|有什么作品|歌单|曲目)/.test(text)) return "works_list";
  if (/(为什么重要|重要性|为什么.*重要|意义)/.test(text)) return "why_it_matters";
  if (/(是什么意思|怎么理解|如何理解|这句话|讲什么|在讲什么|大概在讲|你懂什么|是什么|谁是|是谁)/.test(text)) return "explain_work";
  if (/(你怎么看|你觉得|有没有意思)/.test(text)) return "user_asks_opinion";
  if (/(主题|意思|概念)/.test(text)) return "theme_explanation";
  if (/(了解|知道)/.test(text)) return "overview";
  return "user_asks_interpretation";
}

function matchAlias(query, index) {
  const normalized = compact(query);
  const matches = [];
  for (const alias of index.aliases) {
    if (isOneCharAlias(alias.alias) && !new RegExp(`《${alias.raw}》`).test(query)) continue;
    if (normalized.includes(alias.alias)) {
      const card = index.byId.get(alias.id);
      if (card && !matches.some((item) => item.id === card.id)) matches.push(card);
    }
  }
  return matches;
}

export function bindCultureFollowup(query, state = {}, candidates = [], index = DEFAULT_INDEX) {
  const text = clean(query);
  if (!/(这首|这本|这个(?!国家)|那他呢|^他|他适合|第一首|第一本|那两个|继续说|再展开|它为什么重要|那谁更冷|这张专辑|那这首|那战后|总结|概括|主题)/.test(text)) {
    return null;
  }
  if (/(那两个|谁更|传统和现代|共同|比较)/.test(text) && Array.isArray(state.last_two_entity_ids) && state.last_two_entity_ids.length >= 2) {
    return state.last_two_entity_ids.map((id) => index.byId.get(id)).filter(Boolean);
  }
  if (/第一首|第一本/.test(text) && Array.isArray(state.last_works) && state.last_works.length > 0) {
    const first = index.byId.get(state.last_works[0]);
    if (first) return [first];
  }
  if (state.last_focus_entity_id && index.byId.has(state.last_focus_entity_id)) {
    return [index.byId.get(state.last_focus_entity_id)];
  }
  if (Array.isArray(state.last_mentions) && state.last_mentions.length > 0) {
    const cards = state.last_mentions.map((id) => index.byId.get(id)).filter(Boolean);
    if (cards.length > 0) return cards.slice(0, 2);
  }
  return candidates.length > 0 ? candidates : null;
}

export function resolveCultureEntity(query, state = {}, index = DEFAULT_INDEX) {
  const matches = matchAlias(query, index);
  const bound = bindCultureFollowup(query, state, matches, index);
  if (bound?.length) return bound;

  if (matches.length > 0) return matches;

  const domain = detectCultureDomain(query, state);
  const domainCards = index.byDomain.get(domain) || [];
  const preferred = domainCards.find((card) => card.id.startsWith("concept.")) || domainCards[0];
  return preferred ? [preferred] : [];
}

export function retrieveCultureCards(query, state = {}, index = DEFAULT_INDEX) {
  const questionType = detectCultureQuestionType(query, state);
  const domain = detectCultureDomain(query, state);
  let focusCards = resolveCultureEntity(query, state, index);

  if (questionType === "author_list") {
    focusCards = (index.byDomain.get(domain) || []).filter((card) => card.entity_type === "person");
  } else if (/真实性|本真/.test(query)) {
    focusCards = [index.byId.get("concept.authenticity")].filter(Boolean);
  } else if (questionType === "compare" && /罗大佑/.test(query) && /日本文学/.test(query)) {
    focusCards = ["person.luo_dayou", "concept.japanese_literature"].map((id) => index.byId.get(id)).filter(Boolean);
  } else if (questionType === "country_relation") {
    focusCards = ["concept.japanese_literature"].map((id) => index.byId.get(id)).filter(Boolean);
  } else if ((questionType === "works_list" || questionType === "representative_works" || questionType === "listen_recommendation") && /罗大佑/.test(query)) {
    focusCards = [index.byId.get("person.luo_dayou")].filter(Boolean);
  }

  const related = [];
  for (const card of focusCards) {
    for (const rel of card.related_entities || []) {
      const target = index.byId.get(rel.id);
      if (target) related.push(target);
    }
  }
  const cards = [...focusCards, ...related].filter((card, idx, arr) => arr.findIndex((item) => item.id === card.id) === idx);
  return { domain, questionType, cards };
}

function nextStateFromCards({ domain, questionType, cards, answer }) {
  const focus = cards[0];
  const works = cards.flatMap((card) => card.works || card.representative_works || []).filter(Boolean);
  return {
    last_domain: domain,
    last_question_type: questionType,
    last_focus_entity_id: focus?.id || "",
    last_two_entity_ids: cards.slice(0, 2).map((card) => card.id),
    last_mentions: cards.slice(0, 8).map((card) => card.id),
    last_works: works.slice(0, 8),
    last_answer_policy: COPYRIGHT_REQUEST_RE.test(answer) ? "copyright_boundary" : "direct_culture_answer"
  };
}

export function answerCultureQuery(query, state = {}, index = DEFAULT_INDEX) {
  const text = clean(query);
  if (!text) return null;
  const domain = detectCultureDomain(text, state);
  if (domain === "generic" && !state?.last_domain) return null;

  const { questionType, cards } = retrieveCultureCards(text, state, index);
  if (cards.length === 0) return null;
  const operation = makeOperation(questionType);
  const draft = planCultureAnswer({ query: text, questionType, cards, state, operation, index });
  let verification = verifyCultureDraft({ query: text, questionType, answer: draft.answer, cards, state });
  let finalAnswer = draft.answer;
  if (!verification.ok) {
    const safeDraft = planCultureAnswer({
      query: text,
      questionType: COPYRIGHT_REQUEST_RE.test(text) ? "no_lyrics_boundary" : "overview",
      cards,
      state,
      operation,
      index
    });
    const safeVerification = verifyCultureDraft({ query: text, questionType: COPYRIGHT_REQUEST_RE.test(text) ? "no_lyrics_boundary" : "overview", answer: safeDraft.answer, cards, state });
    if (!safeVerification.ok) {
      finalAnswer = "我能答这个文化问题，但需要守住作品、来源和版权边界；请给一个明确对象，我会按主题和入口讲。";
      verification = safeVerification;
    } else {
      finalAnswer = safeDraft.answer;
      verification = safeVerification;
    }
  }

  return {
    intent: "culture_awareness",
    answer: finalAnswer,
    operation,
    questionType,
    contextAction: "ANSWER_CULTURE",
    usedModel: false,
    route: "culture_runtime",
    cards: cards.map((card) => card.id),
    verifier: verification,
    compactStatePatch: nextStateFromCards({ domain, questionType, cards, answer: finalAnswer })
  };
}

export { verifyCultureDraft };
