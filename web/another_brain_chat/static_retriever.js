const MEMORY_INDEX_ASSET = "../another_brain/static_rag/memory_index.json";
const SOURCE_REGISTRY_ASSET = "../another_brain/static_rag/source_registry.json";

const FALLBACK_SOURCE_REGISTRY = {
  schema_version: "r28rag2.source_registry.v1",
  registry_policy: {
    synthetic_public_safe: true,
    private_raw_data: false,
    answer_bank: false,
    eval_prompts: false,
    old_question_pack_001_rows_51_100: false,
    backend_retrieval: false,
    hosted_vector_store: false
  },
  sources: [
    {
      source_id: "r28rag2-system-boundary",
      title: "another_brain runtime boundary",
      origin: "synthetic_public_safe_runtime_note",
      provenance: "R28RAG2 authored static fixture",
      review_status: "reviewed_demo_safe",
      license_or_origin: "synthetic demo fixture",
      allowed_for_training: false
    }
  ]
};

const FALLBACK_MEMORY_INDEX = {
  schema_version: "r28rag2.static_memory_index.v1",
  index_policy: {
    synthetic_public_safe: true,
    private_raw_data: false,
    answer_bank: false,
    eval_prompts: false,
    old_question_pack_001_rows_51_100: false,
    backend_retrieval: false,
    hosted_vector_store: false
  },
  default_top_k: 3,
  min_score: 0.035,
  records: [
    {
      record_id: "r28rag2-default-pipeline",
      source_id: "r28rag2-system-boundary",
      title: "Local-first answer pipeline",
      text: "another_brain uses local retrieval, an evidence packet, a browser q4 draft path, hard router, finalizer, and fallback.",
      trust_level: "high",
      can_answer: true,
      keywords: ["another_brain", "local", "evidence", "q4", "router", "finalizer", "fallback", "本地", "检索证据"]
    }
  ]
};

const MALICIOUS_MARKERS = [
  "ignore previous instructions",
  "ignore the previous instructions",
  "reveal hidden prompt",
  "show the hidden prompt",
  "system prompt",
  "developer message",
  "chain-of-thought",
  "chain of thought",
  "<hidden",
  "忽略前面的规则",
  "隐藏提示",
  "开发者消息",
  "系统提示"
];

