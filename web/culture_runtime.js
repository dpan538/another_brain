import { CULTURE_CARDS } from "./culture_cards.generated.js";
import { planCultureAnswer, verifyCultureDraft } from "./culture_planner.js";

const COPYRIGHT_REQUEST_RE = /(歌词|原文|原句|唱词|逐字|整首|全文|整段|一大段|贴出来|逐句翻译)/;

const DOMAIN_FAMILIES = {
  "music.chinese_pop_general": ["music.chinese_pop_general", "music.mandopop", "music.taiwan", "music.hongkong", "music.mainland_rock"],
  "music.taiwan": ["music.taiwan", "music.mandopop", "music.chinese_pop_general"],
  "music.hongkong": ["music.hongkong", "music.chinese_pop_general"],
  "music.mainland_rock": ["music.mainland_rock", "music.chinese_pop_general"],
  "literature.asian_general": ["literature.asian_general", "literature.chinese_modern", "literature.japanese", "literature.korean_modern"],
  "literature.chinese_modern": ["literature.chinese_modern", "literature.asian_general"],
  "literature.japanese": ["literature.japanese", "literature.asian_general"],
  "literature.korean_modern": ["literature.korean_modern", "literature.asian_general"],
  "literature.western_modern": ["literature.western_modern", "poetry.art", "poetry"],
  art_history: ["art_history", "photography_history", "design_history", "poetry.art"],
  photography_history: ["photography_history", "art_history"],
  design_history: ["design_history", "art_history"],
  poetry: ["poetry", "poetry.art", "literature.western_modern"],
  "poetry.art": ["poetry.art", "poetry", "art_history"]
};

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
    development_history: "culture_explain_development_history",
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

function domainFamilyCards(index, domain) {
  const domains = DOMAIN_FAMILIES[domain] || [domain];
  const cards = [];
  for (const item of domains) cards.push(...(index.byDomain.get(item) || []));
  return cards.filter((card, idx, arr) => arr.findIndex((item) => item.id === card.id) === idx);
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
  if (includesAny(text, [/亚洲文学|东亚文学|韩国现代文学|中国现代文学|鲁迅|张爱玲|沈从文|老舍|巴金|余华|莫言/])) return /日本文学/.test(text) ? "literature.asian_general" : /韩国/.test(text) ? "literature.korean_modern" : /中国现代|鲁迅|张爱玲|沈从文|老舍|巴金|余华|莫言/.test(text) ? "literature.chinese_modern" : "literature.asian_general";
  if (includesAny(text, [/日本文学|日本小说|日本作家|夏目漱石|川端康成|太宰治|人间失格|村上春树|芭蕉|俳句|雪国|少爷|《心》|战后日本|源氏物语|平安文学|芥川|谷崎|安部公房|大江健三郎|三岛由纪夫|紫式部|清少纳言/])) return "literature.japanese";
  if (includesAny(text, [/华语流行|中文流行|台湾流行|香港流行|香港粤语|大陆摇滚|台湾民歌|民歌.*摇滚.*流行|罗大佑|李宗盛|邓丽君|崔健|王菲|周杰伦|张惠妹|陈升|Beyond|Lo Ta-yu|Luo Dayou|之乎者也|鹿港小镇|童年|恋曲1980|恋曲1990|东方之珠|七里香|范特西|一无所有|海阔天空|红豆/])) {
    if (/香港|粤语|王菲|Beyond|海阔天空/.test(text)) return "music.hongkong";
    if (/大陆摇滚|崔健|一无所有/.test(text)) return "music.mainland_rock";
    if (/台湾|民歌|罗大佑|李宗盛|邓丽君|张惠妹|陈升/.test(text)) return "music.taiwan";
    return "music.chinese_pop_general";
  }
  if (includesAny(text, [/现代主义文学|意识流|卡夫卡|普鲁斯特|乔伊斯|博尔赫斯|现实主义|后现代文学|女性主义文学|20世纪文学|文学史|所有文学.*情绪|文学.*情绪/])) return "literature.western_modern";
  if (includesAny(text, [/存在主义|真实性|本真|德里达|解构|记忆和叙述|记忆与叙述|沉默.*回答|名字.*记忆|名字.*记住|名字.*忘记|语言.*背叛|问题没有答案|没有答案.*值得问|问题的价值|康德|黑格尔|尼采|海德格尔|萨特|波伏娃|加缪|福柯|柏拉图|亚里士多德/])) return "philosophy";
  if (includesAny(text, [/摄影史|摄影|照片|桑塔格|罗兰·巴特|明室|纪实摄影|观念摄影/])) return "photography_history";
  if (includesAny(text, [/设计史|平面设计|日本设计|包豪斯|Bauhaus/])) return "design_history";
  if (includesAny(text, [/Robert Lowell|Elizabeth Bishop|罗伯特·洛厄尔|洛厄尔|自白诗|诗和歌词|诗和小说/])) return "poetry";
  if (includesAny(text, [/杜尚|美术馆|艺术史|现代主义艺术|抽象表现主义|极简主义|后现代主义艺术|版画|文艺复兴|印象派|毕加索|康定斯基|沃霍尔|波洛克|蒙德里安|失败情绪|照片没有失败/])) return "art_history";
  if (state?.last_domain) return state.last_domain;
  return "generic";
}

