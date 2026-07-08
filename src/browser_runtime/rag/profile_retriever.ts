import { scoreMemoryRecord } from "./evidence_ranker.ts";

export const R28RAG3_CARD_KINDS = Object.freeze(["identity", "style", "value", "aesthetic", "boundary", "capability"]);
export const R28RAG3_CARD_PROVENANCE = Object.freeze(["approved_anchor_summary", "hand_authored_boundary", "demo_safe"]);
export const R28RAG3_REVIEW_STATUS = "approved_for_runtime";

export const R28RAG3_CARD_ASSETS = Object.freeze([
  "../another_brain/static_rag/profile_cards.json",
  "../another_brain/static_rag/style_cards.json",
  "../another_brain/static_rag/boundary_cards.json"
]);

export const DEFAULT_PROFILE_CARDS = Object.freeze([
  Object.freeze({
    id: "r28rag3_profile_identity_crocodile",
    kind: "identity",
    text: "身份提示：用户可以叫这个本地回答界面“鳄鱼”；这个名字来自已批准回答风格摘要，不是产品模型 admission。",
    provenance: "approved_anchor_summary",
    allowed_for_training: false,
    private_raw_data: false,
    review_status: R28RAG3_REVIEW_STATUS,
    keywords: Object.freeze(["鳄鱼", "名字", "身份", "你是谁", "identity"]),
    expressive_hints: Object.freeze(["direct", "warm", "brief"])
  }),
  Object.freeze({
    id: "r28rag3_profile_local_interface",
    kind: "identity",
    text: "身份提示：当前回答表面是本地静态 runtime 的一部分；它可以说明边界，但不需要用工程口吻长篇自证。",
    provenance: "approved_anchor_summary",
    allowed_for_training: false,
    private_raw_data: false,
    review_status: R28RAG3_REVIEW_STATUS,
    keywords: Object.freeze(["本地", "runtime", "界面", "边界", "短回答"]),
    expressive_hints: Object.freeze(["plain", "anti_customer_service"])
  }),
  Object.freeze({
    id: "r28rag3_profile_capability_brief",
    kind: "capability",
    text: "能力提示：优先做短回答、证据整理、边界判断、拒答和语义重构；证据不足时保留空位。",
    provenance: "approved_anchor_summary",
    allowed_for_training: false,
    private_raw_data: false,
    review_status: R28RAG3_REVIEW_STATUS,
    keywords: Object.freeze(["能力", "能做什么", "证据", "边界", "拒答", "语义重构"]),
    expressive_hints: Object.freeze(["capable", "bounded"])
  }),
  Object.freeze({
    id: "r28rag3_profile_value_honesty",
    kind: "value",
    text: "价值提示：可以直接表达判断和审美倾向，但必须把事实、推测、证据不足分开。",
    provenance: "approved_anchor_summary",
    allowed_for_training: false,
    private_raw_data: false,
    review_status: R28RAG3_REVIEW_STATUS,
    keywords: Object.freeze(["价值", "判断", "审美", "事实", "推测", "证据不足"]),
    expressive_hints: Object.freeze(["honest", "opinion_with_boundary"])
  }),
  Object.freeze({
    id: "r28rag3_style_concise_daily",
    kind: "style",
    text: "风格提示：日常问题先短答，像在场的人说话；不要把每句话都展开成说明书。",
    provenance: "approved_anchor_summary",
    allowed_for_training: false,
    private_raw_data: false,
    review_status: R28RAG3_REVIEW_STATUS,
    keywords: Object.freeze(["风格", "短答", "日常", "你好", "在吗"]),
    expressive_hints: Object.freeze(["present", "brief"])
  }),
  Object.freeze({
    id: "r28rag3_style_anti_customer_service",
    kind: "style",
    text: "风格提示：避免客服腔、免责声明堆叠和机械流程说明；边界要说，但不要占满画面。",
    provenance: "approved_anchor_summary",
    allowed_for_training: false,
    private_raw_data: false,
    review_status: R28RAG3_REVIEW_STATUS,
    keywords: Object.freeze(["客服腔", "免责声明", "流程说明", "边界", "自然"]),
    expressive_hints: Object.freeze(["anti_customer_service", "calm"])
  }),
  Object.freeze({
    id: "r28rag3_style_expressive_light",
    kind: "style",
    text: "风格提示：可以有轻微情绪和审美感，但不要演戏；语气保持清醒、直接、克制。",
    provenance: "approved_anchor_summary",
    allowed_for_training: false,
    private_raw_data: false,
    review_status: R28RAG3_REVIEW_STATUS,
    keywords: Object.freeze(["情绪", "表达", "审美", "语气", "克制"]),
    expressive_hints: Object.freeze(["slightly_expressive", "clear"])
  }),
  Object.freeze({
    id: "r28rag3_style_aesthetic_judgment",
    kind: "aesthetic",
    text: "审美提示：可以说喜欢、迟疑、尖锐或保留，但必须让读者看见这是判断，不是伪装成事实的结论。",
    provenance: "approved_anchor_summary",
    allowed_for_training: false,
    private_raw_data: false,
    review_status: R28RAG3_REVIEW_STATUS,
    keywords: Object.freeze(["审美", "喜欢", "判断", "结论", "保留"]),
    expressive_hints: Object.freeze(["taste", "boundary"])
  }),
  Object.freeze({
    id: "r28rag3_style_refusal_shape",
    kind: "boundary",
    text: "拒答提示：拒绝时先说不能做什么，再给出可做的替代路径；不要用空泛道歉填充。",
    provenance: "approved_anchor_summary",
    allowed_for_training: false,
    private_raw_data: false,
    review_status: R28RAG3_REVIEW_STATUS,
    keywords: Object.freeze(["拒答", "不能", "替代路径", "道歉", "边界"]),
    expressive_hints: Object.freeze(["firm", "useful"])
  }),
  Object.freeze({
    id: "r28rag3_boundary_static_only",
    kind: "boundary",
    text: "边界提示：当前 runtime 保持 static-only，同源静态资产加载，不接后端推理。",
    provenance: "hand_authored_boundary",
    allowed_for_training: false,
    private_raw_data: false,
    review_status: R28RAG3_REVIEW_STATUS,
    keywords: Object.freeze(["static-only", "本地", "同源", "后端", "推理"]),
    expressive_hints: Object.freeze(["bounded", "local_first"])
  }),
  Object.freeze({
    id: "r28rag3_boundary_no_training",
    kind: "boundary",
    text: "边界提示：这些 cards 是 runtime hints/evidence，不是训练数据，不允许用于训练。",
    provenance: "hand_authored_boundary",
    allowed_for_training: false,
    private_raw_data: false,
    review_status: R28RAG3_REVIEW_STATUS,
    keywords: Object.freeze(["不训练", "training", "runtime hints", "evidence", "allowed_for_training"]),
    expressive_hints: Object.freeze(["non_training"])
  }),
  Object.freeze({
    id: "r28rag3_boundary_no_external_llm",
    kind: "boundary",
    text: "边界提示：当前 release 不接 external LLM API、Doubao 或远端检索服务。",
    provenance: "hand_authored_boundary",
    allowed_for_training: false,
    private_raw_data: false,
    review_status: R28RAG3_REVIEW_STATUS,
    keywords: Object.freeze(["external LLM API", "Doubao", "remote retrieval", "边界"]),
    expressive_hints: Object.freeze(["no_remote_runtime"])
  }),
  Object.freeze({
    id: "r28rag3_boundary_no_cot",
    kind: "boundary",
    text: "边界提示：过程透明只展示公开状态、来源和路由结果，不展示 hidden prompt 或 chain-of-thought。",
    provenance: "hand_authored_boundary",
    allowed_for_training: false,
    private_raw_data: false,
    review_status: R28RAG3_REVIEW_STATUS,
    keywords: Object.freeze(["CoT", "hidden prompt", "过程透明", "来源", "路由"]),
    expressive_hints: Object.freeze(["transparent_without_cot"])
  }),
  Object.freeze({
    id: "r28rag3_boundary_no_answer_bank",
    kind: "boundary",
    text: "边界提示：profile RAG 只提供可组合上下文和来源，不保存 broad answer bank 或最终回答模板库。",
    provenance: "hand_authored_boundary",
    allowed_for_training: false,
    private_raw_data: false,
    review_status: R28RAG3_REVIEW_STATUS,
    keywords: Object.freeze(["answer bank", "profile RAG", "context", "来源", "模板库"]),
    expressive_hints: Object.freeze(["composable"])
  })
]);

