const DEMO_MEMORY_ASSET = "../another_brain/static_rag/demo_memory.json";
const PROFILE_CARD_ASSETS = Object.freeze([
  "../another_brain/static_rag/brand_cards.json",
  "../another_brain/static_rag/brand_literacy_cards.json",
  "../another_brain/static_rag/world_cards.json",
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
  { match: /关联|联系|关系|上下文|刚才|前面|上面|这个|它|这类|继续|为什么.*方便|有什么用|意义/i, terms: ["上下文", "关联", "对象", "机制", "功能", "影响", "代价", "判断链"] },
  { match: /算法|推荐|信息茧房|平台/i, terms: ["算法", "推荐系统", "激励", "分发", "注意力"] },
  { match: /排版|字体|杂志|bodoni|封面|视觉/i, terms: ["排版", "字体", "杂志", "层级", "留白", "对比"] }
]);

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
  if (!hasLexicalOverlap && kindBoost <= 0) return 0;
  const trustBoost = hasLexicalOverlap ? (record.trust_level === "high" ? 0.08 : record.trust_level === "medium" ? 0.04 : 0) : 0;
  const profileBoost = hasLexicalOverlap && record.metadata?.r28rag3_profile_card ? 0.025 : 0;
  return Number((keywordScore * 0.72 + gramScore * 0.2 + trustBoost + profileBoost + kindBoost).toFixed(6));
}

function profileKindBoost(query = "", record = {}) {
  const text = String(query || "").toLowerCase();
  const kind = record.metadata?.card_kind || "";
  if (kind === "brand" && /efish|efishother|鳄鱼|域名|domain|品牌|another[_ ]?brain|你是谁|旧昵称/.test(text)) return 0.12;
  if (kind === "brand_literacy" && /apple|苹果|google|谷歌|microsoft|微软|tesla|特斯拉|nike|耐克|coca|可口可乐|mcdonald|麦当劳|starbucks|星巴克|huawei|华为|byd|比亚迪|openai|vercel|meta|facebook|instagram|amazon|亚马逊|toyota|丰田|leica|徕卡|品牌|公司|商业|产品|平台/.test(text)) return 0.13;
  if (kind === "history" && /工业革命|法国大革命|美国独立|一战|二战|世界大战|冷战|辛亥|五四|大萧条|改革开放|互联网|金融危机|疫情|covid|transformer|文艺复兴|启蒙|印刷术|古登堡|太空竞赛|全球化|历史|革命|战争|危机|modern|war|revolution|renaissance|enlightenment|globalization/.test(text)) return 0.13;
  if (kind === "society" && /通胀|物价|房价|住房|平台|隐私|气候|教育|医疗|劳动|工资|迁移|移民|信任|社会|经济|政策|现实|工作|数据|算法/.test(text)) return 0.12;
  if (kind === "aesthetic" && /审美|好看|风格|aesthetic|taste|style/.test(text)) return 0.09;
  if (kind === "commonsense" && /太阳|日出|日落|东升西落|天气|气温|升温|降温|自然|常识|天空|蓝天|月亮|季节|时间|下雨|雨|沸腾|烧开|声音|振动|真空|why|原因/.test(text)) return 0.1;
  if (kind === "philosophy" && /生死|生与死|活着|存在|虚无|意义|哲学|自由|有限|死亡|孤独|记忆|正义|责任|真理|真实|事实/.test(text)) return 0.1;
  if (kind === "logic" && /为什么|如何看待|怎么看|判断|因果|证据|推理|逻辑|because|reason/.test(text)) return 0.09;
  if (kind === "judgment" && /对错|真假|真伪|对不对|有没有标准|能不能判断|是否成立|可证伪|事实|价值|审美|证据|判断|标准/.test(text)) return 0.14;
  if (kind === "association" && /关联|联系|为什么|意义|方便|机制|影响|连接|因果|铁路|交通|物流|时间|线性/.test(text)) return 0.16;
  if (kind === "context" && /刚才|上面|前面|这个|它|这类|继续|上下文|为什么方便|有什么用|那/.test(text)) return 0.16;
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
  if (/证据不足|证据不够|不知道|无法判断|不确定|信息不足/.test(text)) {
    return {
      has_truth_condition: false,
      judgment_mode: "insufficient_evidence",
      correctness_axis: "需要先补证据",
      answer_policy_hint: "say_what_is_known_then_stop"
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
  if (/时间.*线性|线性.*时间|时间观|钟表时间|心理时间|叙事时间|因果顺序/.test(text)) {
    return {
      association_mode: "temporal_frame_split",
      reasoning_axis: "钟表顺序、心理经验、叙事结构和因果链",
      missing_link: false,
      answer_policy_hint: "split_time_frames_before_judgment"
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
  const contextAware = /\[local session context:|刚才|前面|上面|这个|它|这类|继续|那/.test(text);
  return {
    context_mode: contextAware ? "session_followup" : "single_turn",
    carry_allowed: true,
    persistence: "local_session_only",
    answer_policy_hint: contextAware ? "use_recent_turns_silently" : "answer_current_question_directly"
  };
}

export function buildEvidencePacket(input, statePacket, records = FALLBACK_DEMO_RECORDS, options = {}) {
  const topK = Number(options.topK || 4);
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