function normalizeQuery(text) {
  return String(text || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[“”‘’"'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  return normalizeQuery(text).match(/[a-z0-9_]+|[\u4e00-\u9fff]/g) || [];
}

function charNgrams(text, size = 2) {
  const chars = Array.from(normalizeQuery(text).replace(/\s+/g, ""));
  const grams = new Set();
  for (let index = 0; index <= chars.length - size; index += 1) grams.add(chars.slice(index, index + size).join(""));
  return grams;
}

function termFrequency(tokens = []) {
  const counts = new Map();
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
  return counts;
}

function corpusStats(records = []) {
  const docFreq = new Map();
  for (const record of records) {
    const haystack = `${record.title || ""} ${record.text || ""} ${(record.keywords || []).join(" ")}`;
    for (const token of new Set(tokenize(haystack))) docFreq.set(token, (docFreq.get(token) || 0) + 1);
  }
  return { docFreq, totalDocs: Math.max(1, records.length) };
}

function idf(token, stats) {
  const docsWithTerm = stats.docFreq.get(token) || 0;
  return Math.log(1 + (stats.totalDocs - docsWithTerm + 0.5) / (docsWithTerm + 0.5));
}

function scoreRecord(query, record, options = {}) {
  const normalizedQuery = normalizeQuery(query);
  const queryTokens = tokenize(normalizedQuery);
  if (queryTokens.length === 0) return 0;
  const stats = options.corpusStats || corpusStats([record]);
  const title = String(record.title || "");
  const text = String(record.text || "");
  const keywords = (record.keywords || []).join(" ");
  const haystack = `${title} ${text} ${keywords}`;
  const documentTokens = tokenize(haystack);
  const tf = termFrequency(documentTokens);
  const avgDocLength = Number(options.avgDocLength || documentTokens.length || 1);
  const k1 = 1.2;
  const b = 0.75;
  let bm25 = 0;
  for (const token of new Set(queryTokens)) {
    const freq = tf.get(token) || 0;
    if (!freq) continue;
    const denom = freq + k1 * (1 - b + b * (documentTokens.length / Math.max(avgDocLength, 1)));
    bm25 += idf(token, stats) * ((freq * (k1 + 1)) / Math.max(denom, 0.0001));
  }
  const bm25Score = Math.min(1, bm25 / Math.max(queryTokens.length * 2.2, 1));
  const titleTokens = new Set(tokenize(title));
  const keywordTokens = new Set(tokenize(keywords));
  let titleOverlap = 0;
  let keywordOverlap = 0;
  for (const token of new Set(queryTokens)) {
    if (titleTokens.has(token)) titleOverlap += 1;
    if (keywordTokens.has(token)) keywordOverlap += 1;
  }
  const titleScore = titleOverlap / Math.max(new Set(queryTokens).size, 1);
  const keywordScore = keywordOverlap / Math.max(new Set(queryTokens).size, 1);
  const hasChinese = /[\u4e00-\u9fff]/.test(normalizedQuery);
  const qgrams = charNgrams(normalizedQuery, hasChinese ? 2 : 3);
  const dgrams = charNgrams(haystack, hasChinese ? 2 : 3);
  let gramOverlap = 0;
  for (const gram of qgrams) {
    if (dgrams.has(gram)) gramOverlap += 1;
  }
  const gramScore = qgrams.size ? gramOverlap / qgrams.size : 0;
  const phraseBoost = normalizeQuery(haystack).includes(normalizedQuery) ? 0.18 : 0;
  const lexicalScore = bm25Score * 0.46 + gramScore * 0.24 + keywordScore * 0.16 + titleScore * 0.12 + phraseBoost;
  if (lexicalScore <= 0) return 0;
  const trustBoost = record.trust_level === "high" ? 0.07 : record.trust_level === "medium" ? 0.035 : 0;
  const sourceBoost = record.review_status === "reviewed_demo_safe" ? 0.025 : 0;
  return Number((lexicalScore + trustBoost + sourceBoost).toFixed(6));
}

function assertPolicy(policy = {}, label = "static_rag_policy") {
  if (policy.private_raw_data === true) throw new Error(`${label}:private_raw_data`);
  if (policy.answer_bank === true) throw new Error(`${label}:answer_bank`);
  if (policy.eval_prompts === true) throw new Error(`${label}:eval_prompts`);
  if (policy.old_question_pack_001_rows_51_100 === true) throw new Error(`${label}:old_question_pack_001_rows_51_100`);
  if (policy.backend_retrieval === true) throw new Error(`${label}:backend_retrieval`);
  if (policy.hosted_vector_store === true) throw new Error(`${label}:hosted_vector_store`);
}

function normalizeSourceRegistry(registry = FALLBACK_SOURCE_REGISTRY) {
  assertPolicy(registry.registry_policy || {}, "source_registry");
  const sources = Array.isArray(registry.sources) ? registry.sources : [];
  const normalized = sources.map((source, index) => ({
    source_id: String(source.source_id || `r28rag2-source-${index}`),
    title: String(source.title || "Static RAG source"),
    origin: String(source.origin || source.license_or_origin || "synthetic demo fixture"),
    provenance: String(source.provenance || source.origin || "synthetic demo fixture"),
    review_status: String(source.review_status || "reviewed_demo_safe"),
    license_or_origin: String(source.license_or_origin || source.origin || "synthetic demo fixture"),
    allowed_for_training: false
  }));
  return { sources: normalized, by_id: new Map(normalized.map((source) => [source.source_id, source])) };
}

function normalizeRecords(index = FALLBACK_MEMORY_INDEX, registry = FALLBACK_SOURCE_REGISTRY) {
  const normalizedIndex = Array.isArray(index) ? { ...FALLBACK_MEMORY_INDEX, records: index } : index;
  assertPolicy(normalizedIndex.index_policy || normalizedIndex.fixture_policy || {}, "memory_index");
  const sourceRegistry = normalizeSourceRegistry(registry);
  const records = Array.isArray(normalizedIndex.records) ? normalizedIndex.records : [];
  return records.map((record, itemIndex) => {
    for (const key of ["answer", "final_answer", "answer_text", "template_answer"]) {
      if (key in record) throw new Error(`answer_bank_record_rejected:${record.source_id || record.record_id || itemIndex}:${key}`);
    }
    const source = sourceRegistry.by_id.get(String(record.source_id || "")) || {};
    return {
      record_id: String(record.record_id || record.id || `r28rag2-record-${itemIndex}`),
      source_id: String(record.source_id || source.source_id || `r28rag2-source-${itemIndex}`),
      title: String(record.title || source.title || "Static RAG memory"),
      text: String(record.text || ""),
      trust_level: ["high", "medium", "low"].includes(record.trust_level) ? record.trust_level : "low",
      can_answer: record.can_answer !== false,
      keywords: Array.isArray(record.keywords) ? record.keywords.map(String) : [],
      origin: String(record.origin || source.origin || record.license_or_origin || "synthetic demo fixture"),
      provenance: String(record.provenance || source.provenance || record.license_or_origin || "synthetic demo fixture"),
      review_status: String(record.review_status || source.review_status || "reviewed_demo_safe"),
      license_or_origin: String(record.license_or_origin || source.license_or_origin || "synthetic demo fixture"),
      allowed_for_training: false,
      metadata: { ...(record.metadata || {}), review_status: record.review_status || source.review_status || "reviewed_demo_safe" }
    };
  }).filter((record) => record.text.trim().length > 0);
}

function sourceSummary(evidence = []) {
  return evidence.slice(0, 5).map((item) => ({
    source_id: String(item.source_id || "local"),
    title: String(item.title || "local evidence").slice(0, 120),
    origin: String(item.origin || item.license_or_origin || "synthetic demo fixture"),
    provenance: String(item.provenance || item.license_or_origin || "synthetic demo fixture"),
    review_status: String(item.review_status || item.metadata?.review_status || "reviewed_demo_safe"),
    retrieval_score: Number(item.retrieval_score || 0)
  }));
}

function classifyEvidence(query, evidence) {
  const topScore = Math.max(0, ...evidence.map((item) => Number(item.retrieval_score || 0)));
  if (!String(query || "").trim() || evidence.length === 0) {
    return { evidence_status: "insufficient", answer_policy_hint: "ask_clarifying", fallback_reason: "insufficient_evidence", top_score: topScore, source_summary: [] };
  }
  const malicious = evidence.some((item) => {
    const text = `${item.title || ""}\n${item.text || ""}`.toLowerCase();
    return item.metadata?.malicious_fixture === true || MALICIOUS_MARKERS.some((marker) => text.includes(marker));
  });
  if (malicious) {
    return { evidence_status: "malicious", answer_policy_hint: "ignore_untrusted_instruction", fallback_reason: "malicious_evidence_ignored", top_score: topScore, source_summary: sourceSummary(evidence) };
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
    return { evidence_status: "conflicting", answer_policy_hint: "identify_conflict", fallback_reason: "conflicting_evidence", top_score: topScore, source_summary: sourceSummary(evidence) };
  }
  if (!evidence.some((item) => item.can_answer !== false) || topScore < 0.08) {
    return { evidence_status: "insufficient", answer_policy_hint: "ask_clarifying", fallback_reason: "retrieval_score_below_threshold", top_score: topScore, source_summary: sourceSummary(evidence) };
  }
  return { evidence_status: "sufficient", answer_policy_hint: "answer_with_evidence", fallback_reason: "", top_score: topScore, source_summary: sourceSummary(evidence) };
}

function rankEvidence(query, records, options = {}) {
  const topK = Math.max(1, Number(options.topK || 3));
  const minScore = Number(options.minScore ?? 0.035);
  const stats = corpusStats(records || []);
  const lengths = (records || []).map((record) => tokenize(`${record.title || ""} ${record.text || ""} ${(record.keywords || []).join(" ")}`).length);
  const avgDocLength = lengths.length ? lengths.reduce((sum, item) => sum + item, 0) / lengths.length : 1;
  return (records || [])
    .map((record, index) => ({ ...record, retrieval_score: scoreRecord(query, record, { corpusStats: stats, avgDocLength }), _index: index }))
    .filter((record) => record.retrieval_score >= minScore)
    .sort((left, right) => right.retrieval_score - left.retrieval_score || left._index - right._index)
    .slice(0, topK)
    .map(({ _index, ...record }) => record);
}

async function fetchJsonSameOrigin(assetUrl, baseHref, fetcher) {
  if (!baseHref) return null;
  const base = new URL(baseHref);
  const url = new URL(assetUrl, base);
  if (url.origin !== base.origin || !url.pathname.includes("/another_brain/static_rag/")) {
    throw new Error("non_same_origin_rag_asset_rejected");
  }
  const response = await fetcher(url.href);
  if (!response.ok) throw new Error(`rag_asset_fetch_failed:${response.status}`);
  return response.json();
}

export async function loadStaticMemoryRecords(options = {}) {
  const fetcher = options.fetcher || globalThis.fetch;
  if (typeof fetcher !== "function") return normalizeRecords(FALLBACK_MEMORY_INDEX, FALLBACK_SOURCE_REGISTRY);
  const baseHref = options.baseUrl || globalThis.location?.href;
  if (!baseHref) return normalizeRecords(FALLBACK_MEMORY_INDEX, FALLBACK_SOURCE_REGISTRY);
  const [index, registry] = await Promise.all([
    fetchJsonSameOrigin(options.assetUrl || MEMORY_INDEX_ASSET, baseHref, fetcher),
    fetchJsonSameOrigin(options.registryUrl || SOURCE_REGISTRY_ASSET, baseHref, fetcher)
  ]);
  return normalizeRecords(index || FALLBACK_MEMORY_INDEX, registry || FALLBACK_SOURCE_REGISTRY);
}

export function buildEvidencePacket(input, statePacket, records = normalizeRecords(FALLBACK_MEMORY_INDEX, FALLBACK_SOURCE_REGISTRY), options = {}) {
  const ranked = rankEvidence(input, records, {
    topK: options.topK || 3,
    minScore: options.minScore ?? 0.035
  }).map((record) => ({
    source_id: String(record.source_id || record.record_id || "static_memory"),
    record_id: String(record.record_id || record.source_id || "static_memory"),
    title: String(record.title || "Static memory"),
    text: String(record.text || ""),
    trust_level: ["high", "medium", "low"].includes(record.trust_level) ? record.trust_level : "low",
    retrieval_score: Number(record.retrieval_score || 0),
    license_or_origin: String(record.license_or_origin || record.origin || "synthetic demo fixture"),
    origin: String(record.origin || record.license_or_origin || "synthetic demo fixture"),
    provenance: String(record.provenance || record.origin || record.license_or_origin || "synthetic demo fixture"),
    review_status: String(record.review_status || record.metadata?.review_status || "reviewed_demo_safe"),
    can_answer: record.can_answer !== false,
    allowed_for_training: false,
    metadata: record.metadata || {}
  }));
  const classification = classifyEvidence(input, ranked);
  return {
    query: String(input || ""),
    state_packet: statePacket,
    retrieved_evidence: ranked,
    evidence_status: classification.evidence_status,
    answer_policy_hint: classification.answer_policy_hint,
    fallback_reason: classification.fallback_reason || "",
    evidence_summary: {
      top_score: Number(classification.top_score || 0),
      source_count: ranked.length,
      sources: classification.source_summary || []
    },
    local_only: true,
    same_origin_only: true,
    backend_retrieval: false,
    hosted_vector_store: false,
    external_storage_runtime: false,
    answer_bank: false
  };
}