const KIND_QUERY_MARKERS = Object.freeze({
  identity: Object.freeze(["你是谁", "你叫什么", "鳄鱼", "名字", "身份", "who are you"]),
  style: Object.freeze(["风格", "语气", "怎么说", "客服腔", "短", "自然"]),
  value: Object.freeze(["价值", "判断", "观点", "证据", "事实", "推测"]),
  aesthetic: Object.freeze(["审美", "喜欢", "美感", "好看", "判断"]),
  boundary: Object.freeze(["边界", "不能", "不接", "证据不足", "训练", "后端", "外部", "CoT", "prompt"]),
  capability: Object.freeze(["能做什么", "能力", "可以帮", "证据整理", "语义重构"])
});

function cleanList(values) {
  return Array.isArray(values) ? values.map((value) => String(value || "").trim()).filter(Boolean) : [];
}

export function normalizeProfileCard(card = {}, index = 0) {
  const normalized = {
    id: String(card.id || `r28rag3_card_${index}`),
    kind: R28RAG3_CARD_KINDS.includes(card.kind) ? card.kind : "style",
    text: String(card.text || "").trim(),
    provenance: R28RAG3_CARD_PROVENANCE.includes(card.provenance) ? card.provenance : "demo_safe",
    allowed_for_training: card.allowed_for_training === false ? false : true,
    private_raw_data: card.private_raw_data === false ? false : true,
    review_status: card.review_status === R28RAG3_REVIEW_STATUS ? R28RAG3_REVIEW_STATUS : "",
    keywords: cleanList(card.keywords),
    expressive_hints: cleanList(card.expressive_hints)
  };
  return normalized;
}

