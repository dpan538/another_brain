const DEMO_MEMORY_ASSET = "../another_brain/static_rag/demo_memory.json";
const PROFILE_CARD_ASSETS = Object.freeze([
  "../another_brain/static_rag/profile_cards.json",
  "../another_brain/static_rag/style_cards.json",
  "../another_brain/static_rag/boundary_cards.json"
]);
const PROFILE_CARD_KINDS = Object.freeze(["identity", "style", "value", "aesthetic", "boundary", "capability"]);
const PROFILE_CARD_PROVENANCE = Object.freeze(["approved_anchor_summary", "hand_authored_boundary", "demo_safe"]);

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

function tokenize(text) {
  return String(text || "").toLowerCase().match(/[a-z0-9_]+|[\u4e00-\u9fff]/g) || [];
}

function charNgrams(text, size = 3) {
  const clean = String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
  const grams = new Set();
  for (let index = 0; index <= clean.length - size; index += 1) grams.add(clean.slice(index, index + size));
  return grams;
}

function scoreRecord(query, record) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return 0;
  const haystack = `${record.title || ""} ${record.text || ""} ${(record.keywords || []).join(" ")}`;
  const documentTokens = new Set(tokenize(haystack));
  let overlap = 0;
  for (const token of new Set(queryTokens)) {
    if (documentTokens.has(token)) overlap += 1;
  }
  const qgrams = charNgrams(query);
  const dgrams = charNgrams(haystack);
  let gramOverlap = 0;
  for (const gram of qgrams) {
    if (dgrams.has(gram)) gramOverlap += 1;
  }
  const keywordScore = overlap / Math.max(queryTokens.length, 1);
  const gramScore = qgrams.size ? gramOverlap / qgrams.size : 0;
  const trustBoost = record.trust_level === "high" ? 0.08 : record.trust_level === "medium" ? 0.04 : 0;
  const kind = record.metadata?.kind || "";
  const kindBoost = (
    (kind === "identity" && /你是谁|你叫什么|鳄鱼|identity|who are you/i.test(String(query || ""))) ||
    (kind === "style" && /风格|语气|客服腔|短答|自然/i.test(String(query || ""))) ||
    (kind === "boundary" && /边界|证据不足|不接|训练|后端|prompt|cot/i.test(String(query || ""))) ||
    (kind === "capability" && /能做什么|能力|可以帮|语义重构/i.test(String(query || ""))) ||
    (kind === "aesthetic" && /审美|喜欢|美感|判断/i.test(String(query || ""))) ||
    (kind === "value" && /价值|观点|事实|推测/i.test(String(query || "")))
  ) ? 0.18 : 0;
  return Number(Math.min(1, keywordScore * 0.72 + gramScore * 0.2 + trustBoost + kindBoost).toFixed(6));
}

function cleanList(values) {
  return Array.isArray(values) ? values.map((value) => String(value || "").trim()).filter(Boolean) : [];
}

function normalizeCard(card, index = 0) {
  return {
    id: String(card.id || `r28rag3_card_${index}`),
    kind: PROFILE_CARD_KINDS.includes(card.kind) ? card.kind : "style",
    text: String(card.text || "").trim(),
    provenance: PROFILE_CARD_PROVENANCE.includes(card.provenance) ? card.provenance : "demo_safe",
    allowed_for_training: card.allowed_for_training === false ? false : true,
    private_raw_data: card.private_raw_data === false ? false : true,
    review_status: card.review_status === "approved_for_runtime" ? "approved_for_runtime" : "",
    keywords: cleanList(card.keywords),
    expressive_hints: cleanList(card.expressive_hints)
  };
}

function cardToRecord(card, index = 0) {
  const normalized = normalizeCard(card, index);
  if (!normalized.text || normalized.allowed_for_training !== false || normalized.private_raw_data !== false || normalized.review_status !== "approved_for_runtime") {
    return null;
  }
  return {
    source_id: normalized.id,
    title: `${normalized.kind} profile card`,
    text: normalized.text,
    trust_level: normalized.provenance === "approved_anchor_summary" ? "high" : "medium",
    license_or_origin: normalized.provenance,
    can_answer: true,
    keywords: normalized.keywords,
    metadata: {
      profile_card: true,
      kind: normalized.kind,
      provenance: normalized.provenance,
      review_status: normalized.review_status,
      allowed_for_training: false,
      private_raw_data: false,
      expressive_hints: normalized.expressive_hints
    }
  };
}