export function detectCultureQuestionType(query, state = {}) {
  const text = clean(query);
  const avoidsCopyright = /(不要|不贴|不用|别给|不要再给).{0,8}(歌词|原文|原句)/.test(text);
  const hasNoLyricsExplain = /(不要|不贴|不用).{0,6}歌词/.test(text) && /(解释|讲讲|重要|为什么|意义)/.test(text);
  const hasSafeSummaryInstead = /(总结|概括|主题).{0,12}(不是|而不是|不要).{0,12}(原文|歌词)/.test(text);
  const hasFollowup = /(这首|这本|这个(?!国家)|那他呢|^他|他适合|第一首|第一本|那两个|继续说|再展开|它为什么重要|那谁更冷|这张专辑|那战后呢|那这首)/.test(text);
  if (hasSafeSummaryInstead) return "follow_up_explain_last_entity";
  if (hasNoLyricsExplain) return "why_it_matters";
  if (avoidsCopyright && /(代表作|代表作品|作品|歌曲|专辑|哪几首|哪几张|有哪些)/.test(text)) return /(代表作|代表作品)/.test(text) ? "representative_works" : "works_list";
  if (!avoidsCopyright && COPYRIGHT_REQUEST_RE.test(text)) return "no_lyrics_boundary";
  if (hasFollowup && /(那两个|谁更|传统和现代|共同|比较)/.test(text) && Array.isArray(state.last_two_entity_ids) && state.last_two_entity_ids.length >= 2) return "follow_up_compare_last_two";
  if (/(日本和日本文学|国家.*文学|文学.*国家|日本文学.*日本历史|一回事|同一个东西)/.test(text) && /日本文学/.test(text)) return "country_relation";
  if (/那两个|谁更|共同点|区别|不同|差在哪|比较(?!好)|和.+有什么共同|和.+关系|能比较|vs|VS|都算/.test(text)) return hasFollowup && /那两个|谁更/.test(text) ? "follow_up_compare_last_two" : "compare";
  if (/(怎么发展|历史演变|从古典到现代|80年代|90年代|2000年后|战后|近代|当代|运动是什么|黄金期|大概怎么变)/.test(text)) return "development_history";
  if (/(代表作家|作家有哪些|有哪些.*作家|哪些.*作家|重要作家|代表人物|人物有哪些|从哪几个人|哪几个人|入口人物|列作家)/.test(text)) return "author_list";
  if (/(代表作|代表性作品|代表作品|经典作品)/.test(text)) return "representative_works";
  if (/(先听|从哪.*听|听哪|入门歌)/.test(text)) return "listen_recommendation";
  if (/(从什么开始|从哪.*开始|开始读|入门|第一本|先读|读什么|怎么读|适合从哪本|有哪些入口|入口有哪些)/.test(text)) return "reading_recommendation";
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
  const domainCards = domainFamilyCards(index, domain);
  const preferred = domainCards.find((card) => card.id.startsWith("concept.")) || domainCards[0];
  return preferred ? [preferred] : [];
}