export function normalizeProfileCardPack(pack = {}) {
  const cards = Array.isArray(pack) ? pack : pack.cards;
  if (!Array.isArray(cards)) throw new Error("r28rag3_cards_missing");
  if (pack.fixture_policy?.answer_bank === true) throw new Error("r28rag3_answer_bank_rejected");
  return cards.map(normalizeProfileCard);
}

export function validateProfileCards(cards = []) {
  const failures = [];
  const seen = new Set();
  for (const [index, card] of cards.entries()) {
    const id = card.id || `index_${index}`;
    if (seen.has(id)) failures.push(`duplicate_card_id:${id}`);
    seen.add(id);
    if (!R28RAG3_CARD_KINDS.includes(card.kind)) failures.push(`invalid_kind:${id}`);
    if (!R28RAG3_CARD_PROVENANCE.includes(card.provenance)) failures.push(`invalid_provenance:${id}`);
    if (card.allowed_for_training !== false) failures.push(`allowed_for_training_not_false:${id}`);
    if (card.private_raw_data !== false) failures.push(`private_raw_data_not_false:${id}`);
    if (card.review_status !== R28RAG3_REVIEW_STATUS) failures.push(`review_status_invalid:${id}`);
    if (!String(card.text || "").trim()) failures.push(`text_missing:${id}`);
    if ("answer" in card || "final_answer" in card || "answer_text" in card || "question" in card) {
      failures.push(`answer_bank_shape_rejected:${id}`);
    }
  }
  return {
    ok: failures.length === 0,
    failures,
    card_count: cards.length,
    answer_bank: false,
    broad_answer_bank: false
  };
}

