const COPYRIGHT_REQUEST_RE = /(歌词|原文|唱词|逐字|整首|全文|整段|一大段|贴出来|逐句翻译)/;

const BAD_CULTURE_ANSWERS = [
  "日本文学不要只读情节。先看沉默、季节、羞耻和战后断裂。",
  "你要问哪一边？",
  "你需要提问。",
  "也许发生过，不在我眼前。",
  "知道一点。城市、青春和历史，会一起压进歌里。",
  "罗大佑适合听时代怎么进入私人生活。",
  "你应该去问百度。"
];

const LABELS = {
  modernization: "现代化",
  youth_memory: "青春记忆",
  urban_rural_displacement: "城乡变化",
  social_observation: "社会观察",
  public_private_overlap: "公共与私人交叠",
  language_parody: "语言反讽",
  public_discourse: "公共话语",
  hometown: "故乡",
  modernization_loss: "现代化失落",
  memory: "记忆",
  school_life: "校园日常",
  time: "时间感",
  daily_experience: "日常经验",
  love_memory: "爱情记忆",
  city: "城市",
  nostalgia: "怀旧",
  modern_self: "近代自我",
  seasonality: "季节感",
  impermanence: "无常",
  shame_and_social_pressure: "羞耻与社会压力",
  war_and_aftermath: "战争及其后果",
  urban_loneliness: "都市孤独",
  psychological_modernity: "心理现代性",
  ironic_clarity: "讽刺性的清晰",
  intellectual_pressure: "理性压力",
  social_role_pressure: "社会角色压力",
  lyrical_image: "抒情意象",
  compressed_silence: "压缩的沉默",
  cold_beauty: "冷感美学",
  fragile_boundary: "脆弱边界",
  self_disgust: "自我厌弃",
  alienation: "疏离",
  confession: "告白",
  postwar_disillusionment: "战后幻灭",
  urban_surreal: "都市奇异感",
  pop_culture: "大众文化",
  loneliness: "孤独",
  music_memory: "音乐与记忆",
  season_word: "季语",
  brevity: "短制",
  image_cut: "意象切分",
  nature_attention: "自然感知",
  postwar_memory: "战后记忆",
  democracy_and_defeat: "战败与民主",
  body_and_history: "身体与历史",
  freedom: "自由",
  responsibility: "责任",
  authenticity: "真实性",
  anxiety: "焦虑",
  absurdity: "荒诞",
  situated_choice: "处境中的选择",
  self_deception: "自欺",
  choice: "选择",
  deconstruction: "解构",
  writing: "书写",
  difference: "差异",
  meaning_instability: "意义不稳定",
  textual_boundary: "文本边界",
  binary_opposition: "二元对立",
  margin_center: "中心与边缘",
  textual_instability: "文本不稳定性",
  reading_method: "阅读方法",
  narrative: "叙述",
  identity: "身份",
  forgetting: "遗忘",
  interpretation: "解释",
  silence: "沉默",
  answerability: "可回答性",
  boundary: "边界",
  refusal: "拒绝",
  naming: "命名",
  classification: "分类",
  confessional_poetry: "自白诗",
  personal_history: "个人材料",
  public_history: "公共历史",
  mental_pressure: "精神压力",
  family_material: "家庭材料",
  personal_material: "个人材料",
  form: "形式",
  voice: "声音",
  public_private_boundary: "公私边界",
  looking: "观看",
  framing: "框取",
  attention: "注意力",
  indexicality: "记录性",
  power_relation: "权力关系",
  readymade: "现成品",
  art_institution: "艺术制度",
  conceptual_art: "观念艺术",
  authorship: "作者性",
  context: "语境",
  institution: "制度",
  value: "价值",
  display: "展示",
  canon: "经典化",
  copyright_boundary: "版权边界",
  rhythm: "节奏",
  performance_context: "演唱/表演语境",
  emotion_projection: "情绪投射",
  viewing_relation: "观看关系",
  judgment: "判断"
};

function clean(text) {
  return String(text || "").trim().replace(/\s+/g, " ");
}

function label(value) {
  return LABELS[value] || String(value || "").replace(/_/g, " ");
}

function uniq(values) {
  return [...new Set(values.filter(Boolean).map(label))];
}

function primaryName(card) {
  if (!card) return "";
  return card.names?.[0] || card.id || "";
}

