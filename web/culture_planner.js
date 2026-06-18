import { assessCoverageForAnswer } from "./coverage_gate.js";
import { detectMethodLeak } from "./method_leak_verifier.js";

const COPYRIGHT_REQUEST_RE = /(歌词|原文|原句|唱词|逐字|整首|全文|整段|一大段|贴出来|逐句翻译)/;

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
  ordinary_life: "普通生活",
  relationship_observation: "关系观察",
  songwriting_craft: "创作手艺",
  city: "城市",
  nostalgia: "怀旧",
  plainspoken_pressure: "直白的压力",
  folk_rock_texture: "民谣/摇滚质地",
  narrative_songwriting: "叙事性写歌",
  accessible_melody: "易进入的旋律",
  light_surface_deeper_time: "轻表面下的时间感",
  plainspoken_emotion: "直白情感",
  mature_storytelling: "成熟叙事",
  producer_songwriter: "制作人/创作者位置",
  time_pressure: "时间压力",
  accessible_entry: "易进入",
  modern_self: "近代自我",
  seasonality: "季节感",
  impermanence: "无常",
  shame_and_social_pressure: "羞耻与社会压力",
  social_pressure: "社会压力",
  war_aftermath: "战争及其后果",
  war_and_aftermath: "战争及其后果",
  urban_loneliness: "都市孤独",
  social_role: "社会角色",
  education: "教育经验",
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
  music_culture: "音乐文化",
  vocal_style: "声音辨识度",
  hongkong_pop: "香港流行语境",
  alternative_pop: "另类流行质地",
  cantopop_ballad: "粤语/华语抒情歌",
  surreal_structure: "超现实结构",
  accessible_prose: "可读性强的叙述",
  everyday_surreal: "日常中的超现实",
  urban_melancholy: "都市忧郁",
  season_word: "季语",
  brevity: "短制",
  image_cut: "意象切分",
  nature_attention: "自然感知",
  postwar_memory: "战后记忆",
  democracy_and_defeat: "战败与民主",
  body_and_history: "身体与历史",
  social_reconstruction: "社会重建",
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
  language: "语言",
  context: "语境",
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
  questioning: "提问",
  uncertainty: "不确定性",
  method: "方法",
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
  institution: "制度",
  value: "价值",
  medium: "媒介",
  history: "历史",
  entry_path: "入门路径",
  visual_method: "观看方法",
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