function relationCardsForMatches(matches, index, domain) {
  const ids = new Set(matches.map((card) => card.id));
  if (ids.size === 0) return [];
  const familyIds = new Set(domainFamilyCards(index, domain).map((card) => card.id));
  return index.cards.filter((card) => {
    if (card.entity_type !== "relation" || !familyIds.has(card.id)) return false;
    return (card.related_entities || []).some((rel) => ids.has(rel.id));
  });
}

function worksForFocus(focusCards, index, domain) {
  const ids = new Set(focusCards.map((card) => card.id));
  const explicit = [];
  for (const card of focusCards) explicit.push(...(card.works || []), ...(card.representative_works || []));
  const relatedWorks = domainFamilyCards(index, domain).filter((card) => {
    if (card.entity_type !== "work") return false;
    return (card.related_entities || []).some((rel) => ids.has(rel.id));
  });
  return [...explicit.map((id) => index.byId.get(id)).filter(Boolean), ...relatedWorks].filter((card, idx, arr) => arr.findIndex((item) => item.id === card.id) === idx);
}

export function retrieveCultureCards(query, state = {}, index = DEFAULT_INDEX) {
  const questionType = detectCultureQuestionType(query, state);
  const domain = detectCultureDomain(query, state);
  let focusCards = resolveCultureEntity(query, state, index);
  const familyCards = domainFamilyCards(index, domain);

  if (questionType === "author_list") {
    focusCards = familyCards.filter((card) => card.entity_type === "person");
  } else if (/真实性|本真/.test(query)) {
    focusCards = [index.byId.get("concept.authenticity")].filter(Boolean);
  } else if (questionType === "compare" && /罗大佑/.test(query) && /日本文学/.test(query)) {
    focusCards = ["person.luo_dayou", "concept.japanese_literature"].map((id) => index.byId.get(id)).filter(Boolean);
  } else if (questionType === "compare") {
    const relationMatches = relationCardsForMatches(focusCards, index, domain);
    const exactRelation = relationMatches.find((card) => (card.names || []).some((name) => clean(query).includes(name)));
    const bothSidesRelation = relationMatches.find((card) => (card.related_entities || []).filter((rel) => focusCards.some((focus) => focus.id === rel.id)).length >= 2);
    const bestRelation = exactRelation || bothSidesRelation;
    if (bestRelation) {
      const sides = (bestRelation.related_entities || []).map((rel) => index.byId.get(rel.id)).filter(Boolean);
      focusCards = [bestRelation, ...sides];
    }
  } else if (questionType === "country_relation") {
    focusCards = ["concept.japanese_literature"].map((id) => index.byId.get(id)).filter(Boolean);
  } else if (questionType === "works_list" || questionType === "representative_works" || questionType === "listen_recommendation") {
    const works = worksForFocus(focusCards, index, domain);
    if (works.length > 0) focusCards = [...focusCards, ...works];
  } else if (questionType === "development_history") {
    focusCards = familyCards.filter((card) => ["concept", "period", "movement", "genre", "relation", "person", "work"].includes(card.entity_type)).slice(0, 12);
    if (focusCards.length === 0) focusCards = resolveCultureEntity(query, state, index);
  } else if (questionType === "reading_recommendation" && /韩国现代文学/.test(query)) {
    focusCards = familyCards;
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
