const DEMO_MEMORY_ASSET = "../another_brain/static_rag/demo_memory.json";
const PROFILE_CARD_ASSETS = Object.freeze([
  "../another_brain/static_rag/profile_cards.json",
  "../another_brain/static_rag/style_cards.json",
  "../another_brain/static_rag/boundary_cards.json"
]);
const DEFAULT_RAG_ASSETS = Object.freeze([DEMO_MEMORY_ASSET, ...PROFILE_CARD_ASSETS]);
const CARD_KINDS = Object.freeze(["identity", "style", "value", "aesthetic", "boundary", "capability"]);
const CARD_PROVENANCE = Object.freeze(["approved_anchor_summary", "hand_authored_boundary", "demo_safe"]);

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
  if (kind === "aesthetic" && /审美|好看|风格|aesthetic|taste|style/.test(text)) return 0.09;
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
    rag_profile_pack: {
      version: "r28rag3-lightweight-affective-rag-v1",
      runtime_hints_only: true,
      training_data: false,
      broad_answer_bank: false,
      private_raw_data: false,
      hosted_vector_store: false,
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
