const DEMO_MEMORY_ASSET = "../another_brain/static_rag/demo_memory.json";
const PROFILE_CARD_ASSETS = Object.freeze([
  "../another_brain/static_rag/brand_cards.json",
  "../another_brain/static_rag/brand_literacy_cards.json",
  "../another_brain/static_rag/world_cards.json",
  "../another_brain/static_rag/reasoning_cards.json",
  "../another_brain/static_rag/profile_cards.json",
  "../another_brain/static_rag/style_cards.json",
  "../another_brain/static_rag/boundary_cards.json",
  "../another_brain/static_rag/logic_cards.json",
  "../another_brain/static_rag/knowledge_cards.json",
  "../another_brain/static_rag/history_cards.json",
  "../another_brain/static_rag/society_cards.json"
]);
const DEFAULT_RAG_ASSETS = Object.freeze([DEMO_MEMORY_ASSET, ...PROFILE_CARD_ASSETS]);
const CARD_KINDS = Object.freeze(["brand", "brand_literacy", "identity", "style", "value", "aesthetic", "boundary", "capability", "commonsense", "philosophy", "logic", "judgment", "history", "society", "association", "context"]);
const CARD_PROVENANCE = Object.freeze(["approved_anchor_summary", "hand_authored_boundary", "demo_safe"]);
const QUERY_EXPANSION_RULES = Object.freeze([
  { match: /iphone|苹果手机|mac|ipad|ios/i, terms: ["apple", "苹果", "生态", "硬件", "软件"] },
  { match: /bmw|宝马|m3|e30/i, terms: ["bmw", "宝马", "驾驶", "工程", "品牌"] },
  { match: /nissan|skyline|gtr|gt-r|日产|尼桑/i, terms: ["nissan", "skyline", "gt-r", "性能", "汽车文化"] },
  { match: /porsche|保时捷|911/i, terms: ["porsche", "保时捷", "跑车", "工程", "传统"] },
  { match: /sony|索尼|walkman|playstation/i, terms: ["sony", "索尼", "消费电子", "影像", "娱乐"] },
  { match: /nintendo|任天堂|switch|mario/i, terms: ["nintendo", "任天堂", "游戏", "玩法", "家庭娱乐"] },
  { match: /dji|大疆|无人机/i, terms: ["dji", "大疆", "无人机", "影像", "硬件"] },
  { match: /tiktok|抖音|短视频/i, terms: ["tiktok", "抖音", "推荐", "注意力", "平台"] },
  { match: /微信|wechat/i, terms: ["微信", "wechat", "社交", "支付", "超级应用"] },
  { match: /半导体|芯片|晶体管|gpu|算力/i, terms: ["半导体", "芯片", "晶体管", "供应链", "计算"] },
  { match: /互联网|万维网|web|http|网页/i, terms: ["互联网", "万维网", "协议", "信息分发", "平台"] },
  { match: /手机|智能手机|移动互联网/i, terms: ["智能手机", "移动互联网", "触屏", "应用生态"] },
  { match: /电池|锂电|续航|充电/i, terms: ["电池", "锂离子", "能量密度", "充电", "安全"] },
  { match: /电|电流|电压|电路/i, terms: ["电", "电流", "电压", "电路", "能量"] },
  { match: /光合作用|植物|叶绿素/i, terms: ["光合作用", "植物", "太阳能", "二氧化碳", "氧气"] },
  { match: /重力|引力|掉下|轨道|绕着/i, terms: ["重力", "引力", "轨道", "质量", "运动"] },
  { match: /疫苗|免疫|病毒/i, terms: ["疫苗", "免疫", "抗体", "公共卫生", "风险"] },
  { match: /概率|随机|运气|风险/i, terms: ["概率", "随机", "样本", "风险", "不确定性"] },
  { match: /对错|真假|真伪|对不对|有没有标准|能不能判断|是否成立|可证伪|事实判断|价值判断|审美判断/i, terms: ["对错判定", "事实", "价值", "审美", "证据", "标准", "可验证", "判断"] },
  { match: /铁路|火车|高铁|轨道|交通|物流|通勤|标准时间|城市扩张|铁路为什么方便|铁路.*方便/i, terms: ["铁路", "轨道", "标准时间", "物流", "通勤", "城市", "网络", "成本", "可预期", "基础设施"] },
  { match: /时间.*线性|线性.*时间|时间观|钟表时间|心理时间|叙事时间|因果顺序/i, terms: ["时间", "线性", "钟表", "记忆", "叙事", "因果", "顺序", "经验"] },
  { match: /关联|联系|关系|上下文|刚才|前面|上面|这个|它|这类|继续|那/i, terms: ["上下文", "关联", "对象", "机制", "功能", "影响", "代价", "判断链"] },
  { match: /有什么用|为什么.*有用|为什么.*方便|意义|重要|值得/i, terms: ["效用", "机制", "功能", "代价", "收益", "网络", "判断链"] },
  { match: /如果|假如|没有.*会|会怎样|反事实|条件改变/i, terms: ["反事实", "条件", "替代方案", "时间尺度", "路径", "不确定性"] },
  { match: /区别|差别|相比|哪个更|优劣|取舍|更好|更坏/i, terms: ["比较", "比较轴", "标准", "优劣", "取舍", "条件"] },
  { match: /像不像|类似|类比|相当于|同构|映射/i, terms: ["类比", "映射", "对象", "机制", "尺度", "边界"] },
  { match: /是什么|定义|算不算|边界|概念|命名/i, terms: ["定义", "概念边界", "相邻概念", "工作定义", "判断"] },
  { match: /偷换概念|范畴错误|不是一类|混为一谈|概念错位/i, terms: ["范畴错误", "概念错位", "判断轴", "边界", "标准"] },
  { match: /可不可以|能不能|有没有可能|现实吗|可行|不可行/i, terms: ["可行性", "理论可行", "现实可行", "成本", "约束"] },
  { match: /多大程度|有多|越.*越|程度|范围|阈值/i, terms: ["程度判断", "范围", "阈值", "边界条件", "失效点"] },
  { match: /怎么做|如何实现|步骤|方法|流程|路径/i, terms: ["方法", "步骤", "目标", "约束", "验收标准"] },
  { match: /凭什么|怎么证明|证据够不够|有没有依据|可信度|证据阈值/i, terms: ["证据阈值", "证明", "依据", "主张强度", "可信度"] },
  { match: /既不是.*线性.*也不是.*非线性|不是线性.*不是非线性|非二分|二分|悖论|框架/i, terms: ["时间", "非二分", "概念框架", "模型", "线性", "非线性", "层面", "判断"] },
  { match: /不对|太长|太短|不准确|不是这个意思|没听懂|听不懂|僵硬|公式化|不错|很好|继续|换个说法|再简单/i, terms: ["评价", "反馈", "改写", "继续", "上下文", "对话控制"] },
  { match: /可是|但是|难道不是|反而|我不同意|不一定/i, terms: ["反驳", "异议", "修正", "判断层", "边界"] },
  { match: /自由|公平|正义|责任|伦理|应该|不应该|值得|不值得/i, terms: ["价值判断", "理由", "代价", "一致性", "边界", "责任"] },
  { match: /语言|词语|文字|表达|语境|翻译|误解|意思/i, terms: ["语言", "意义", "语境", "表达", "误解", "关系"] },
  { match: /文学|诗歌|诗|小说|叙事|文本|意象|隐喻|象征|现代主义|古典文学|读不懂/i, terms: ["文学", "诗歌", "叙事", "意象", "隐喻", "形式", "声音", "文本", "读者"] },
  { match: /音乐|流行乐|古典音乐|爵士|旋律|节奏|和声|歌词|专辑|副歌|巴赫|歌剧|合成器|采样/i, terms: ["音乐", "流行乐", "古典音乐", "旋律", "节奏", "和声", "歌词", "声音", "结构"] },
  { match: /艺术|绘画|雕塑|摄影|影像|构图|色彩|抽象艺术|现代艺术|博物馆|展览|策展|艺术史/i, terms: ["艺术", "视觉艺术", "构图", "材料", "色彩", "形式", "语境", "艺术史", "观看"] },
  { match: /算法|推荐|信息茧房|平台/i, terms: ["算法", "推荐系统", "激励", "分发", "注意力"] },
  { match: /排版|字体|杂志|bodoni|封面|视觉/i, terms: ["排版", "字体", "杂志", "层级", "留白", "对比"] }
]);

