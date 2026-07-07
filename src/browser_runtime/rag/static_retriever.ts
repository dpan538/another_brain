import { createEvidencePacket } from "./evidence_packet.ts";
import { rankEvidence } from "./evidence_ranker.ts";

export const STATIC_RAG_DEMO_ASSET = "../another_brain/static_rag/demo_memory.json";

export const DEFAULT_DEMO_MEMORY = Object.freeze([
  {
    source_id: "r27b3-demo-browser-memory-surface",
    title: "Browser memory surface demo boundary",
    text: "another_brain is rehearsing a static browser chat surface that retrieves local evidence packets before drafting.",
    trust_level: "high",
    license_or_origin: "synthetic demo fixture",
    can_answer: true,
    keywords: ["another_brain", "browser", "memory", "surface", "local", "evidence", "packet"]
  }
]);

function assertSameOriginAsset(assetUrl, baseUrl) {
  const base = new URL(baseUrl || "http://localhost/another_brain_chat/");
  const url = new URL(assetUrl, base);
  if (assetUrl.startsWith("//") || url.origin !== base.origin) throw new Error("non_same_origin_rag_asset_rejected");
  if (!url.pathname.includes("/another_brain/static_rag/")) throw new Error("rag_asset_path_not_declared");
  return url;
}

export function normalizeMemoryFixture(fixture) {
  const records = Array.isArray(fixture) ? fixture : fixture?.records;
  if (!Array.isArray(records)) throw new Error("rag_fixture_records_missing");
  if (fixture?.fixture_policy?.answer_bank === true) throw new Error("answer_bank_fixture_rejected");
  return records.map((record, index) => {
    if ("answer" in record || "final_answer" in record || "answer_text" in record) {
      throw new Error(`answer_bank_record_rejected:${record.source_id || index}`);
    }
    return {
      source_id: String(record.source_id || `demo_memory_${index}`),
      title: String(record.title || "Demo memory"),
      text: String(record.text || ""),
      trust_level: record.trust_level || "low",
      license_or_origin: String(record.license_or_origin || "synthetic demo fixture"),
      can_answer: record.can_answer !== false,
      keywords: Array.isArray(record.keywords) ? record.keywords.map(String) : [],
      metadata: record.metadata || {}
    };
  });
}

export async function loadStaticRagAsset(options = {}) {
  const fetcher = options.fetcher || globalThis.fetch;
  if (typeof fetcher !== "function") throw new Error("rag_fetch_unavailable");
  const url = assertSameOriginAsset(options.assetUrl || STATIC_RAG_DEMO_ASSET, options.baseUrl);
  const response = await fetcher(url.href);
  if (!response.ok) throw new Error(`rag_asset_fetch_failed:${response.status}`);
  return normalizeMemoryFixture(await response.json());
}

export class StaticRetriever {
  constructor(options = {}) {
    this.records = normalizeMemoryFixture(options.fixture || { records: options.records || DEFAULT_DEMO_MEMORY });
    this.topK = Number(options.topK || 1);
    this.minScore = Number(options.minScore ?? 0.04);
  }

  async retrieve(query, statePacket = null, options = {}) {
    const ranked = rankEvidence(query, this.records, {
      topK: options.topK || this.topK,
      minScore: options.minScore ?? this.minScore
    });
    return createEvidencePacket({ query, retrievedEvidence: ranked, statePacket });
  }
}

export async function createStaticRetrieverFromAsset(options = {}) {
  const records = await loadStaticRagAsset(options);
  return new StaticRetriever({ records, topK: options.topK, minScore: options.minScore });
}

export async function buildStaticEvidencePacket(input, statePacket = null, options = {}) {
  const retriever = options.retriever || new StaticRetriever({
    records: options.memoryRecords || DEFAULT_DEMO_MEMORY,
    topK: options.topK,
    minScore: options.minScore
  });
  return retriever.retrieve(input, statePacket, options);
}