function normalizeRecords(fixture) {
  if (Array.isArray(fixture?.cards) || (Array.isArray(fixture) && fixture.some((item) => "provenance" in item && "review_status" in item))) {
    if (fixture?.fixture_policy?.answer_bank === true) return [];
    const cards = Array.isArray(fixture) ? fixture : fixture.cards;
    return cards.map(cardToRecord).filter(Boolean);
  }
  const records = Array.isArray(fixture) ? fixture : fixture?.records;
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

export async function loadStaticMemoryRecords(options = {}) {
  const baseHref = options.baseUrl || globalThis.location?.href;
  if (!baseHref) return FALLBACK_DEMO_RECORDS;
  const base = new URL(baseHref);
  const fetcher = options.fetcher || globalThis.fetch;
  if (typeof fetcher !== "function") return FALLBACK_DEMO_RECORDS;
  const assets = options.assetUrl ? [options.assetUrl] : [DEMO_MEMORY_ASSET, ...PROFILE_CARD_ASSETS];
  const loaded = await Promise.allSettled(assets.map(async (assetUrl) => {
    const url = new URL(assetUrl, base);
    if (assetUrl.startsWith("//") || url.origin !== base.origin || !url.pathname.includes("/another_brain/static_rag/")) {
      throw new Error("non_same_origin_rag_asset_rejected");
    }
    const response = await fetcher(url.href);
    if (!response.ok) throw new Error(`rag_asset_fetch_failed:${response.status}`);
    return normalizeRecords(await response.json());
  }));
  const records = loaded.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  return records.length ? records : FALLBACK_DEMO_RECORDS;
}

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean).map(String)));
}

function buildExpressiveContextPack(input, evidence) {
  const profileEvidence = (evidence || []).filter((item) => item.metadata?.profile_card === true);
  const expressiveHints = unique(profileEvidence.flatMap((item) => item.metadata?.expressive_hints || [])).slice(0, 8);
  return {
    schema_version: "r28rag3.expressive_context_pack.v1",
    query: String(input || ""),
    runtime_hints_only: true,
    evidence_is_instruction: false,
    answer_bank: false,
    broad_answer_bank: false,
    hidden_prompt: false,
    cot: false,
    local_only: true,
    backend_retrieval: false,
    external_llm_api: false,
    hosted_vector_store: false,
    cards_used: profileEvidence.map((item) => item.source_id),
    kinds: unique(profileEvidence.map((item) => item.metadata?.kind)),
    provenances: unique(profileEvidence.map((item) => item.metadata?.provenance || item.license_or_origin)),
    expressive_hints: expressiveHints,
    chat_mode_hint: expressiveHints.slice(0, 3).join(", "),
    dashboard_sources: profileEvidence.slice(0, 4).map((item) => ({
      source_id: item.source_id,
      title: item.title,
      kind: item.metadata?.kind || "",
      provenance: item.metadata?.provenance || item.license_or_origin || "",
      review_status: item.metadata?.review_status || "",
      retrieval_score: Number(item.retrieval_score || 0)
    }))
  };
}

export function buildEvidencePacket(input, statePacket, records = FALLBACK_DEMO_RECORDS, options = {}) {
  const topK = Number(options.topK || 4);
  const ranked = records
    .map((record, index) => ({ ...record, retrieval_score: scoreRecord(input, record), _index: index }))
    .filter((record) => record.retrieval_score >= Number(options.minScore ?? 0.04))
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
  return {
    query: String(input || ""),
    state_packet: statePacket,
    retrieved_evidence: ranked,
    evidence_status: classification.evidence_status,
    answer_policy_hint: classification.answer_policy_hint,
    local_only: true,
    same_origin_only: true,
    backend_retrieval: false,
    hosted_vector_store: false,
    external_storage_runtime: false,
    profile_rag: {
      enabled: true,
      cards_used: ranked.filter((item) => item.metadata?.profile_card === true).map((item) => item.source_id),
      answer_bank: false,
      broad_answer_bank: false,
      allowed_for_training: false,
      private_raw_data: false
    },
    expressive_context_pack: buildExpressiveContextPack(input, ranked)
  };
}