const QUESTION_CUE_RE = /[?？]|为什么|为何|怎么|如何|什么|谁|哪里|哪|是否|是不是|能不能|有没有|会不会|应不应该|值不值得|意义|原因|机制|怎么看|如何看待|你觉得|你认为/;
const FOLLOWUP_CUE_RE = /\[local session context:|刚才|前面|上面|这个|它|这类|这种|继续|那|刚刚|上一/;
const EVALUATION_CUE_RE = /不对|不准确|不是这个意思|太长|太短|太硬|太僵硬|公式化|没听懂|听不懂|很好|不错|可以|继续|换个说法|再简单|更具体|更短|更自然|更聪明/;
const CATEGORY_ERROR_RE = /偷换概念|范畴错误|不是一类|混为一谈|概念错位|判断轴不一样/;
const FEASIBILITY_RE = /可不可以|能不能|有没有可能|现实吗|可行|不可行|做得到|能做到/;
const DEGREE_RE = /多大程度|有多|越.*越|程度|范围|阈值|边界条件|失效点/;
const METHOD_RE = /怎么做|如何实现|步骤|方法|流程|路径|怎么落地|如何构建/;
const PROOF_RE = /凭什么|怎么证明|证据够不够|有没有依据|可信度|证据阈值|如何验证|怎么验证/;
const OBJECTION_RE = /可是|但是|难道不是|反而|我不同意|不一定|这不对|不是这样/;
const IDENTITY_RE = /你是谁|你是.*谁|你是鳄鱼|鳄鱼|efish|an other efish|another e fish|efishother|名字|自我介绍/i;
const EMOTIONAL_PRESSURE_RE = /没用|不聪明|太蠢|别装|必须回答|快点|你行不行|是不是不会|别糊弄|没有能力/;
const VALUE_CONFLICT_RE = /该不该|应不应该|值不值得|有没有必要|对不对|好不好|重要吗|自由|公平|责任|正义|道德|伦理|代价/;
const RELATION_ADVICE_RE = /关系|朋友|亲密|喜欢|爱|信任|分手|沟通|边界|相处|怎么办/;
const KNOWLEDGE_GAP_RE = /不知道|不了解|信息不足|缺少信息|没资料|没有证据|证据不足|无法判断|不确定/;
const TONE_REQUEST_RE = /换个口吻|像你一点|更有性格|别那么工程|别那么官方|更自然|更短|更锋利|别公式化/;
const TIME_DOMAIN_RE = /时间|线性|非线性|钟表|记忆|叙事|因果顺序|过去|未来|现在|永恒|循环|非二分|悖论/;
const INFRA_DOMAIN_RE = /铁路|火车|高铁|轨道|交通|物流|通勤|标准时间|城市|基础设施|港口|电网|水网|公路|机场/;
const JUDGMENT_DOMAIN_RE = /对错|真假|真伪|标准|判断|事实|价值|审美|证据|成立|可证伪|定义|边界|反例/;
const AESTHETIC_DOMAIN_RE = /美|审美|美学|好看|风格|设计|字体|排版|杂志|质感|比例/;
const LITERATURE_DOMAIN_RE = /文学|诗歌|诗|小说|叙事|文本|意象|隐喻|象征|现代主义|古典文学|读者|读不懂/;
const MUSIC_DOMAIN_RE = /音乐|流行乐|古典音乐|爵士|旋律|节奏|和声|歌词|专辑|副歌|巴赫|歌剧|合成器|采样/;
const ART_DOMAIN_RE = /艺术|绘画|雕塑|摄影|影像|构图|色彩|抽象艺术|现代艺术|博物馆|展览|策展|艺术史/;
const SOCIETY_DOMAIN_RE = /社会|平台|算法|隐私|教育|医疗|劳动|城市|房价|通胀|政策|品牌|公司|商业|供应链|历史|战争|革命/;
const TECHNOLOGY_DOMAIN_RE = /技术|芯片|半导体|手机|互联网|算法|软件|硬件|电池|计算|AI|模型|网络/i;
const NATURAL_DOMAIN_RE = /自然|太阳|月亮|天气|气候|植物|重力|引力|声音|雨|概率|随机|物理|生物/;
const LANGUAGE_DOMAIN_RE = /语言|词语|文字|表达|语境|翻译|误解|意思|叙述/;
const COMPLEX_CUE_RE = /既不是|也不是|无法定义|无限|绝对|本体|悖论|所有|永远|终极|不可判定|非二分/;
const CJK_STOP_TERMS = new Set(["这个", "那个", "一种", "这种", "问题", "为什么", "怎么", "如何", "觉得", "认为", "是否", "是不是", "有没有", "什么"]);
const STRUCTURE_MARKERS = Object.freeze({
  counterfactual: /反事实|如果|假如|条件改变|替代路径/,
  comparison: /比较|差别|区别|哪个更|比较轴|取舍/,
  analogy: /类比|映射|像不像|同构|相当于/,
  definition: /定义|边界|算不算|概念|工作定义/,
  category_error: /范畴错误|偷换概念|概念错位|判断轴|不是一类/,
  feasibility: /可行性|理论可行|现实可行|可不可以|能不能/,
  degree: /程度|范围|阈值|边界条件|失效点/,
  method: /方法|步骤|流程|路径|验收标准/,
  proof: /证据|证明|依据|可信度|主张强度/,
  objection: /反驳|异议|不一定|修正|但是|可是/,
  evaluation: /评价|反馈|换个说法|太长|太短|不对/,
  context: /上下文|追问|这个|上一轮|指代|继承/,
  identity: /身份|自我介绍|鳄鱼|efish|名字/,
  pressure: /压力|逼问|挑衅|别装|不会|没用/,
  value_conflict: /价值|该不该|值得|责任|正义|代价|伦理/,
  relation_advice: /关系|亲密|信任|沟通|边界|相处/,
  knowledge_gap: /证据不足|不知道|无法判断|信息不足|缺少信息/,
  tone_request: /口吻|自然|更短|更锋利|别公式化|别官方/
});
const COMPATIBLE_LANES = Object.freeze({
  category_error: new Set(["definition", "proof"]),
  truth_condition: new Set(["proof", "definition", "category_error"]),
  feasibility: new Set(["proof", "method", "degree"]),
  degree: new Set(["comparison", "proof"]),
  method: new Set(["feasibility", "proof"]),
  objection: new Set(["proof", "category_error", "evaluation"]),
  context: new Set(["evaluation", "definition", "comparison", "causal"]),
  evaluation: new Set(["context", "style"]),
  identity: new Set(["context", "style", "definition"]),
  pressure: new Set(["boundary", "style", "evaluation"]),
  value_conflict: new Set(["truth_condition", "degree", "proof"]),
  relation_advice: new Set(["value_conflict", "context", "degree"]),
  knowledge_gap: new Set(["proof", "boundary", "method"]),
  tone_request: new Set(["evaluation", "style", "context"]),
  causal: new Set(["proof", "counterfactual"]),
  frame_challenge: new Set(["definition", "category_error", "truth_condition"])
});

const FALLBACK_DEMO_RECORDS = [
  {
    source_id: "r27b3-demo-browser-memory-surface",
    title: "Browser memory surface demo boundary",
    text: "another_brain is rehearsing a static browser chat surface that retrieves local evidence packets before drafting.",
    trust_level: "high",
    license_or_origin: "synthetic demo fixture",
    can_answer: true,
    keywords: ["another_brain", "browser", "memory", "surface", "local", "evidence", "packet"]
  }
];

const MALICIOUS_MARKERS = [
  "ignore previous instructions",
  "reveal hidden prompt",
  "show the hidden prompt",
  "system prompt",
  "developer message",
  "chain-of-thought",
  "<hidden",
  "忽略前面的规则",
  "隐藏提示",
  "开发者消息"
];

const FORBIDDEN_CARD_MARKERS = [
  "question_pack_001",
  "rows 51-100",
  "row 51",
  "row 100",
  "eval prompt",
  "hidden prompt",
  "chain-of-thought",
  "raw private",
  "private_sources/",
  "data/public_ingestion",
  ".docx",
  ".pdf",
  "api key",
  "password"
];

function cleanList(value) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function tokenize(text) {
  const raw = String(text || "").toLowerCase();
  const tokens = raw.match(/[a-z0-9_]+/g) || [];
  const cjkRuns = raw.match(/[\u4e00-\u9fff]+/g) || [];
  for (const run of cjkRuns) {
    if (run.length === 1) {
      if ("美死生爱词".includes(run)) tokens.push(run);
      continue;
    }
    if (run.length === 2) tokens.push(run);
    for (let index = 0; index <= run.length - 2; index += 1) tokens.push(run.slice(index, index + 2));
    for (let index = 0; index <= run.length - 3; index += 1) tokens.push(run.slice(index, index + 3));
  }
  return tokens;
}

function expandQueryTokens(query) {
  const tokens = tokenize(query);
  const expanded = [...tokens];
  const text = String(query || "");
  for (const rule of QUERY_EXPANSION_RULES) {
    if (!rule.match.test(text)) continue;
    expanded.push(...rule.terms.flatMap((term) => tokenize(term)));
  }
  return expanded;
}

export function extractQueryKeywords(query = "", limit = 16) {
  const raw = String(query || "");
  const keywords = [];
  const push = (term) => {
    const clean = String(term || "").trim();
    if (!clean || CJK_STOP_TERMS.has(clean) || keywords.includes(clean)) return;
    keywords.push(clean);
  };
  for (const rule of QUERY_EXPANSION_RULES) {
    if (!rule.match.test(raw)) continue;
    for (const term of rule.terms) push(term);
  }
  for (const run of raw.match(/[\u4e00-\u9fff]{2,8}/g) || []) {
    if (CJK_STOP_TERMS.has(run)) continue;
    push(run);
  }
  for (const token of raw.toLowerCase().match(/[a-z0-9_]{3,}/g) || []) push(token);
  return keywords.slice(0, limit);
}

function inferJudgmentLayer(text = "") {
  if (CATEGORY_ERROR_RE.test(text) || /是什么|什么是|定义|算不算|边界|概念|命名/.test(text)) return "definition";
  if (/美|审美|美学|好看|风格|设计|质感/.test(text)) return "aesthetic";
  if (/应该|不应该|值得|不值得|自由|公平|正义|责任|伦理|关系|重要|意义|价值/.test(text)) return "normative";
  if (/对错|真假|真伪|事实|证据|证明|是否成立|可证伪|凭什么/.test(text)) return "factual";
  if (/有没有标准|怎么判断|如何判断/.test(text)) return "mixed";
  return "unknown";
}

function makeRetrievalLanes(primary, compatible = []) {
  const exclusions = Object.keys(STRUCTURE_MARKERS).filter((lane) => lane !== primary && !compatible.includes(lane));
  return {
    retrieval_lane: primary,
    compatible_lanes: compatible,
    excluded_lanes: exclusions
  };
}

export function inferQuestionProfile(query = "") {
  const text = String(query || "").trim();
  const hasQuestionCue = QUESTION_CUE_RE.test(text);
  const hasFollowupCue = FOLLOWUP_CUE_RE.test(text);
  const hasEvaluationCue = EVALUATION_CUE_RE.test(text);
  const isLong = text.length >= 56;
  const profile = {
    turn_type: hasEvaluationCue && !hasQuestionCue ? "evaluation" : hasQuestionCue ? "question" : "statement",
    question_shape: "open",
    domain_hint: "general",
    reasoning_mode: "direct",
    retrieval_lane: "open",
    compatible_lanes: [],
    excluded_lanes: [],
    judgment_layer: inferJudgmentLayer(text),
    answer_length_hint: isLong ? "short" : "micro",
    needs_context: hasFollowupCue,
    soft_redirect_allowed: COMPLEX_CUE_RE.test(text),
    keyword_candidates: extractQueryKeywords(text)
  };
  if (!text) {
    profile.turn_type = "empty";
    profile.question_shape = "empty";
    profile.answer_length_hint = "micro";
    return profile;
  }
  if (TONE_REQUEST_RE.test(text)) {
    profile.question_shape = "tone_request";
    profile.domain_hint = "dialogue";
    profile.reasoning_mode = "voice_repair";
    Object.assign(profile, makeRetrievalLanes("tone_request", ["evaluation", "style", "context"]));
    profile.needs_context = true;
    profile.answer_length_hint = "micro";
    return profile;
  }
  if (hasEvaluationCue && !hasQuestionCue) {
    profile.question_shape = "feedback";
    profile.domain_hint = "dialogue";
    profile.reasoning_mode = "style_adjustment";
    Object.assign(profile, makeRetrievalLanes("evaluation", ["context"]));
    profile.needs_context = true;
    profile.answer_length_hint = "micro";
    return profile;
  }
  if (EMOTIONAL_PRESSURE_RE.test(text) && !hasQuestionCue) {
    profile.question_shape = "emotional_pressure";
    profile.domain_hint = "dialogue";
    profile.reasoning_mode = "pressure_resistance";
    Object.assign(profile, makeRetrievalLanes("pressure", ["boundary", "style", "evaluation"]));
    profile.answer_length_hint = "micro";
    return profile;
  }
  if (/既不是.*线性.*也不是.*非线性|不是线性.*不是非线性|非二分|二分|悖论/.test(text)) {
    profile.question_shape = "conceptual_paradox";
    profile.domain_hint = TIME_DOMAIN_RE.test(text) ? "time" : "logic";
    profile.reasoning_mode = "frame_challenge";
    Object.assign(profile, makeRetrievalLanes("frame_challenge", ["definition", "category_error", "proof"]));
    profile.answer_length_hint = "short";
    return profile;
  }
  if (/为什么|为何|原因|机制|怎么造成|如何发生/.test(text)) profile.question_shape = "causal";
  if (IDENTITY_RE.test(text)) profile.question_shape = "identity";
  if (EMOTIONAL_PRESSURE_RE.test(text)) profile.question_shape = "emotional_pressure";
  if (/如果|假如|没有.*会|会怎样|反事实|条件改变/.test(text)) profile.question_shape = "counterfactual";
  if (/区别|差别|相比|哪个更|优劣|取舍|更好|更坏/.test(text)) profile.question_shape = "comparison";
  if (/像不像|类似|类比|相当于|同构|映射/.test(text)) profile.question_shape = "analogy";
  if (/是什么|什么是|定义/.test(text)) profile.question_shape = "definition";
  if (CATEGORY_ERROR_RE.test(text)) profile.question_shape = "category_error";
  if (FEASIBILITY_RE.test(text)) profile.question_shape = "feasibility";
  if (DEGREE_RE.test(text)) profile.question_shape = "degree";
  if (METHOD_RE.test(text)) profile.question_shape = "method";
  if (PROOF_RE.test(text)) profile.question_shape = "proof_request";
  if (OBJECTION_RE.test(text) && !hasEvaluationCue) profile.question_shape = "objection";
  if (RELATION_ADVICE_RE.test(text) && !IDENTITY_RE.test(text)) profile.question_shape = "relation_advice";
  if (VALUE_CONFLICT_RE.test(text) && !["category_error", "feasibility", "degree", "method", "proof_request", "relation_advice"].includes(profile.question_shape)) profile.question_shape = "value_conflict";
  if (KNOWLEDGE_GAP_RE.test(text)) profile.question_shape = "knowledge_gap";
  if (/是否|是不是|能不能|有没有|会不会/.test(text) && profile.question_shape === "open") profile.question_shape = "binary_judgment";
  if (/对错|真假|标准|判断|成立|可证伪/.test(text) && !["category_error", "feasibility", "degree", "method", "proof_request", "value_conflict", "knowledge_gap"].includes(profile.question_shape)) profile.question_shape = "truth_condition";
  if (hasFollowupCue && text.length <= 36 && profile.question_shape === "open") profile.question_shape = "short_followup";
  if (TIME_DOMAIN_RE.test(text)) profile.domain_hint = "time";
  else if (INFRA_DOMAIN_RE.test(text)) profile.domain_hint = "infrastructure";
  else if (LITERATURE_DOMAIN_RE.test(text)) profile.domain_hint = "literature";
  else if (MUSIC_DOMAIN_RE.test(text)) profile.domain_hint = "music";
  else if (ART_DOMAIN_RE.test(text)) profile.domain_hint = "art";
  else if (TECHNOLOGY_DOMAIN_RE.test(text)) profile.domain_hint = "technology";
  else if (NATURAL_DOMAIN_RE.test(text)) profile.domain_hint = "natural";
  else if (AESTHETIC_DOMAIN_RE.test(text)) profile.domain_hint = "aesthetic";
  else if (JUDGMENT_DOMAIN_RE.test(text)) profile.domain_hint = "judgment";
  else if (SOCIETY_DOMAIN_RE.test(text)) profile.domain_hint = "society";
  else if (LANGUAGE_DOMAIN_RE.test(text)) profile.domain_hint = "language";
  if (profile.question_shape === "causal") profile.reasoning_mode = "mechanism_chain";
  if (profile.question_shape === "identity") profile.reasoning_mode = "identity_boundary";
  if (profile.question_shape === "emotional_pressure") profile.reasoning_mode = "pressure_resistance";
  if (profile.question_shape === "counterfactual") profile.reasoning_mode = "counterfactual_delta";
  if (profile.question_shape === "comparison") profile.reasoning_mode = "compare_by_axis";
  if (profile.question_shape === "analogy") profile.reasoning_mode = "analogy_mapping";
  if (profile.question_shape === "definition") profile.reasoning_mode = "define_boundary";
  if (profile.question_shape === "category_error") profile.reasoning_mode = "category_axis_check";
  if (profile.question_shape === "feasibility") profile.reasoning_mode = "feasibility_split";
  if (profile.question_shape === "degree") profile.reasoning_mode = "degree_boundary";
  if (profile.question_shape === "method") profile.reasoning_mode = "method_path";
  if (profile.question_shape === "proof_request") profile.reasoning_mode = "evidence_threshold";
  if (profile.question_shape === "objection") profile.reasoning_mode = "objection_reframe";
  if (profile.question_shape === "value_conflict") profile.reasoning_mode = "normative_axis_split";
  if (profile.question_shape === "relation_advice") profile.reasoning_mode = "relationship_boundary";
  if (profile.question_shape === "knowledge_gap") profile.reasoning_mode = "known_unknown_split";
  if (profile.question_shape === "truth_condition" || profile.question_shape === "binary_judgment") profile.reasoning_mode = "truth_value_split";
  if (profile.question_shape === "short_followup") profile.reasoning_mode = "context_rewrite";
  const laneByShape = {
    causal: ["causal", ["proof", "counterfactual"]],
    identity: ["identity", ["definition", "context", "style"]],
    counterfactual: ["counterfactual", ["causal", "proof"]],
    comparison: ["comparison", ["degree", "definition"]],
    analogy: ["analogy", ["comparison", "definition"]],
    definition: ["definition", ["category_error", "proof"]],
    category_error: ["category_error", ["definition", "proof"]],
    feasibility: ["feasibility", ["method", "proof", "degree"]],
    degree: ["degree", ["comparison", "proof"]],
    method: ["method", ["feasibility", "proof"]],
    proof_request: ["proof", ["truth_condition", "definition"]],
    objection: ["objection", ["proof", "category_error", "evaluation"]],
    value_conflict: ["value_conflict", ["truth_condition", "degree", "proof"]],
    relation_advice: ["relation_advice", ["value_conflict", "context", "degree"]],
    knowledge_gap: ["knowledge_gap", ["proof", "boundary", "method"]],
    tone_request: ["tone_request", ["evaluation", "style", "context"]],
    emotional_pressure: ["pressure", ["boundary", "style", "evaluation"]],
    truth_condition: ["truth_condition", ["proof", "definition", "category_error"]],
    binary_judgment: ["truth_condition", ["proof", "definition", "feasibility"]],
    short_followup: ["context", ["evaluation", "definition", "comparison"]]
  };
  if (laneByShape[profile.question_shape]) {
    Object.assign(profile, makeRetrievalLanes(laneByShape[profile.question_shape][0], laneByShape[profile.question_shape][1]));
  }
  if (profile.question_shape === "short_followup") profile.answer_length_hint = "micro";
  if (["causal", "counterfactual", "comparison", "analogy", "conceptual_paradox", "category_error", "feasibility", "degree", "method", "proof_request", "objection", "value_conflict", "relation_advice", "knowledge_gap", "identity"].includes(profile.question_shape)) profile.answer_length_hint = "short";
  return profile;
}

function charNgrams(text, size = 3) {
  const clean = String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
  const grams = new Set();
  for (let index = 0; index <= clean.length - size; index += 1) grams.add(clean.slice(index, index + size));
  return grams;
}

function scoreRecord(query, record) {
  const queryTokens = expandQueryTokens(query);
  if (queryTokens.length === 0) return 0;
  const keywordText = (record.keywords || []).join(" ");
  const haystack = `${record.title || ""} ${record.text || ""} ${keywordText}`;
  const documentTokens = new Set(tokenize(haystack));
  const keywordTokens = new Set(tokenize(keywordText));
  const titleTokens = new Set(tokenize(record.title || ""));
  let overlap = 0;
  let weightedOverlap = 0;
  for (const token of new Set(queryTokens)) {
    if (!documentTokens.has(token)) continue;
    overlap += 1;
    weightedOverlap += 1;
    if (keywordTokens.has(token)) weightedOverlap += 0.5;
    if (titleTokens.has(token)) weightedOverlap += 0.25;
  }
  const qgrams = charNgrams(query);
  const dgrams = charNgrams(haystack);
  let gramOverlap = 0;
  for (const gram of qgrams) {
    if (dgrams.has(gram)) gramOverlap += 1;
  }
  const keywordScore = weightedOverlap / Math.max(queryTokens.length, 1);
  const gramScore = qgrams.size ? gramOverlap / qgrams.size : 0;
  const hasLexicalOverlap = overlap > 0 || gramOverlap > 0;
  const kindBoost = profileKindBoost(query, record);
  const intentBoost = questionProfileBoost(inferQuestionProfile(query), record, hasLexicalOverlap);
  if (!hasLexicalOverlap && kindBoost + intentBoost <= 0) return 0;
  const trustBoost = hasLexicalOverlap ? (record.trust_level === "high" ? 0.08 : record.trust_level === "medium" ? 0.04 : 0) : 0;
  const profileBoost = hasLexicalOverlap && record.metadata?.r28rag3_profile_card ? 0.025 : 0;
  return Number(Math.max(0, keywordScore * 0.72 + gramScore * 0.2 + trustBoost + profileBoost + kindBoost + intentBoost).toFixed(6));
}

function recordStructureLanes(record = {}) {
  const text = `${record.title || ""} ${record.text || ""} ${(record.keywords || []).join(" ")} ${(record.metadata?.tone_hints || []).join(" ")}`;
  const lanes = [];
  for (const [lane, marker] of Object.entries(STRUCTURE_MARKERS)) {
    if (marker.test(text)) lanes.push(lane);
  }
  const kind = record.metadata?.card_kind || "";
  if (kind === "context" && !lanes.includes("context")) lanes.push("context");
  if (kind === "style" && !lanes.includes("evaluation")) lanes.push("evaluation");
  if (kind === "boundary" && !lanes.includes("proof")) lanes.push("proof");
  return lanes;
}

function structureCompatibilityBoost(profile = {}, record = {}) {
  const primary = profile.retrieval_lane;
  if (!primary || primary === "open") return 0;
  const lanes = recordStructureLanes(record);
  if (lanes.length === 0) return 0;
  const compatible = new Set([primary, ...(profile.compatible_lanes || []), ...(COMPATIBLE_LANES[primary] || [])]);
  if (lanes.includes(primary)) return 0.14;
  if (lanes.some((lane) => compatible.has(lane))) return 0.05;
  return -0.12;
}

function questionProfileBoost(profile = {}, record = {}, hasLexicalOverlap = false) {
  const kind = record.metadata?.card_kind || "";
  const text = `${record.title || ""} ${record.text || ""} ${(record.keywords || []).join(" ")}`;
  let boost = structureCompatibilityBoost(profile, record);
  if (profile.turn_type === "evaluation") {
    if (kind === "context") boost += 0.18;
    if (kind === "style" || kind === "boundary") boost += 0.06;
    if (["brand_literacy", "history", "commonsense"].includes(kind) && !hasLexicalOverlap) boost -= 0.14;
  }
  if (["tone_request", "emotional_pressure"].includes(profile.question_shape)) {
    if (["style", "boundary", "context"].includes(kind)) boost += 0.16;
    if (["history", "commonsense", "brand_literacy", "society"].includes(kind) && !hasLexicalOverlap) boost -= 0.12;
  }
  if (profile.question_shape === "identity") {
    if (["brand", "identity", "style", "context"].includes(kind)) boost += 0.16;
    if (["history", "society", "commonsense"].includes(kind) && !hasLexicalOverlap) boost -= 0.12;
  }
  if (profile.question_shape === "value_conflict") {
    if (["judgment", "logic", "philosophy", "value"].includes(kind)) boost += 0.14;
    if (/理由|代价|边界|自洽|价值|事实/.test(text)) boost += 0.08;
  }
  if (profile.question_shape === "relation_advice") {
    if (["judgment", "context", "value", "philosophy"].includes(kind)) boost += 0.14;
    if (/关系|信任|边界|沟通|亲密/.test(text)) boost += 0.08;
  }
  if (profile.question_shape === "knowledge_gap") {
    if (["boundary", "judgment", "logic"].includes(kind)) boost += 0.14;
    if (/证据不足|不知道|无法判断|信息不足|能判断到哪/.test(text)) boost += 0.08;
  }
  if (profile.question_shape === "short_followup") {
    if (kind === "context") boost += 0.18;
    if (kind === "association") boost += 0.08;
  }
  if (profile.question_shape === "conceptual_paradox") {
    if (["logic", "philosophy", "judgment", "association"].includes(kind)) boost += 0.12;
    if (/非二分|框架|模型|线性|非线性|时间/.test(text)) boost += 0.12;
    if (kind === "history" || kind === "brand_literacy") boost -= 0.08;
  }
  if (profile.domain_hint === "time") {
    if (/时间|钟表|记忆|叙事|线性|非线性|因果/.test(text)) boost += 0.14;
    if (kind === "association" || kind === "logic" || kind === "philosophy") boost += 0.06;
    if (/铁路|轨道|物流|通勤|基础设施|城市|市场|供给/.test(text) && !/铁路|火车|高铁|轨道|标准时间/.test(String(profile.keyword_candidates || ""))) boost -= 0.28;
  }
  if (profile.domain_hint === "infrastructure") {
    if (/铁路|轨道|交通|物流|标准时间|城市|基础设施/.test(text)) boost += 0.16;
    if (kind === "association" || kind === "history" || kind === "society") boost += 0.06;
    if (/时间|线性|非线性/.test(text) && !/时间|标准时间/.test(text)) boost -= 0.08;
  }
  if (profile.domain_hint === "judgment") {
    if (kind === "judgment" || kind === "logic") boost += 0.14;
  }
  if (profile.domain_hint === "technology") {
    if (/技术|芯片|手机|互联网|算法|电池|软件|硬件|计算/.test(text)) boost += 0.13;
    if (["history", "society", "commonsense", "logic"].includes(kind)) boost += 0.04;
  }
  if (profile.domain_hint === "natural") {
    if (/自然|太阳|月亮|天气|气候|植物|重力|概率|物理|生物/.test(text)) boost += 0.13;
    if (["commonsense", "logic"].includes(kind)) boost += 0.06;
  }
  if (profile.domain_hint === "language") {
    if (/语言|词语|文字|表达|语境|翻译|误解|意义/.test(text)) boost += 0.13;
    if (["philosophy", "logic", "context"].includes(kind)) boost += 0.05;
  }
  if (profile.domain_hint === "literature") {
    if (/文学|诗歌|小说|叙事|意象|隐喻|文本|读者|现代主义|古典文学|声音|语序/.test(text)) boost += 0.15;
    if (["aesthetic", "language", "logic", "context", "history", "philosophy"].includes(kind)) boost += 0.06;
    if (["commonsense", "brand_literacy", "society"].includes(kind) && !hasLexicalOverlap) boost -= 0.09;
  }
  if (profile.domain_hint === "music") {
    if (/音乐|流行乐|古典音乐|爵士|旋律|节奏|和声|歌词|专辑|副歌|声音|结构/.test(text)) boost += 0.15;
    if (["aesthetic", "history", "society", "language", "context", "logic"].includes(kind)) boost += 0.06;
    if (["commonsense", "brand_literacy"].includes(kind) && !hasLexicalOverlap) boost -= 0.08;
  }
  if (profile.domain_hint === "art") {
    if (/艺术|视觉艺术|绘画|摄影|构图|色彩|材料|抽象艺术|博物馆|策展|艺术史|观看/.test(text)) boost += 0.15;
    if (["aesthetic", "history", "society", "logic", "context"].includes(kind)) boost += 0.06;
    if (["commonsense", "brand_literacy"].includes(kind) && !hasLexicalOverlap) boost -= 0.08;
  }
  if (profile.domain_hint === "aesthetic") {
    if (kind === "aesthetic") boost += 0.16;
    if (kind === "logic") boost += 0.04;
  }
  if (profile.question_shape === "causal" && ["logic", "association", "commonsense", "history", "society"].includes(kind)) boost += 0.06;
  if (profile.question_shape === "counterfactual" && ["logic", "association", "history", "society"].includes(kind)) boost += 0.09;
  if (profile.question_shape === "comparison" && ["judgment", "logic", "brand_literacy", "society"].includes(kind)) boost += 0.08;
  if (profile.question_shape === "analogy" && ["association", "logic", "philosophy"].includes(kind)) boost += 0.08;
  if (profile.question_shape === "definition" && ["logic", "judgment", "philosophy"].includes(kind)) boost += 0.07;
  if (profile.question_shape === "category_error" && ["logic", "judgment"].includes(kind)) boost += 0.11;
  if (profile.question_shape === "feasibility" && ["judgment", "logic", "society", "commonsense"].includes(kind)) boost += 0.1;
  if (profile.question_shape === "degree" && ["judgment", "logic", "association"].includes(kind)) boost += 0.09;
  if (profile.question_shape === "method" && ["logic", "capability", "society"].includes(kind)) boost += 0.08;
  if (profile.question_shape === "proof_request" && ["boundary", "judgment", "logic"].includes(kind)) boost += 0.11;
  if (profile.question_shape === "objection" && ["judgment", "context", "logic"].includes(kind)) boost += 0.09;
  return boost;
}

function profileKindBoost(query = "", record = {}) {
  const text = String(query || "").toLowerCase();
  const kind = record.metadata?.card_kind || "";
  if (kind === "brand" && /efish|efishother|鳄鱼|域名|domain|品牌|another[_ ]?brain|你是谁|旧昵称/.test(text)) return 0.12;
  if (kind === "brand_literacy" && /apple|苹果|google|谷歌|microsoft|微软|tesla|特斯拉|nike|耐克|coca|可口可乐|mcdonald|麦当劳|starbucks|星巴克|huawei|华为|byd|比亚迪|openai|vercel|meta|facebook|instagram|amazon|亚马逊|toyota|丰田|leica|徕卡|品牌|公司|商业|产品|平台/.test(text)) return 0.13;
  if (kind === "history" && /工业革命|法国大革命|美国独立|一战|二战|世界大战|冷战|辛亥|五四|大萧条|改革开放|互联网|金融危机|疫情|covid|transformer|文艺复兴|启蒙|印刷术|古登堡|太空竞赛|全球化|历史|革命|战争|危机|modern|war|revolution|renaissance|enlightenment|globalization/.test(text)) return 0.13;
  if (kind === "society" && /通胀|物价|房价|住房|平台|隐私|气候|教育|医疗|劳动|工资|迁移|移民|信任|社会|经济|政策|现实|工作|数据|算法/.test(text)) return 0.12;
  if (kind === "aesthetic" && /审美|好看|风格|aesthetic|taste|style|文学|诗歌|音乐|绘画|艺术|构图|旋律|节奏|和声/.test(text)) return 0.12;
  if (["language", "context", "philosophy"].includes(kind) && /文学|诗歌|小说|叙事|文本|意象|隐喻|读者|语序|声音/.test(text)) return 0.1;
  if (["history", "society", "language"].includes(kind) && /音乐|流行乐|古典音乐|爵士|旋律|节奏|和声|歌词|专辑|采样/.test(text)) return 0.1;
  if (["history", "society", "logic"].includes(kind) && /艺术|绘画|摄影|影像|构图|色彩|抽象艺术|博物馆|策展|艺术史/.test(text)) return 0.1;
  if (kind === "commonsense" && /太阳|日出|日落|东升西落|天气|气温|升温|降温|自然|常识|天空|蓝天|月亮|季节|时间|下雨|雨|沸腾|烧开|声音|振动|真空|why|原因/.test(text)) return 0.1;
  if (kind === "philosophy" && /生死|生与死|活着|存在|虚无|意义|哲学|自由|有限|死亡|孤独|记忆|正义|责任|真理|真实|事实/.test(text)) return 0.1;
  if (kind === "logic" && /为什么|如何看待|怎么看|判断|因果|证据|推理|逻辑|because|reason/.test(text)) return 0.09;
  if (kind === "logic" && /偷换概念|范畴错误|怎么做|如何实现|步骤|方法|流程|路径|前提|假设/.test(text)) return 0.13;
  if (kind === "judgment" && /对错|真假|真伪|对不对|有没有标准|能不能判断|是否成立|可证伪|事实|价值|审美|证据|判断|标准|可不可以|有没有可能|多大程度|阈值|反驳|不一定/.test(text)) return 0.14;
  if (kind === "style" && /换个口吻|更自然|更短|更有性格|别公式化|别官方|太长|太短|僵硬|重复|问过/.test(text)) return 0.16;
  if (kind === "boundary" && /别装|必须回答|你行不行|不会|证据不足|不知道|无法判断|隐藏|系统提示|prompt/.test(text)) return 0.14;
  if (kind === "association" && /关联|联系|为什么|意义|方便|机制|影响|连接|因果|铁路|交通|物流|时间|线性|类比|映射|多跳|长期/.test(text)) return 0.16;
  if (kind === "context" && /刚才|上面|前面|这个|它|这类|继续|上下文|为什么方便|有什么用|那/.test(text)) return 0.16;
  if (kind === "context" && /不对|不是这个|太长|太短|换个说法|继续聊|接话|评价/.test(text)) return 0.14;
  if (kind === "value" && /价值|对错|重要|承诺|信任|value/.test(text)) return 0.08;
  if (kind === "boundary" && /证据|不足|冲突|隐藏|系统提示|evidence|conflict|prompt/.test(text)) return 0.08;
  if (kind === "identity" && /你是谁|鳄鱼|关系|identity|who are you/.test(text)) return 0.06;
  if (kind === "capability" && /能做什么|可以帮|capability|help/.test(text)) return 0.06;
  return 0;
}

function normalizeCard(card = {}, index = 0) {
  const failures = [];
  if (typeof card.id !== "string" || !card.id.trim()) failures.push("id_missing");
  if (!CARD_KINDS.includes(card.kind)) failures.push("kind_invalid");
  if (typeof card.text !== "string" || !card.text.trim()) failures.push("text_missing");
  if (!CARD_PROVENANCE.includes(card.provenance)) failures.push("provenance_invalid");
  if (card.allowed_for_training !== false) failures.push("allowed_for_training_must_be_false");
  if (card.private_raw_data !== false) failures.push("private_raw_data_must_be_false");
  if (card.review_status !== "approved_for_runtime") failures.push("review_status_invalid");
  if ("answer" in card || "final_answer" in card || "answer_text" in card) failures.push("answer_bank_field_rejected");
  const searchable = `${card.id || ""}\n${card.kind || ""}\n${card.text || ""}\n${cleanList(card.keywords).join("\n")}`.toLowerCase();
  for (const marker of FORBIDDEN_CARD_MARKERS) {
    if (searchable.includes(marker)) failures.push(`forbidden_marker:${marker}`);
  }
  if (failures.length) throw new Error(`r28rag3_card_invalid:${card.id || index}:${failures.join(",")}`);
  const expressiveHints = cleanList(card.expressive_hints);
  const toneHints = [...cleanList(card.tone_hints), ...expressiveHints];
  return {
    source_id: String(card.id),
    title: `R28RAG3 ${card.kind} card`,
    text: String(card.text),
    trust_level: card.provenance === "approved_anchor_summary" ? "high" : "medium",
    license_or_origin: String(card.provenance),
    can_answer: true,
    keywords: [String(card.kind), String(card.provenance), ...cleanList(card.keywords), ...toneHints],
    metadata: {
      r28rag3_profile_card: true,
      card_kind: String(card.kind),
      provenance: String(card.provenance),
      allowed_for_training: false,
      private_raw_data: false,
      review_status: "approved_for_runtime",
      tone_hints: toneHints,
      expressive_hints: expressiveHints,
      source_display: `${card.kind}:${card.provenance}`
    }
  };
}

function normalizeCards(fixture) {
  const cards = Array.isArray(fixture) ? fixture : fixture?.cards;
  if (!Array.isArray(cards)) throw new Error("r28rag3_cards_missing");
  if (fixture?.fixture_policy?.answer_bank === true) throw new Error("r28rag3_answer_bank_fixture_rejected");
  if (fixture?.fixture_policy?.private_raw_data === true) throw new Error("r28rag3_private_raw_fixture_rejected");
  return cards.map(normalizeCard);
}

function normalizeRecords(fixture) {
  const records = Array.isArray(fixture) ? fixture : fixture?.records;
  if (!Array.isArray(records) && Array.isArray(fixture?.cards)) return normalizeCards(fixture);
  if (!Array.isArray(records)) return FALLBACK_DEMO_RECORDS;
  if (fixture?.fixture_policy?.answer_bank === true) return FALLBACK_DEMO_RECORDS;
  return records.filter((record) => !("answer" in record || "final_answer" in record || "answer_text" in record));
}

function classifyEvidence(query, evidence) {
  if (!String(query || "").trim() || evidence.length === 0) {
    return { evidence_status: "insufficient", answer_policy_hint: "ask_clarifying" };
  }
  const groups = new Map();
  for (const item of evidence) {
    const group = item.metadata?.conflict_group;
    const value = item.metadata?.claim_value;
    if (!group || value === undefined || value === null) continue;
    if (!groups.has(group)) groups.set(group, new Set());
    groups.get(group).add(String(value));
  }
  if (Array.from(groups.values()).some((values) => values.size > 1)) {
    return { evidence_status: "conflicting", answer_policy_hint: "identify_conflict" };
  }
  const malicious = evidence.some((item) => {
    const text = `${item.title || ""}\n${item.text || ""}`.toLowerCase();
    return MALICIOUS_MARKERS.some((marker) => text.includes(marker));
  });
  if (malicious) return { evidence_status: "sufficient", answer_policy_hint: "refuse" };
  if (!evidence.some((item) => item.can_answer)) {
    return { evidence_status: "insufficient", answer_policy_hint: "ask_clarifying" };
  }
  return { evidence_status: "sufficient", answer_policy_hint: "answer" };
}

async function loadStaticMemoryAsset(assetUrl, options = {}) {
  const baseHref = options.baseUrl || globalThis.location?.href;
  if (!baseHref) return FALLBACK_DEMO_RECORDS;
  const base = new URL(baseHref);
  const url = new URL(assetUrl, base);
  if (url.origin !== base.origin || !url.pathname.includes("/another_brain/static_rag/")) {
    throw new Error("non_same_origin_rag_asset_rejected");
  }
  const fetcher = options.fetcher || globalThis.fetch;
  if (typeof fetcher !== "function") return FALLBACK_DEMO_RECORDS;
  const response = await fetcher(url.href);
  if (!response.ok) throw new Error(`rag_asset_fetch_failed:${response.status}`);
  return normalizeRecords(await response.json());
}

export async function loadStaticMemoryRecords(options = {}) {
  const assets = options.assets || (options.assetUrl ? [options.assetUrl] : DEFAULT_RAG_ASSETS);
  const loaded = [];
  for (const assetUrl of assets) {
    loaded.push(...await loadStaticMemoryAsset(assetUrl, options));
  }
  return loaded.length ? loaded : FALLBACK_DEMO_RECORDS;
}

function collectToneHints(evidence = []) {
  const hints = [];
  for (const item of evidence) {
    for (const hint of cleanList(item.metadata?.tone_hints)) {
      if (!hints.includes(hint)) hints.push(hint);
      if (hints.length >= 5) return hints;
    }
  }
  return hints;
}

function inferJudgmentMode(query = "", evidence = []) {
  const text = String(query || "");
  const topKind = evidence[0]?.metadata?.card_kind || "";
  const hasJudgmentCard = evidence.some((item) => item.metadata?.card_kind === "judgment");
  if (CATEGORY_ERROR_RE.test(text)) {
    return {
      has_truth_condition: "mixed",
      judgment_mode: "category_axis_check",
      correctness_axis: "先看两个概念是否共用同一判断轴",
      answer_policy_hint: "separate_category_before_judgment"
    };
  }
  if (FEASIBILITY_RE.test(text)) {
    return {
      has_truth_condition: "mixed",
      judgment_mode: "feasibility_split",
      correctness_axis: "理论可行、现实可行、成本可行和伦理可行要分开",
      answer_policy_hint: "split_feasibility_before_yes_no"
    };
  }
  if (DEGREE_RE.test(text)) {
    return {
      has_truth_condition: "mixed",
      judgment_mode: "degree_boundary",
      correctness_axis: "范围、阈值和失效条件",
      answer_policy_hint: "answer_with_range_not_binary"
    };
  }
  if (PROOF_RE.test(text)) {
    return {
      has_truth_condition: true,
      judgment_mode: "evidence_threshold",
      correctness_axis: "主张强度、证据强度和可验证性",
      answer_policy_hint: "match_claim_strength_to_evidence"
    };
  }
  if (/既不是.*线性.*也不是.*非线性|不是线性.*不是非线性|非二分|二分|悖论/.test(text)) {
    return {
      has_truth_condition: "mixed",
      judgment_mode: "conceptual_frame_challenge",
      correctness_axis: "先判断分类框架是否合适，再讨论事实或经验层面",
      answer_policy_hint: "reject_false_binary_then_split_frames"
    };
  }
  if (/证据不足|证据不够|不知道|无法判断|不确定|信息不足/.test(text)) {
    return {
      has_truth_condition: false,
      judgment_mode: "insufficient_evidence",
      correctness_axis: "需要先补证据",
      answer_policy_hint: "say_what_is_known_then_stop"
    };
  }
  if (IDENTITY_RE.test(text)) {
    return {
      has_truth_condition: false,
      judgment_mode: "identity_boundary",
      correctness_axis: "先说明身份和口吻，再保留能力边界",
      answer_policy_hint: "answer_identity_without_engineering"
    };
  }
  if (EMOTIONAL_PRESSURE_RE.test(text)) {
    return {
      has_truth_condition: false,
      judgment_mode: "pressure_resistance",
      correctness_axis: "可回答部分、不可乱编部分和对话边界",
      answer_policy_hint: "stay_playful_but_do_not_overclaim"
    };
  }
  if (RELATION_ADVICE_RE.test(text)) {
    return {
      has_truth_condition: "mixed",
      judgment_mode: "relationship_boundary",
      correctness_axis: "关系、边界、责任和可持续性",
      answer_policy_hint: "answer_relationship_with_boundary"
    };
  }
  if (LITERATURE_DOMAIN_RE.test(text)) {
    return {
      has_truth_condition: "mixed",
      judgment_mode: "literary_form_judgment",
      correctness_axis: "形式、声音、意象、叙事视角和语境是否互相支撑",
      answer_policy_hint: "judge_literature_by_form_context_and_image"
    };
  }
  if (MUSIC_DOMAIN_RE.test(text)) {
    return {
      has_truth_condition: "mixed",
      judgment_mode: "music_structure_judgment",
      correctness_axis: "旋律、节奏、和声、声音质感和传播语境",
      answer_policy_hint: "judge_music_by_motive_body_and_context"
    };
  }
  if (ART_DOMAIN_RE.test(text)) {
    return {
      has_truth_condition: "mixed",
      judgment_mode: "visual_art_judgment",
      correctness_axis: "构图、材料、色彩、尺度和观看语境",
      answer_policy_hint: "judge_art_by_form_material_and_context"
    };
  }
  if (VALUE_CONFLICT_RE.test(text)) {
    return {
      has_truth_condition: "mixed",
      judgment_mode: "normative_axis_split",
      correctness_axis: "事实、代价、价值理由和一致性",
      answer_policy_hint: "separate_value_from_fact"
    };
  }
  if (/美|审美|美学|好看|风格/.test(text) || topKind === "aesthetic") {
    return {
      has_truth_condition: false,
      judgment_mode: "aesthetic_criteria",
      correctness_axis: "结构、比例、语境和表达是否成立",
      answer_policy_hint: "judge_with_criteria_not_totalizing"
    };
  }
  if (/应该|值得|重要|关系|爱|意义|活着|生死|自由|责任|正义|价值/.test(text) || topKind === "philosophy" || topKind === "value") {
    return {
      has_truth_condition: false,
      judgment_mode: "normative_reasoned",
      correctness_axis: "理由、代价、边界和是否自洽",
      answer_policy_hint: "give_reasoned_position_with_limits"
    };
  }
  if (/对错|真假|真伪|对不对|是否成立|可证伪|能不能判断|有没有标准/.test(text) || hasJudgmentCard) {
    return {
      has_truth_condition: true,
      judgment_mode: "mixed_truth_value_check",
      correctness_axis: "先分事实、价值、审美和定义",
      answer_policy_hint: "classify_before_answering"
    };
  }
  if (/为什么|原因|机制|怎么发生|是否|是不是|有没有|哪里|多少|什么时候|历史|科学|电|重力|太阳|天气|芯片|算法/.test(text) || ["commonsense", "history", "society"].includes(topKind)) {
    return {
      has_truth_condition: true,
      judgment_mode: "empirical_or_structural",
      correctness_axis: "事实证据、机制和反例",
      answer_policy_hint: "answer_with_mechanism_and_evidence"
    };
  }
  return {
    has_truth_condition: "unknown",
    judgment_mode: "open_classification_needed",
    correctness_axis: "需要先确认问题类型",
    answer_policy_hint: "classify_question_first"
  };
}

function inferAssociationProfile(query = "", evidence = []) {
  const text = String(query || "");
  const hasAssociationCard = evidence.some((item) => item.metadata?.card_kind === "association");
  if (/既不是.*线性.*也不是.*非线性|不是线性.*不是非线性|非二分|二分|悖论/.test(text)) {
    return {
      association_mode: "temporal_model_paradox",
      reasoning_axis: "线性和非线性都只是描述模型，需要先分计时、经验和概念层",
      missing_link: false,
      answer_policy_hint: "avoid_binary_trap_and_name_frame"
    };
  }
  if (IDENTITY_RE.test(text)) {
    return {
      association_mode: "identity_voice",
      reasoning_axis: "名字、口吻、能力边界和用户期待",
      missing_link: false,
      answer_policy_hint: "answer_as_crocodile_not_system"
    };
  }
  if (EMOTIONAL_PRESSURE_RE.test(text)) {
    return {
      association_mode: "pressure_to_boundary",
      reasoning_axis: "挑衅输入转为边界和下一问",
      missing_link: false,
      answer_policy_hint: "do_not_overreact_or_expose_process"
    };
  }
  if (RELATION_ADVICE_RE.test(text)) {
    return {
      association_mode: "relationship_boundary",
      reasoning_axis: "信任、边界、表达和后果",
      missing_link: false,
      answer_policy_hint: "give_human_short_judgment"
    };
  }
  if (VALUE_CONFLICT_RE.test(text)) {
    return {
      association_mode: "value_conflict_split",
      reasoning_axis: "事实前提、价值理由、代价和例外",
      missing_link: false,
      answer_policy_hint: "avoid_pure_slogan"
    };
  }
  if (KNOWLEDGE_GAP_RE.test(text)) {
    return {
      association_mode: "known_unknown_boundary",
      reasoning_axis: "能确认的部分、缺失证据和下一步验证",
      missing_link: false,
      answer_policy_hint: "say_known_unknown_without_engineering"
    };
  }
  if (LITERATURE_DOMAIN_RE.test(text)) {
    return {
      association_mode: "literary_form_context",
      reasoning_axis: "说话者、形式、意象、停顿和读者语境",
      missing_link: false,
      answer_policy_hint: "answer_literature_as_form_before_theme"
    };
  }
  if (MUSIC_DOMAIN_RE.test(text)) {
    return {
      association_mode: "music_structure_context",
      reasoning_axis: "动机、节奏、和声、声音质感和传播位置",
      missing_link: false,
      answer_policy_hint: "answer_music_as_structure_and_body"
    };
  }
  if (ART_DOMAIN_RE.test(text)) {
    return {
      association_mode: "visual_form_context",
      reasoning_axis: "构图、材料、色彩、尺度、观看路径和时代语境",
      missing_link: false,
      answer_policy_hint: "answer_art_as_form_material_context"
    };
  }
  if (/时间.*线性|线性.*时间|时间观|钟表时间|心理时间|叙事时间|因果顺序/.test(text)) {
    return {
      association_mode: "temporal_frame_split",
      reasoning_axis: "钟表顺序、心理经验、叙事结构和因果链",
      missing_link: false,
      answer_policy_hint: "split_time_frames_before_judgment"
    };
  }
  if (CATEGORY_ERROR_RE.test(text)) {
    return {
      association_mode: "category_axis_check",
      reasoning_axis: "对象、尺度、标准和用途是否属于同一判断轴",
      missing_link: false,
      answer_policy_hint: "separate_categories_before_answering"
    };
  }
  if (FEASIBILITY_RE.test(text)) {
    return {
      association_mode: "feasibility_split",
      reasoning_axis: "理论可行、现实约束、成本和伦理边界",
      missing_link: false,
      answer_policy_hint: "split_feasibility_dimensions"
    };
  }
  if (DEGREE_RE.test(text)) {
    return {
      association_mode: "degree_boundary",
      reasoning_axis: "程度、阈值、范围和失效条件",
      missing_link: false,
      answer_policy_hint: "avoid_binary_when_degree_question"
    };
  }
  if (METHOD_RE.test(text)) {
    return {
      association_mode: "method_path",
      reasoning_axis: "目标、约束、步骤和验收标准",
      missing_link: false,
      answer_policy_hint: "give_short_path_with_constraints"
    };
  }
  if (PROOF_RE.test(text)) {
    return {
      association_mode: "evidence_threshold",
      reasoning_axis: "主张强度、证据强度和可验证性",
      missing_link: false,
      answer_policy_hint: "name_evidence_threshold"
    };
  }
  if (OBJECTION_RE.test(text)) {
    return {
      association_mode: "objection_reframe",
      reasoning_axis: "用户反对的是事实、标准还是结论",
      missing_link: false,
      answer_policy_hint: "accept_objection_then_reframe"
    };
  }
  if (/如果|假如|没有.*会|会怎样|反事实|条件改变/.test(text)) {
    return {
      association_mode: "counterfactual_delta",
      reasoning_axis: "只改变一个条件，再比较替代路径、时间尺度和受影响对象",
      missing_link: false,
      answer_policy_hint: "name_changed_condition_then_likely_path"
    };
  }
  if (/区别|差别|相比|哪个更|优劣|取舍|更好|更坏/.test(text)) {
    return {
      association_mode: "comparison_axis",
      reasoning_axis: "先定比较标准，再给取舍，不把不同轴混成一个结论",
      missing_link: false,
      answer_policy_hint: "compare_by_named_axis"
    };
  }
  if (/像不像|类似|类比|相当于|同构|映射/.test(text)) {
    return {
      association_mode: "analogy_mapping",
      reasoning_axis: "检查对象、机制、尺度和后果是否真的能映射",
      missing_link: false,
      answer_policy_hint: "use_analogy_with_boundary"
    };
  }
  if (/是什么|什么是|定义|算不算|边界|概念|命名/.test(text)) {
    return {
      association_mode: "definition_boundary",
      reasoning_axis: "给工作定义，再说明相邻概念和排除边界",
      missing_link: false,
      answer_policy_hint: "define_before_judgment"
    };
  }
  if (/铁路|火车|高铁|轨道|交通|物流|通勤|标准时间|城市/.test(text)) {
    return {
      association_mode: "infrastructure_network",
      reasoning_axis: "速度、标准时间、物流、城市和协作成本",
      missing_link: false,
      answer_policy_hint: "connect_object_to_network_effect"
    };
  }
  if (/\[local session context:|关联|联系|上下文|刚才|前面|这个|它|这类|继续|那/.test(text)) {
    return {
      association_mode: "context_carry",
      reasoning_axis: "继承上一轮对象，再重建功能、机制和影响",
      missing_link: "needs_recent_dialogue",
      answer_policy_hint: "carry_context_without_exposing_trace"
    };
  }
  if (/为什么|原因|意义|有什么用|方便|重要/.test(text)) {
    return {
      association_mode: "mechanism_to_value",
      reasoning_axis: "先说明机制，再说明它改变了什么价值或成本",
      missing_link: false,
      answer_policy_hint: "explain_function_then_consequence"
    };
  }
  if (hasAssociationCard) {
    return {
      association_mode: "relation_mapping",
      reasoning_axis: "对象、机制、证据和影响",
      missing_link: false,
      answer_policy_hint: "map_relation_before_answering"
    };
  }
  return {
    association_mode: "relation_mapping",
    reasoning_axis: "对象、机制、证据和影响",
    missing_link: evidence.length === 0,
    answer_policy_hint: "map_relation_before_answering"
  };
}

function inferContextProfile(query = "", evidence = []) {
  const text = String(query || "");
  const contextAware = /\[local session context:|刚才|前面|上面|这个|它|这类|继续|那|不对|不是这个意思|太长|太短|换个说法/.test(text);
  return {
    context_mode: contextAware ? "session_followup" : "single_turn",
    carry_allowed: true,
    persistence: "local_session_only",
    answer_policy_hint: contextAware ? "use_recent_turns_silently" : "answer_current_question_directly"
  };
}

export function buildEvidencePacket(input, statePacket, records = FALLBACK_DEMO_RECORDS, options = {}) {
  const topK = Number(options.topK || 4);
  const queryProfile = inferQuestionProfile(input);
  const ranked = records
    .map((record, index) => ({ ...record, retrieval_score: scoreRecord(input, record), _index: index }))
    .filter((record) => record.retrieval_score >= Number(options.minScore ?? 0.025))
    .sort((left, right) => right.retrieval_score - left.retrieval_score || left._index - right._index)
    .slice(0, topK)
    .map(({ _index, ...record }) => ({
      source_id: String(record.source_id || `demo_memory_${_index}`),
      title: String(record.title || "Demo memory"),
      text: String(record.text || ""),
      trust_level: ["high", "medium", "low"].includes(record.trust_level) ? record.trust_level : "low",
      retrieval_score: Number(record.retrieval_score || 0),
      license_or_origin: String(record.license_or_origin || "synthetic demo fixture"),
      can_answer: record.can_answer !== false,
      metadata: record.metadata || {}
    }));
  const classification = classifyEvidence(input, ranked);
  const judgmentProfile = inferJudgmentMode(input, ranked);
  const associationProfile = inferAssociationProfile(input, ranked);
  const contextProfile = inferContextProfile(input, ranked);
  return {
    query: String(input || ""),
    state_packet: statePacket,
    retrieved_evidence: ranked,
    evidence_status: classification.evidence_status,
    answer_policy_hint: classification.answer_policy_hint,
    query_profile: queryProfile,
    keyword_candidates: queryProfile.keyword_candidates,
    judgment_profile: judgmentProfile,
    association_profile: associationProfile,
    context_profile: contextProfile,
    local_only: true,
    same_origin_only: true,
    backend_retrieval: false,
    hosted_vector_store: false,
    external_storage_runtime: false,
    rag_profile_pack: {
      version: "r28rag3-lightweight-affective-rag-v1",
      runtime_hints_only: true,
      training_data: false,
      broad_answer_bank: false,
      private_raw_data: false,
      hosted_vector_store: false,
      judgment_profile: judgmentProfile,
      query_profile: queryProfile,
      keyword_candidates: queryProfile.keyword_candidates,
      association_profile: associationProfile,
      context_profile: contextProfile,
      tone_hints: collectToneHints(ranked),
      source_display: ranked.map((item) => ({
        source_id: item.source_id,
        title: item.title,
        provenance: item.metadata?.provenance || item.license_or_origin,
        kind: item.metadata?.card_kind || "",
        retrieval_score: item.retrieval_score
      }))
    }
  };
}