function listText(values, max = 6) {
  return uniq(values).slice(0, max).join("、");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cardsByIds(index, ids) {
  return asArray(ids).map((id) => index?.byId?.get(id)).filter(Boolean);
}

function displayTitles(cards, max = 6) {
  return cards.slice(0, max).map((card) => primaryName(card));
}

function sentence(...parts) {
  return clean(parts.filter(Boolean).join(""));
}

function themes(card, max = 3) {
  return listText(asArray(card?.themes), max);
}

function axesFor(cards, max = 3) {
  return listText(cards.flatMap((card) => asArray(card?.comparison_axes)), max);
}

function styleFor(card, max = 2) {
  return listText(asArray(card?.style_axes), max);
}

function domainCard(cards, domain) {
  return cards.find((card) => card.domain === domain && ["concept", "genre", "period"].includes(card.entity_type)) || cards[0];
}

function answerCopyrightBoundary(query, focus) {
  const name = primaryName(focus);
  if (name) {
    return sentence("不能提供完整歌词或长段原文。可以改讲", name, "的主题、背景、结构和为什么重要。");
  }
  return "不能提供完整歌词、整首诗或长段原文；可以改讲主题、背景、结构或阅读/聆听入口。";
}

function answerWorksList(focus, index, representative = false) {
  const ids = representative ? asArray(focus?.representative_works) : asArray(focus?.works);
  const works = displayTitles(cardsByIds(index, ids), 8);
  if (works.length === 0) return "";
  const prefix = representative ? "代表作可先抓" : "可以先看/听";
  return `${prefix}${works.map((title) => `《${title.replace(/[《》]/g, "")}》`).join("、")}；这里只列入口，不贴歌词或长原文。`;
}

function answerAuthorList(cards) {
  const people = cards.filter((card) => card.entity_type === "person");
  const names = displayTitles(people, 8);
  if (names.length === 0) return "";
  return `代表作家可先抓${names.join("、")}；读法上可按近代自我、抒情意象、战后断裂和当代都市经验分入口。`;
}

function answerOverview(focus, cards, domain) {
  const base = domainCard(cards, domain) || focus;
  if (!base) return "";
  const bits = [];
  bits.push(base.short_intro || base.factual_core);
  const periodText = listText(asArray(base.periods), 3);
  const themeText = themes(base, 4);
  if (periodText) bits.push(`可按${periodText}这些阶段看。`);
  if (themeText) bits.push(`关键词是${themeText}。`);
  return bits.join("");
}

function answerEntryPath(focus, index, questionType) {
  const entries = asArray(focus?.entry_points).slice(0, 4);
  if (entries.length > 0) {
    return `入门可以这样走：${entries.join("；")}。`;
  }
  const works = displayTitles(cardsByIds(index, focus?.representative_works || focus?.works || []), 4);
  if (works.length > 0) {
    const verb = questionType === "listen_recommendation" ? "先听" : "先读";
    return `${verb}${works.map((title) => `《${title.replace(/[《》]/g, "")}》`).join("、")}，再回到主题和历史语境。`;
  }
  return "";
}

function answerExplain(focus, questionType) {
  if (!focus) return "";
  const name = primaryName(focus);
  const themeText = themes(focus, 4);
  const contextText = listText(asArray(focus.historical_context), 2);
  if (questionType === "why_it_matters") {
    return `${name}重要，不是因为一句固定标签，而是因为它把${themeText || "形式、历史和经验"}组织成可讨论的作品/问题；${contextText || focus.factual_core}`;
  }
  return `${name}可以这样理解：${focus.factual_core}${themeText ? ` 重点看${themeText}。` : ""}`;
}

function answerCountryRelation(cards) {
  const japanLit = cards.find((card) => card.id === "concept.japanese_literature") || cards[0];
  if (!japanLit) return "";
  return "不是一回事。日本是国家和历史语境；日本文学是在日语、书写制度、社会结构、现代化和战后经验里形成的作品传统。";
}

function answerCompare(cards) {
  const targets = cards.filter(Boolean).slice(0, 2);
  if (targets.length < 2) return "";
  const [a, b] = targets;
  const axisText = axesFor(targets, 4) || "时代、形式、主题和语境";
  const aStyle = styleFor(a, 3) || themes(a, 2);
  const bStyle = styleFor(b, 3) || themes(b, 2);
  return `可以按${axisText}比较：${primaryName(a)}更偏${aStyle || "它自己的问题结构"}；${primaryName(b)}更偏${bStyle || "另一组形式和主题"}。共同点要有证据，不能硬说成同一种东西。`;
}

function answerThemeExplanation(focus) {
  if (!focus) return "";
  const name = primaryName(focus);
  const themeText = themes(focus, 4);
  return `${name}的重点不是一句玄学结论，而是${themeText || focus.factual_core}。可以先按字面意思，再看它如何改变观看、阅读或判断关系。`;
}

function boundedUnknown(questionType) {
  if (questionType === "compare") return "我能比较，但需要两个明确对象；没有对象时不能硬编共同点。";
  return "这题我没有足够卡片证据直接断言；可以先给对象、作品或可靠材料。";
}

export function planCultureAnswer({ query, questionType, cards = [], state = {}, operation = "", index = null }) {
  const focus = cards[0] || null;
  const domain = focus?.domain || state.last_domain || "generic";
  let answer = "";

  if (questionType === "no_lyrics_boundary" || COPYRIGHT_REQUEST_RE.test(query)) {
    answer = answerCopyrightBoundary(query, focus);
  } else if (questionType === "works_list" || questionType === "listen_recommendation") {
    answer = answerWorksList(focus, index, false) || answerEntryPath(focus, index, questionType);
  } else if (questionType === "representative_works") {
    answer = answerWorksList(focus, index, true) || answerWorksList(focus, index, false);
  } else if (questionType === "author_list") {
    answer = answerAuthorList(cards);
  } else if (questionType === "entry_path" || questionType === "reading_recommendation") {
    answer = answerEntryPath(focus, index, questionType);
  } else if (questionType === "compare" || questionType === "follow_up_compare_last_two") {
    answer = answerCompare(cards);
  } else if (questionType === "country_relation") {
    answer = answerCountryRelation(cards);
  } else if (questionType === "explain_work" || questionType === "follow_up_explain_last_entity" || questionType === "why_it_matters") {
    answer = answerExplain(focus, questionType);
  } else if (questionType === "theme_explanation" || questionType === "user_asks_interpretation") {
    answer = answerThemeExplanation(focus);
  } else {
    answer = answerOverview(focus, cards, domain);
  }

  return {
    answer: answer || boundedUnknown(questionType),
    template_id: `culture.${questionType || "overview"}`,
    operation
  };
}

export function verifyCultureDraft({ query = "", questionType = "", answer = "", cards = [], state = {} }) {
  const text = clean(answer);
  const reasons = [];

  if (!text) reasons.push("empty_answer");
  for (const bad of BAD_CULTURE_ANSWERS) {
    if (text.includes(bad)) reasons.push("known_collapsed_template");
  }
  if (/你要问哪一边|你需要提问|问百度/.test(text)) reasons.push("unnecessary_counterquestion");
  if (/\/Users\/|\/Volumes\/|\/home\/|[A-Za-z]:\\/.test(text)) reasons.push("local_path");
  if (/根据你的|根据.*文件|根据.*网站|according to your|source path/i.test(text)) reasons.push("source_framing");
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) reasons.push("privacy_violation");
  if ((text.match(/\n/g) || []).length > 4 || text.length > 420) reasons.push("answer_too_long");
  if (/完整歌词如下|全文如下|整首如下|逐字如下/.test(text)) reasons.push("copyright_violation");

  if (questionType === "works_list" || questionType === "representative_works" || questionType === "listen_recommendation") {
    if (!/《[^》]+》/.test(text)) reasons.push("works_list_missing_works");
  }
  if (questionType === "author_list" && !/(夏目|川端|太宰|村上|Lowell|洛厄尔|芭蕉|德里达)/.test(text)) {
    reasons.push("author_list_missing_authors");
  }
  if (questionType === "compare" || questionType === "follow_up_compare_last_two") {
    if (!/(按|轴|比较|共同点|不同|更偏|更重|区别)/.test(text)) reasons.push("compare_missing_axis");
  }
  if (questionType === "entry_path" || questionType === "reading_recommendation" || questionType === "listen_recommendation") {
    if (!/(先|入门|开始|路线|可选|《)/.test(text)) reasons.push("entry_path_missing_entry");
  }
  if (questionType === "explain_work" || questionType === "follow_up_explain_last_entity") {
    if (/^(你要问|要看你|这要看)/.test(text)) reasons.push("explain_work_only_clarifies");
  }
  if (questionType === "country_relation" && !/(不是一回事|国家|语境|文学传统|语言)/.test(text)) {
    reasons.push("country_relation_too_generic");
  }
  if (COPYRIGHT_REQUEST_RE.test(query) && !/(不能|不提供|不贴|不输出|可以改讲|主题|背景)/.test(text)) {
    reasons.push("copyright_boundary_missing");
  }
  if (/不知道|没有足够/.test(text) && cards.length > 0 && !/没有足够卡片证据/.test(text)) {
    reasons.push("generic_unknown_fallback");
  }

  return {
    ok: reasons.length === 0,
    reasons,
    answer: text
  };
}