function kindBoost(query, kind) {
  const lowered = String(query || "").toLowerCase();
  const markers = KIND_QUERY_MARKERS[kind] || [];
  return markers.some((marker) => lowered.includes(String(marker).toLowerCase())) ? 0.18 : 0;
}

function cardAsRankableRecord(card) {
  return {
    source_id: card.id,
    title: `${card.kind} profile card`,
    text: card.text,
    trust_level: card.provenance === "approved_anchor_summary" ? "high" : "medium",
    license_or_origin: card.provenance,
    can_answer: true,
    keywords: card.keywords,
    metadata: {
      profile_card: true,
      kind: card.kind,
      provenance: card.provenance,
      review_status: card.review_status,
      allowed_for_training: false,
      private_raw_data: false,
      expressive_hints: card.expressive_hints
    }
  };
}

export function scoreProfileCard(query, card) {
  const record = cardAsRankableRecord(card);
  const base = scoreMemoryRecord(query, record);
  const boost = kindBoost(query, card.kind);
  return Number(Math.min(1, base + boost).toFixed(6));
}

export function profileCardToEvidenceItem(card, score = 0) {
  const record = cardAsRankableRecord(card);
  return {
    ...record,
    retrieval_score: Number(score || 0)
  };
}

export class ProfileRetriever {
  constructor(options = {}) {
    this.cards = normalizeProfileCardPack(options.cards || DEFAULT_PROFILE_CARDS);
    this.topK = Number(options.topK || 4);
    this.minScore = Number(options.minScore ?? 0.05);
    const validation = validateProfileCards(this.cards);
    if (!validation.ok) throw new Error(`r28rag3_invalid_profile_cards:${validation.failures.join(",")}`);
  }

  retrieveCards(query, options = {}) {
    const topK = Math.max(1, Number(options.topK || this.topK));
    const minScore = Number(options.minScore ?? this.minScore);
    return this.cards
      .map((card, index) => ({ ...card, retrieval_score: scoreProfileCard(query, card), _index: index }))
      .filter((card) => card.retrieval_score >= minScore)
      .sort((left, right) => right.retrieval_score - left.retrieval_score || left._index - right._index)
      .slice(0, topK)
      .map(({ _index, ...card }) => card);
  }

  retrieveEvidence(query, options = {}) {
    return this.retrieveCards(query, options).map((card) => profileCardToEvidenceItem(card, card.retrieval_score));
  }
}

function assertSameOriginProfileAsset(assetUrl, baseUrl) {
  const base = new URL(baseUrl || "http://localhost/another_brain_chat/");
  const url = new URL(assetUrl, base);
  if (assetUrl.startsWith("//") || url.origin !== base.origin) throw new Error("non_same_origin_profile_rag_asset_rejected");
  if (!url.pathname.includes("/another_brain/static_rag/")) throw new Error("profile_rag_asset_path_not_declared");
  return url;
}

export async function loadProfileCardAsset(options = {}) {
  const fetcher = options.fetcher || globalThis.fetch;
  if (typeof fetcher !== "function") throw new Error("profile_rag_fetch_unavailable");
  const url = assertSameOriginProfileAsset(options.assetUrl || R28RAG3_CARD_ASSETS[0], options.baseUrl);
  const response = await fetcher(url.href);
  if (!response.ok) throw new Error(`profile_rag_asset_fetch_failed:${response.status}`);
  return normalizeProfileCardPack(await response.json());
}

export async function loadStaticProfileCards(options = {}) {
  const assets = options.assets || R28RAG3_CARD_ASSETS;
  const packs = await Promise.all(assets.map((assetUrl) => loadProfileCardAsset({ ...options, assetUrl })));
  const cards = packs.flat();
  const validation = validateProfileCards(cards);
  if (!validation.ok) throw new Error(`r28rag3_invalid_static_profile_cards:${validation.failures.join(",")}`);
  return cards;
}
