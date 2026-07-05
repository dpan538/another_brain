const DEMO_MEMORY_ASSET = "../another_brain/static_rag/demo_memory.json";

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
  "<hidden"
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
  return Number((keywordScore * 0.72 + gramScore * 0.2 + trustBoost).toFixed(6));
}

function normalizeRecords(fixture) {
  const records = Array.isArray(fixture) ? fixture : fixture?.records;
  if (!Array.isArray(records)) return FALLBACK_DEMO_RECORDS;
  if (fixture?.fixture_policy?.answer_bank === true) return FALLBACK_DEMO_RECORDS;
  return records.filter((record) => !("answer" in record || "final_answer" in record || "answer_text" in record));
}

function classifyEvidence(query, evidence) {
  if (!String(query || "").trim() || evidence.length === 0) {
    return { evidence_status: "insufficient", answer_policy_hint: "ask_clarifying" };
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
  const url = new URL(options.assetUrl || DEMO_MEMORY_ASSET, base);
  if (url.origin !== base.origin || !url.pathname.includes("/another_brain/static_rag/")) {
    throw new Error("non_same_origin_rag_asset_rejected");
  }
  const fetcher = options.fetcher || globalThis.fetch;
  if (typeof fetcher !== "function") return FALLBACK_DEMO_RECORDS;
  const response = await fetcher(url.href);
  if (!response.ok) throw new Error(`rag_asset_fetch_failed:${response.status}`);
  return normalizeRecords(await response.json());
}

export function buildEvidencePacket(input, statePacket, records = FALLBACK_DEMO_RECORDS, options = {}) {
  const topK = Number(options.topK || 2);
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
      can_answer: record.can_answer !== false
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
    external_storage_runtime: false
  };
}
