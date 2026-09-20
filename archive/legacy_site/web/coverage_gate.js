const COLLAPSE_RE =
  /(日本文学不要只读情节|沉默、季节、羞耻|知道一点。城市、青春和历史|罗大佑适合听时代怎么进入私人生活|你要问哪一边|你需要提问|也许发生过，不在我眼前|你应该去问百度)/;
const SOURCE_RE = /\/Users\/|\/Volumes\/|\/home\/|[A-Za-z]:\\|根据你的|根据.*文件|根据.*网站|according to your/i;
const PRIVATE_RE = /身份证|护照|银行卡|手机号|电话号码|住址|地址|GPS|签证/;
const COPYRIGHT_RE = /完整歌词如下|全文如下|整首如下|逐字如下/;

function clean(text) {
  return String(text || "").trim().replace(/\s+/g, " ");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isBoundedPartial(answer) {
  return /(覆盖还不完整|只能先|可以先|范围太大|不该硬编|没有足够)/.test(answer);
}

function titleCount(answer) {
  return (answer.match(/《[^》]{1,30}》/g) || []).length;
}

function primaryName(card) {
  return card?.names?.[0] || card?.id || "";
}

function retrievedWorkTitleCount(retrievedCards) {
  const titles = asArray(retrievedCards)
    .filter((card) => card?.entity_type === "work")
    .map((card) => primaryName(card).replace(/[《》\s]/g, ""))
    .filter(Boolean);
  return new Set(titles).size;
}

function personAnchorCount(answer) {
  const names = [
    "罗大佑",
    "李宗盛",
    "邓丽君",
    "崔健",
    "王菲",
    "周杰伦",
    "张惠妹",
    "陈升",
    "Beyond",
    "夏目漱石",
    "芥川龙之介",
    "川端康成",
    "太宰治",
    "三岛由纪夫",
    "大江健三郎",
    "村上春树",
    "紫式部",
    "清少纳言",
    "鲁迅",
    "张爱玲",
    "沈从文",
    "老舍",
    "巴金",
    "余华",
    "莫言",
    "杜尚",
    "毕加索",
    "康定斯基",
    "沃霍尔",
    "波洛克",
    "蒙德里安",
    "Walter Gropius",
    "Sontag",
    "Barthes",
    "苏格拉底",
    "柏拉图",
    "亚里士多德",
    "康德",
    "黑格尔",
    "尼采",
    "海德格尔",
    "萨特",
    "波伏娃",
    "加缪",
    "福柯",
    "德里达"
  ];
  return names.filter((name) => answer.includes(name)).length;
}

function periodAnchorCount(answer) {
  const periods = answer.match(/古典|平安|江户|明治|近代|战后|当代|民歌运动|1980|80年代|1990|90年代|2000|平台时代|现代主义|后现代|达达|超现实|抽象表现主义|极简主义|观念艺术|文艺复兴|印象派|五四|新时期|20世纪|古希腊|现象学|存在主义|后结构主义|结构主义|包豪斯/g) || [];
  return new Set(periods).size;
}

function comparisonTargetCount(query, answer) {
  const targets = [];
  const quoted = query.match(/《[^》]+》/g) || [];
  targets.push(...quoted.map((item) => item.replace(/[《》]/g, "")));
  const knownNames = [
    "罗大佑",
    "李宗盛",
    "邓丽君",
    "王菲",
    "崔健",
    "夏目漱石",
    "川端康成",
    "三岛由纪夫",
    "鲁迅",
    "张爱玲",
    "杜尚",
    "包豪斯",
    "普鲁斯特",
    "乔伊斯",
    "Elizabeth Bishop",
    "Lowell"
  ];
  for (const name of knownNames) {
    if (query.includes(name)) targets.push(name);
  }
  const unique = [...new Set(targets)].slice(0, 2);
  if (unique.length < 2) return { required: unique, mentioned: unique.length };
  return {
    required: unique,
    mentioned: unique.filter((target) => answer.includes(target.replace("Elizabeth Bishop", "Bishop")) || answer.includes(target)).length
  };
}

function observedCoverage(answer, retrievedCards) {
  return {
    retrieved_cards: asArray(retrievedCards).length,
    retrieved_work_cards: asArray(retrievedCards).filter((card) => card?.entity_type === "work").length,
    retrieved_work_titles: retrievedWorkTitleCount(retrievedCards),
    title_count: titleCount(answer),
    person_anchor_count: personAnchorCount(answer),
    period_anchor_count: periodAnchorCount(answer),
    has_comparison_axis: /(轴|比较|不同|共同|更偏|更重|差别|一边|另一边|不是同一个)/.test(answer),
    is_bounded_partial: isBoundedPartial(answer)
  };
}

export function assessCoverageForAnswer({ query = "", domain = "", questionType = "", answer = "", retrievedCards = [], trace = {} } = {}) {
  const q = clean(query);
  const text = clean(answer);
  const qt = questionType || trace.question_type || trace.questionType || "";
  const compareLikeByText = /(差在哪|比较|共同点|不同|能比较|vs|和.+关系|都算)/i.test(q);
  const nonCompareQuestionType = /country_relation|entry_path|reading_recommendation|listen_recommendation|works_list|representative_works|no_lyrics_boundary|explain_work|follow_up_explain_last_entity|theme_explanation|why_it_matters/.test(qt);
  const structureQuestion = /author_list|representative_authors|works_list|representative_works|listen_recommendation|development_history|chronology|period_relation|compare|follow_up_compare_last_two|country_relation|entry_path|reading_recommendation/.test(qt) || /(有哪些|代表作家|代表人物|代表作|怎么发展|历史演变|从古典到现代|差在哪|比较|共同点|不同)/.test(q);
  const reasons = [];
  const requiredCoverage = [];
  const observed = observedCoverage(text, retrievedCards);

  if (!text) reasons.push("empty_answer");
  if (COLLAPSE_RE.test(text)) reasons.push("known_collapse_pattern");
  if (SOURCE_RE.test(text)) reasons.push("source_framing");
  if (PRIVATE_RE.test(text)) reasons.push("privacy_violation");
  if (COPYRIGHT_RE.test(text)) reasons.push("copyright_violation");
  if (observed.retrieved_cards === 0 && /culture|literature|music|art|philosophy/.test(`${domain} ${trace.task_type || ""}`) && !observed.is_bounded_partial) {
    reasons.push("no_retrieved_cards_for_culture_answer");
  }

  if (/author_list|representative_authors/.test(qt) || /(有哪些.*作家|代表作家|代表人物|哪几位)/.test(q)) {
    requiredCoverage.push("min_3_person_anchors");
    if (observed.person_anchor_count < 3 && !observed.is_bounded_partial) reasons.push("author_list_missing_authors");
  }
  if (/works_list|representative_works|listen_recommendation/.test(qt) || /(有哪些.*(歌|作品|专辑)|代表作(?!家)|代表作品|哪几首|哪几张)/.test(q)) {
    requiredCoverage.push("min_3_work_anchors");
    const retrievedWorkMinimum = observed.retrieved_work_titles > 0 ? Math.min(3, observed.retrieved_work_titles) : 3;
    if (observed.title_count < retrievedWorkMinimum && !observed.is_bounded_partial) reasons.push("works_list_missing_works");
  }
  if (/development_history|chronology|period_relation/.test(qt) || /(怎么发展|历史演变|从古典到现代|80年代|90年代|2000|战后|近代|当代|运动|时期)/.test(q)) {
    requiredCoverage.push("min_2_period_anchors");
    if (observed.period_anchor_count < 2 && !observed.is_bounded_partial) reasons.push("history_missing_chronology");
  }
  if (/compare|follow_up_compare_last_two/.test(qt) || (compareLikeByText && !nonCompareQuestionType)) {
    requiredCoverage.push("both_sides_and_axis");
    const targets = comparisonTargetCount(q, text);
    if (targets.required.length >= 2 && targets.mentioned < 2 && !observed.is_bounded_partial) reasons.push("compare_missing_both_sides");
    if (!observed.has_comparison_axis && !observed.is_bounded_partial) reasons.push("compare_missing_axis");
  }
  if (/entry_path|reading_recommendation/.test(qt) && !/(《[^》]+》|先|入口|从|可选)/.test(text)) {
    reasons.push("entry_path_missing_entry");
  }

  if ((domain === "literature.asian_general" || /亚洲文学/.test(q)) && /日本文学|夏目|川端|村上/.test(text) && !/(中国|韩国|东亚|南亚|东南亚|范围太大|先从|鲁迅|张爱玲|沈从文|老舍|Chinese|East Asian)/.test(text)) {
    reasons.push("asian_literature_seed_anchor_only");
  }
  if ((domain === "music.chinese_pop_general" || /华语流行|中文流行/.test(q)) && /罗大佑/.test(text) && !/(李宗盛|邓丽君|崔健|王菲|周杰伦|香港|台湾|大陆|民歌|摇滚)/.test(text)) {
    reasons.push("chinese_pop_seed_anchor_only");
  }
  if ((domain === "art_history" || /艺术史/.test(q)) && /摄影|照片/.test(text) && !/(杜尚|包豪斯|现代主义|后现代|达达|抽象|极简|美术馆|设计|文艺复兴|印象派)/.test(text)) {
    reasons.push("art_history_collapsed_to_photography");
  }
  if (structureQuestion && /(沉默|季节|羞耻|时代感|私人生活|气质|情绪)/.test(text) && observed.title_count === 0 && observed.person_anchor_count === 0 && observed.period_anchor_count === 0 && !observed.is_bounded_partial) {
    reasons.push("mood_only_answer");
  }

  return {
    ok: reasons.length === 0,
    reasons,
    requiredCoverage,
    observedCoverage: observed
  };
}
