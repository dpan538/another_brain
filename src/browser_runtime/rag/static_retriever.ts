import { createEvidencePacket } from "./evidence_packet.ts";
import { rankEvidence } from "./rag_ranker.ts";
import {
  DEFAULT_MEMORY_INDEX,
  DEFAULT_SOURCE_REGISTRY,
  STATIC_RAG_MEMORY_INDEX_ASSET,
  STATIC_RAG_SOURCE_REGISTRY_ASSET,
  normalizeMemoryIndex
} from "./static_memory_index.ts";

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
  const index = Array.isArray(fixture) ? { ...DEFAULT_MEMORY_INDEX, records: fixture } : fixture || DEFAULT_MEMORY_INDEX;
  const normalized = normalizeMemoryIndex(index, DEFAULT_SOURCE_REGISTRY);
  return normalized.records;
}

export async function loadStaticRagAsset(options = {}) {
  const fetcher = options.fetcher || globalThis.fetch;
  if (typeof fetcher !== "function") throw new Error("rag_fetch_unavailable");
  const memoryUrl = assertSameOriginAsset(options.assetUrl || STATIC_RAG_MEMORY_INDEX_ASSET, options.baseUrl);
  const registryUrl = assertSameOriginAsset(options.registryUrl || STATIC_RAG_SOURCE_REGISTRY_ASSET, options.baseUrl);
  const [memoryResponse, registryResponse] = await Promise.all([
    fetcher(memoryUrl.href),
    fetcher(registryUrl.href)
  ]);
  if (!memoryResponse.ok) throw new Error(`rag_asset_fetch_failed:${memoryResponse.status}`);
  if (!registryResponse.ok) throw new Error(`rag_registry_fetch_failed:${registryResponse.status}`);
  const normalized = normalizeMemoryIndex(await memoryResponse.json(), await registryResponse.json());
  return normalized.records;
}

export class StaticRetriever {
  constructor(options = {}) {
    this.records = options.records
      ? normalizeMemoryIndex({ ...DEFAULT_MEMORY_INDEX, records: options.records }, DEFAULT_SOURCE_REGISTRY).records
      : normalizeMemoryFixture(options.fixture || DEFAULT_MEMORY_INDEX);
    this.topK = Number(options.topK || 3);
    this.minScore = Number(options.minScore ?? 0.035);
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