function escapeRegExp(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripLeadingName(text, name) {
  const core = clean(text);
  if (!name) return core;
  return core
    .replace(new RegExp(`^${escapeRegExp(name)}[：:,，\\s]*`), "")
    .replace(new RegExp(`^${escapeRegExp(name)}是`), "是");
}

function label(value) {
  return LABELS[value] || String(value || "").replace(/_/g, " ");
}

function uniq(values) {
  return [...new Set(values.filter(Boolean).map(label))];
}

function primaryName(card) {
  if (!card) return "";
  const names = asArray(card.names).filter(Boolean);
  const displayName = names.find((name) => !/(应该|怎么|哪里|什么|为何|为什么|吗|？|\?)/.test(String(name)));
  return displayName || names[0] || card.id || "";
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
  const polite = /(能不能|可以|可不可以|贴一下)/.test(query);
  if (name) {
    return polite
      ? sentence("不行，不能贴", name, "的歌词或长段原文；我可以改讲主题、背景和作品位置。")
      : /完整|整首/.test(query)
      ? sentence("歌词不能给；如果谈", name, "，可以讲主题、背景和影响。")
      : sentence("不能提供", name, "的歌词或长段原文；可以讲主题、背景、结构和为什么重要。");
  }
  return "不能提供完整歌词、整首诗或长段原文；可以改讲主题、背景、结构或阅读/聆听入口。";
}

function answerWorksList(focus, index, representative = false, query = "", questionType = "", cards = []) {
  const ids = representative ? asArray(focus?.representative_works) : asArray(focus?.works);
  const explicitWorks = cards.filter((card) => card.entity_type === "work");
  const workCards = [...cardsByIds(index, ids), ...explicitWorks].filter((card, idx, arr) => arr.findIndex((item) => item.id === card.id) === idx);
  const works = displayTitles(workCards, 8);
  if (works.length === 0) return "";
  if (representative && /(作家|作者|人物)/.test(query)) {
    const pairs = workCards
      .map((work) => {
        const creatorId = asArray(work?.related_entities).find((item) => item?.relation === "created_by")?.id;
        const creator = creatorId ? index?.byId?.get?.(creatorId) : null;
        const creatorName = primaryName(creator);
        const workTitle = primaryName(work).replace(/[《》]/g, "");
        return creatorName && workTitle ? `${creatorName}《${workTitle}》` : "";
      })
      .filter(Boolean)
      .slice(0, 3);
    if (pairs.length) return `三个入口：${pairs.join("、")}。`;
  }
  const titles = works.map((title) => `《${title.replace(/[《》]/g, "")}》`).join("、");
  const partial = works.length < 3 ? "目前卡片覆盖还不完整，所以先给已确认入口：" : "";
  if (questionType === "listen_recommendation" || /先听|歌单/.test(query)) {
    return `${partial}先听路线可从${titles}进；先抓作品位置和风格变化，不贴歌词。`;
  }
  if (representative) {
    return `${partial}代表作可先抓${titles}；它们分别通向不同主题入口，不能贴歌词。`;
  }
  return `${partial}歌曲可以先列${titles}；这是入口清单，不是歌词复写。`;
}

function answerMusicRepresentativeness(focus, cards = [], index = null, query = "", questionType = "") {
  const person =
    (focus?.entity_type === "person" && /^music\./.test(focus.domain || "") ? focus : null) ||
    cards.find((card) => card.entity_type === "person" && /^music\./.test(card.domain || "")) ||
    cards.find((card) => card.entity_type === "person" && card.domain === "music.mandopop");
  if (!person) return "";
  const works = displayTitles(cards.filter((card) => card.entity_type === "work"), 4);
  const titles = works.length ? works.map((title) => `《${title.replace(/[《》]/g, "")}》`).join("、") : "";
  const themeText = themes(person, 3) || styleFor(person, 3) || "作品位置、声音和时代语境";
  if (questionType === "music_characteristics" || /特点|风格/.test(query)) {
    return `${primaryName(person)}的歌特点可先抓${themeText}${titles ? `；入口是${titles}` : ""}。`;
  }
  if (person.id === "person.luo_dayou") {
    return `代表性在三点：青春记忆、城乡变化、社会观察。入口可以听${titles || "《童年》《鹿港小镇》《恋曲1990》"}。`;
  }
  return `${primaryName(person)}的代表性可先看${themeText}${titles ? `；入口是${titles}` : ""}。`;
}

function answerAuthorList(cards, query = "") {
  const people = cards.filter((card) => card.entity_type === "person");
  const names = displayTitles(people, 8);
  if (names.length === 0) return "";
  if (/按时期|时期/.test(query)) {
    return `按时期可先分：平安/古典看紫式部、清少纳言；明治近代看夏目漱石、森鸥外；战后看太宰治、川端康成、大江健三郎；当代可看村上春树。`;
  }
  if (/重要作家/.test(query)) {
    return `重要作家可从${names.join("、")}进入；先按近代自我、抒情意象、战后断裂和当代都市经验分线读。`;
  }
  return `代表作家可先抓${names.join("、")}；读法上可按近代自我、抒情意象、战后断裂和当代都市经验分入口。`;
}

function answerOverview(focus, cards, domain, query = "") {
  const base = domainCard(cards, domain) || focus;
  if (!base) return "";
  if (focus?.id === "concept.duchamp" || focus?.id === "person.duchamp" || /duchamp/.test(String(focus?.id || ""))) {
    return "杜尚是现代艺术关键人物：他把艺术从手艺转向观看、命名和制度，现成品让普通物件变成艺术问题。";
  }
  if (domain === "photography_history" || /(摄影|照片|图像)/.test(query)) {
    return "摄影史讲照片和图像如何组织观看：从记录技术到纪实、现代主义，再到观念图像和媒介制度。";
  }
  if (domain === "literature.asian_general") {
    return "亚洲文学不是单一传统；可先从中国现代文学、日本近现代文学、韩国现代文学和更广的南亚/东南亚脉络拆开，覆盖不足处要明说，不能只讲日本文学。";
  }
  if (domain === "literature.japanese") {
    return "日本文学是一条包含古典书写、俳句、近代小说、战后文学和当代都市叙事的长传统；可以按作家、作品和时期直接问。";
  }
  if (focus?.entity_type === "person" && /^music\./.test(focus.domain || "")) {
    const themeText = themes(focus, 3) || styleFor(focus, 3);
    if (focus.id === "person.luo_dayou") return `${primaryName(focus)}是台湾音乐人，关键在时代感、青春记忆和社会观察。`;
    return `${primaryName(focus)}可放在${focus.domain.replace("music.", "")}语境里看；关键是${themeText || focus.factual_core || "作品、声音和时代位置"}。`;
  }
  const bits = [];
  bits.push(base.short_intro || base.factual_core);
  const periodText = listText(asArray(base.periods), 3);
  const themeText = themes(base, 4);
  if (periodText) bits.push(`可按${periodText}这些阶段看。`);
  if (themeText) bits.push(`关键词是${themeText}。`);
  return bits.join("");
}

function answerEntryPath(focus, index, questionType, query = "") {
  if (focus?.domain === "literature.asian_general" || /亚洲文学|东亚文学/.test(query)) {
    return "入口可先从鲁迅、张爱玲、夏目漱石、川端康成和韩国现代文学的待补卡方向拆；先按中国、日本、韩国三条线读，未覆盖的南亚/东南亚不硬编。";
  }
  if (/韩国现代文学/.test(query)) {
    return "韩国现代文学覆盖还薄；可以先把它作为东亚现代文学入口之一，和鲁迅、夏目漱石等中日入口并读，但具体韩国书单需要后续补卡，不应硬编。";
  }
  if (focus?.domain === "literature.western_modern" && /博尔赫斯/.test(query)) {
    return "博尔赫斯可先从短篇入口读，抓迷宫、书本、时间和虚构结构；不要先追求完整文学史定位。";
  }
  if (/林夕|歌词.*入口/.test(query)) {
    return "林夕可以作为香港流行歌词写作入口；不贴歌词，只看词作者位置、语气、城市感和流行歌的写作方法。";
  }
  if (/桑塔格/.test(query)) {
    return "桑塔格可以作为摄影理论入口；先看摄影如何改变观看、记录、消费和权力关系，再回到具体照片。";
  }
  if (focus?.entity_type === "work") {
    return `《${primaryName(focus).replace(/[《》]/g, "")}》可以作为入口：先看${themes(focus, 3) || "主题和形式"}，再放回${listText(asArray(focus.periods), 2) || "作品史语境"}。`;
  }
  if (focus?.domain === "literature.chinese_modern") {
    return "中国现代文学入口可从鲁迅《呐喊》、沈从文《边城》、张爱玲《倾城之恋》、老舍《骆驼祥子》进入；再按五四新文学和1980s新时期补时间线。";
  }
  if (focus?.id === "concept.japanese_literature") {
    if (/应该怎么读|怎么读/.test(query)) {
      return "入门可选《心》或《少爷》；读的时候看季节、沉默和战后断裂怎样落进作品。";
    }
    if (/第一本|读什么/.test(query)) {
      return "第一本可选夏目漱石《心》或《少爷》；想轻一点，也可以从村上春树短篇入门。";
    }
    if (/从什么开始|开始读|入门/.test(query)) {
      return "入门路线可从《少爷》或《心》开始，再到《雪国》和《人间失格》，最后看村上春树的当代入口。";
    }
  }
  if (focus?.id === "person.haruki_murakami" || /村上春树|村上/.test(query)) {
    if (/先读哪一本|哪一本比较好|第一本/.test(query)) {
      return "第一本可以选《挪威的森林》；如果想少一点长篇负担，也可以从短篇开始。";
    }
    if (/适合/.test(query) && !/哪本/.test(query)) {
      return "村上春树适合入门；先读《挪威的森林》或短篇，再看《海边的卡夫卡》。";
    }
    return "村上春树可从《挪威的森林》或短篇入门；想看更奇异的结构，再读《海边的卡夫卡》。";
  }
  const works = displayTitles(cardsByIds(index, focus?.representative_works || focus?.works || []), 4);
  if (works.length > 0) {
    const verb = questionType === "listen_recommendation" ? "先听" : "先读";
    const partial = works.length < 2 ? "目前作品卡覆盖还不完整，所以先给已确认入口：" : "";
    return `${partial}${verb}${works.map((title) => `《${title.replace(/[《》]/g, "")}》`).join("、")}，再回到主题和历史语境。`;
  }
  const entries = asArray(focus?.entry_points).slice(0, 4);
  if (entries.length > 0) {
    if (/第一本|哪一本|读什么/.test(query)) {
      return `第一本可选：${entries[0]}；如果想换口味，再用${entries.slice(1, 3).join("；")}补路。`;
    }
    if (/村上春树/.test(query) && /适合/.test(query)) {
      return `适合入门。${entries[0]}；想看他更奇异的结构，再读${entries[1] || "较后期长篇"}。`;
    }
    const tail = focus?.domain === "literature.japanese" ? "同时留意季节感、沉默和战后断裂。" : "";
    return `入门可以这样走：${entries.join("；")}。${tail}`;
  }
  return "";
}

function answerExplain(focus, questionType, query = "") {
  if (!focus) return "";
  const name = primaryName(focus);
  const themeText = themes(focus, 4);
  if (/照片.*好不好看|不能只看好不好看|好不好看/.test(query) && /照片|摄影/.test(query)) {
    return "不能只看好不好看；还要看照片怎样组织观看、框取、对象和观看者关系。";
  }
  if (/(版画|印刷图像|复制性媒介)/.test(query)) {
    return "版画不只是复制；还要看刻、印、传播和重复观看怎样改变图像。";
  }
  if (/不是.*标签/.test(query)) {
    return `${name}不是标签；要落到对象、作品、时期和关系这些具体锚点，再说明作品、时期和比较轴。`;
  }
  if (/包豪斯/.test(query) || /包豪斯/.test(name)) {
    return "包豪斯把工业、教学和形式训练放在一起，是现代设计的重要学校/运动。";
  }
  const contextText = listText(asArray(focus.historical_context), 2);
  if (focus.entity_type === "work" && /(不要|不贴|不用).{0,6}歌词/.test(query) && !/(为什么|重要|重要性|意义)/.test(query)) {
    return `不贴歌词讲，${name}可以从${themeText || "主题、声音和时代位置"}进入；重点是作品位置和情绪结构，不是复写文本。`;
  }
  if (questionType === "why_it_matters") {
    const noLyrics = /(不要|不贴|不用).{0,6}歌词/.test(query);
    const lead = noLyrics ? (/讲讲|重要性/.test(query) ? "不贴原文，讲重要性：" : "不贴原文解释：") : "";
    return `${lead}${name}重要在于把${themeText || "形式、历史和经验"}组织成可讨论的作品/问题；${contextText || focus.factual_core}`;
  }
  if (/这句话/.test(query)) {
    return `这句话的意思是：${focus.factual_core} 关键不在口号，而在${themeText || "它改变了判断关系"}。`;
  }
  if (["concept", "movement"].includes(focus.entity_type) && /(是什么|怎么理解|如何理解|了解|知道)/.test(query)) {
    return `${name}不是单一标签；${stripLeadingName(focus.factual_core, name)}${themeText ? ` 先看${themeText}。` : ""}`;
  }
  if (/继续说/.test(query)) {
    return `继续展开：${name}要抓${themeText || "主题和边界"}，再看${contextText || focus.factual_core}。`;
  }
  if (/这件事.*美术馆|美术馆.*关系/.test(query)) {
    return "这件事和美术馆的关系在于：美术馆通过展示、说明和收藏改变作品语境与价值判断；但价值不只由制度决定。";
  }
  if (/它为什么重要/.test(query)) {
    return `${name}的重要性在于：${contextText || focus.factual_core}；它把${themeText || "形式和历史经验"}变成可讨论的问题。`;
  }
  if (/那这张专辑/.test(query)) {
    return `这张专辑可从${themeText || "标题、时代和姿态"}看：${focus.factual_core}`;
  }
  if (/你懂什么/.test(query)) {
    return `${name}不是一个可复读的标签；先看它的位置：${focus.factual_core} 重点是${themeText || "作品语境"}。`;
  }
  if (/第一首|第一本/.test(query)) {
    return `按刚才的列表，第一项可先这样读：${name}连接的是${themeText || "主题和位置"}，不是让你复述原文。`;
  }
  if (/那战后/.test(query)) {
    return `战后这一段要看${themeText || "战争记忆和社会重建"}：${focus.factual_core}`;
  }
  if (/这首|这本|这个/.test(query)) {
    return `这件作品可从${themeText || "主题和形式"}进入：${focus.factual_core}`;
  }
  if (/可以怎么理解|怎么理解/.test(query)) {
    return `理解${name}，先抓${themeText || "核心主题"}，再放回${contextText || "作品脉络"}。`;
  }
  return `${name}：${focus.factual_core}${themeText ? ` 先看${themeText}。` : ""}`;
}

function answerCountryRelation(cards, query = "") {
  const japanLit = cards.find((card) => card.id === "concept.japanese_literature") || cards[0];
  if (!japanLit) return "";
  if (/同一个东西|是不是同一个/.test(query)) {
    return "不是同一个东西。国家是政治和社会实体；文学是语言、历史经验和作品形式累积出来的传统。";
  }
  if (/历史/.test(query)) {
    return "不是同一个东西。比较轴是历史时间线和作品传统：日本历史是政治和社会进程；日本文学是在平安古典、明治近代、战后和当代等语境里形成的作品传统。";
  }
  if (/一回事/.test(query)) {
    return "不是同一个东西。日本是国家、历史和语言语境；日本文学是作品传统，借这个语境生长，但不能和国家本身画等号。";
  }
  return "不是一回事。日本是国家和历史语境；日本文学是在日语、书写制度、社会结构、现代化和战后经验里形成的作品传统。";
}

function answerDevelopmentHistory(focus, cards, query = "") {
  const domain = focus?.domain || cards[0]?.domain || "";
  if (domain === "music.chinese_pop_general" || domain === "music.taiwan" || domain === "music.hongkong" || domain === "music.mainland_rock" || domain === "music.mandopop") {
    return "可以按台湾民歌运动、1980年代台湾流行、香港粤语流行歌黄金期、大陆摇滚、2000年后平台/制作转向来讲；每段都要落到人物和作品，不能只说时代感。";
  }
  if (domain === "literature.japanese") {
    if (/那战后/.test(query)) {
      return "战后这一段在明治近代之后、当代之前，要看战争记忆、历史重建和主体危机；太宰治、大江健三郎、安部公房等入口各不相同。";
    }
    if (/战后日本文学/.test(query)) {
      return "战后日本文学指二战后形成的文学脉络，承接明治近代问题并走向当代写作；可从太宰治、大江健三郎、安部公房等入口看战争记忆、社会重建和主体危机。";
    }
    return "日本文学可粗分平安古典、俳句/江户、明治近代、战后文学和当代小说；每段都要配作家作品，不能只给抽象标签。";
  }
  if (domain === "literature.chinese_modern") {
    return "中国现代文学可先按五四新文学、1930s城市/乡土叙事、1949后文学、1980s新时期和当代写作来拆；入口可落到鲁迅、张爱玲、沈从文、老舍、余华、莫言。";
  }
  if (domain === "photography_history") {
    return "摄影史可先按19世纪技术/肖像与档案、20世纪纪实与现代主义、战后观念/美术馆语境、当代数字图像来讲；这里先给框架，不贴长原文。";
  }
  if (domain === "art_history" || domain === "poetry.art") {
    return "艺术史可先按文艺复兴、印象派、现代主义、达达/观念艺术、抽象表现主义、极简和后现代来走；再落到代表人物和作品制度。";
  }
  if (domain === "philosophy") {
    return "哲学史不能只从德里达讲；可先用古希腊、康德/黑格尔、尼采、现象学、存在主义和后结构主义这些时期入口。";
  }
  return "这个发展史覆盖还不完整；我可以先按已覆盖的时期入口讲，不该硬编缺失谱系。";
}

function answerCompare(cards, query = "") {
  if (/美术馆.*作品价值|作品价值.*美术馆/.test(query)) {
    return "可按展示语境/作品自身、制度价值/审美判断这两个轴比较：美术馆会改变作品怎样被看见和说明，价值还要看作品自身和历史位置。";
  }
  if (/(太宰治|战后日本)/.test(query) && /关系/.test(query)) {
    return "太宰治要放在战后日本文学里看：二战后、旧价值崩塌、个人失败感和现代自我怀疑连在一起。";
  }
  if (/周杰伦/.test(query) && /2000年代|2000年后/.test(query) && /关系/.test(query)) {
    return "比较轴在1990年代唱片工业到2000年代声音转向：周杰伦把R&B、嘻哈咬字、中国风和专辑概念带进主流。";
  }
  if (/大陆摇滚/.test(query) && /(怎么进入|1980s|1990s)/.test(query)) {
    return "大陆摇滚从1980s末的崔健进入公共表达，1990s转向乐队、现场和地下场景；它和华语流行相交，但不等于主流情歌线。";
  }
  const relation = cards.find((card) => card.entity_type === "relation");
  const targets = relation ? cards.filter((card) => card.entity_type !== "relation").slice(0, 2) : cards.filter(Boolean).slice(0, 2);
  if (targets.length < 2) return "";
  const [a, b] = targets;
  const axisText = axesFor(relation ? [relation, ...targets] : targets, 4) || "时代、形式、主题和语境";
  const aStyle = styleFor(a, 3) || themes(a, 2);
  const bStyle = styleFor(b, 3) || themes(b, 2);
  if (/诗.*歌词|歌词.*诗/.test(query)) {
    return "诗的解释更偏文本、意象、声音和结构；歌词还要看演唱、旋律、传播语境。两者都能讲主题，但都要守版权边界，不能复写长段原文。";
  }
  if (/谁更冷/.test(query)) {
    return `如果“冷”指距离感和抒情温度，${primaryName(b)}更冷一些：他更偏${bStyle || "压缩意象"}；${primaryName(a)}的冷更多来自${aStyle || "理性裂缝"}。`;
  }
  if (/怎么推理/.test(query)) {
    if (/罗大佑/.test(query) && /日本文学/.test(query)) {
      return "推理时先定比较轴：现代化、个人记忆、公共/私人、传统与现代。罗大佑要落到《之乎者也》《童年》等作品；日本文学要落到夏目漱石、川端康成、战后文学等锚点。共同点只能说结构相似，不能说二者等同。";
    }
    return `推理时先定比较轴：${axisText}。在这些轴上，${primaryName(a)}偏${aStyle || "自身的问题结构"}，${primaryName(b)}偏${bStyle || "另一组形式和主题"}；结论只能说相似张力，不能说二者等同。`;
  }
  if (/亚洲文学|东亚文学/.test(query)) {
    return `可以按${axisText}比较：亚洲文学范围更大，东亚文学可先从中国、日本、韩国三条入口拆；${primaryName(a)}和${primaryName(b)}只能作为局部锚点，不能把亚洲文学缩成日本文学。`;
  }
  if (/战后/.test(query)) {
    return `可以按${axisText}比较：${primaryName(a)}更偏${aStyle || "它自己的问题结构"}；${primaryName(b)}更偏${bStyle || "另一组形式和主题"}。这里要放在明治近代、战后和当代的时间线上，不能只讲单边印象。`;
  }
  if (/(近代|明治|2000|平台时代|民歌运动|大陆摇滚|运动)/.test(query)) {
    return `可以按${axisText}比较：${primaryName(a)}更偏${aStyle || "它自己的问题结构"}；${primaryName(b)}更偏${bStyle || "另一组形式和主题"}。时间线上要标出五四/明治、1980s、2000年代或平台时代等具体阶段，不能只讲单边。`;
  }
  return `可以按${axisText}比较：${primaryName(a)}更偏${aStyle || "它自己的问题结构"}；${primaryName(b)}更偏${bStyle || "另一组形式和主题"}。共同点要有证据，不能硬说成同一种东西。`;
}

function answerThemeExplanation(focus, query = "") {
  if (!focus) return "";
  const name = primaryName(focus);
  const themeText = themes(focus, 4);
  if (/不是.*标签/.test(query)) {
    return `${name}不是标签；要落到对象、作品、时期和关系这些具体锚点，再说明作品、时期和比较轴。`;
  }
  if (focus.domain === "literature.asian_general" && /(怎么拆|覆盖不全|只讲日本|不能只讲日本)/.test(query)) {
    return "范围要拆开：先从中国现代文学、日本近现代文学、韩国现代文学进入；未覆盖的南亚、东南亚部分要说覆盖不足，不能硬编，也不能只答日本文学。";
  }
  if (focus.domain === "literature.asian_general" && /(单一传统|是什么关系|怎么区分|区分)/.test(query)) {
    return "不是单一传统。亚洲文学范围更大，东亚文学只是其中一部分；回答时至少要区分中国、日本、韩国等入口，覆盖不足处要明说。";
  }
  if (/(不是.*一个人|是不是整个|只有罗大佑)/.test(query) && /(华语流行|罗大佑)/.test(query)) {
    return "不是。罗大佑是重要入口，但华语流行还包括李宗盛、邓丽君、崔健、王菲、周杰伦、粤语歌和大陆摇滚等线索。";
  }
  if (/后结构主义.*只有德里达|只有德里达/.test(query)) {
    return "不是。后结构主义不能只讲德里达，还要把福柯、拉康等对象和结构主义之后的语言、权力、主体问题分开看。";
  }
  if (/不能只讲|不是.*标签|只有|只讲/.test(query)) {
    const anchors = focus.domain === "music.chinese_pop_general"
      ? "罗大佑、李宗盛、邓丽君、崔健、王菲、周杰伦"
      : focus.domain === "literature.asian_general"
        ? "中国现代文学、日本近现代文学、韩国现代文学"
        : focus.domain === "literature.chinese_modern"
          ? "鲁迅、张爱玲、沈从文、老舍"
          : "对象、作品、时期和关系";
    return `不能只讲抽象印象；要落到${anchors}这些具体锚点，再说明作品、时期和比较轴。`;
  }
  if (/这件事/.test(query)) {
    return `放到这件事上，美术馆/制度会改变作品的展示语境、可见度和价值判断，不等于直接决定一切。`;
  }
  if (/关系/.test(query) && /美术馆|作品价值/.test(query)) {
    return `可按展示语境/作品自身、制度价值/审美判断这两个轴比较：美术馆会改变作品怎样被看见和说明；价值还要看作品自身、历史位置和观看方式。`;
  }
  if (/照片.*好不好看|不能只看好不好看|好不好看/.test(query) && /照片|摄影/.test(query)) {
    return "不能只看好不好看；还要看照片怎样组织观看、框取、对象和观看者关系。";
  }
  if (/(版画|印刷图像|复制性媒介)/.test(query)) {
    return "版画不只是复制；还要看刻、印、传播和重复观看怎样改变图像。";
  }
  if (focus?.entity_type === "relation") {
    const axisText = axesFor([focus], 4) || themes(focus, 4) || "对象、时期和媒介";
    return `${name}要按${axisText}来讲；不能只讲其中一边，也不能把关系说成单向影响。`;
  }
  if (/漂亮/.test(query)) {
    return `判断摄影作品不能只看漂亮：还要看它怎样组织${themeText || "观看、框取和关系"}，以及画面排除了什么。`;
  }
  if (/只是记录/.test(query)) {
    return `不是只是记录。${focus.factual_core} 所以要同时看对象、框取和观看者位置。`;
  }
  if (/怎么理解/.test(query)) {
    return `可以理解为：${focus.factual_core} 这里的关键是${themeText || "字面和隐含关系"}，不是把情绪当成图像本身。`;
  }
  return `${name}先看${themeText || focus.factual_core}；再回到字面、语境和判断关系。`;
}

function boundedUnknown(questionType) {
  if (questionType === "compare") return "我能比较，但需要两个明确对象；没有对象时不能硬编共同点。";
  return "这题我没有足够卡片证据直接断言；可以先给对象、作品或可靠材料。";
}

export function planCultureAnswer({ query, questionType, cards = [], state = {}, operation = "", index = null }) {
  const focus = cards[0] || null;
  const domain = focus?.domain || state.last_domain || "generic";
  let answer = "";

  if (questionType === "no_lyrics_boundary") {
    answer = answerCopyrightBoundary(query, focus);
  } else if (questionType === "music_representativeness" || questionType === "music_characteristics") {
    answer = answerMusicRepresentativeness(focus, cards, index, query, questionType);
  } else if (questionType === "works_list" || questionType === "listen_recommendation") {
    answer = answerWorksList(focus, index, false, query, questionType, cards) || answerEntryPath(focus, index, questionType, query);
  } else if (questionType === "representative_works") {
    answer = answerWorksList(focus, index, true, query, questionType, cards) || answerWorksList(focus, index, false, query, questionType, cards);
  } else if (questionType === "author_list") {
    answer = answerAuthorList(cards, query) || answerWorksList(focus, index, true, query, "representative_works", cards);
  } else if (questionType === "entry_path" || questionType === "reading_recommendation") {
    answer = answerEntryPath(focus, index, questionType, query);
  } else if (questionType === "compare" || questionType === "follow_up_compare_last_two") {
    answer = answerCompare(cards, query);
  } else if (questionType === "country_relation") {
    answer = answerCountryRelation(cards, query);
  } else if (questionType === "development_history") {
    answer = answerDevelopmentHistory(focus, cards, query);
  } else if (questionType === "explain_work" || questionType === "follow_up_explain_last_entity" || questionType === "why_it_matters") {
    answer = answerExplain(focus, questionType, query);
  } else if (questionType === "theme_explanation" || questionType === "user_asks_interpretation") {
    answer = answerThemeExplanation(focus, query);
  } else {
    answer = answerOverview(focus, cards, domain, query);
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
  const methodLeak = detectMethodLeak({
    query,
    answer: text,
    domain: cards[0]?.domain || state.last_domain || "",
    questionType
  });
  if (!methodLeak.ok) reasons.push(...methodLeak.reasons);
  if (/\/Users\/|\/Volumes\/|\/home\/|[A-Za-z]:\\/.test(text)) reasons.push("local_path");
  if (/根据你的|根据.*文件|根据.*网站|according to your|source path/i.test(text)) reasons.push("source_framing");
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) reasons.push("privacy_violation");
  if ((text.match(/\n/g) || []).length > 4 || text.length > 420) reasons.push("answer_too_long");
  if (/完整歌词如下|全文如下|整首如下|逐字如下/.test(text)) reasons.push("copyright_violation");

  if (questionType === "works_list" || questionType === "representative_works" || questionType === "listen_recommendation") {
    if (!/《[^》]+》/.test(text)) reasons.push("works_list_missing_works");
  }
  if (questionType === "author_list" && !/(夏目|川端|太宰|村上|Lowell|洛厄尔|芭蕉|德里达|鲁迅|张爱玲|沈从文|老舍|余华|莫言|罗大佑|李宗盛|邓丽君|崔健|王菲|周杰伦|Beyond|林夕|杜尚|毕加索|康定斯基|沃霍尔|波洛克|蒙德里安)/.test(text)) {
    reasons.push("author_list_missing_authors");
  }
  if (questionType === "compare" || questionType === "follow_up_compare_last_two") {
    if (!/(按|轴|比较|共同点|不同|更偏|更重|区别)/.test(text)) reasons.push("compare_missing_axis");
  }
  if (questionType === "entry_path" || questionType === "reading_recommendation" || questionType === "listen_recommendation") {
    if (!/(先|入门|入口|开始|路线|可选|《)/.test(text)) reasons.push("entry_path_missing_entry");
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
  const coverage = assessCoverageForAnswer({
    query,
    domain: cards[0]?.domain || state.last_domain || "",
    questionType,
    answer: text,
    retrievedCards: cards
  });
  if (!coverage.ok) reasons.push(...coverage.reasons);

  return {
    ok: reasons.length === 0,
    reasons,
    answer: text
  };
}
