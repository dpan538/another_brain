const DEFAULT_SHARD_BASE = "./knowledge_shards/";
const NORMALIZE_PUNCTUATION = /[\s\-＿_—–~～`"'“”‘’.,，。!?！？:：;；、()[\]{}<>《》「」『』]/g;

const loadedShards = new Map();
let manifestPromise = null;
let routingPromise = null;
let lastManifest = null;
let lastRouting = null;
let entryBuckets = null;

const runtimeConfig = {
  shardBase: DEFAULT_SHARD_BASE,
  fetchImpl: null
};

export function configureKnowledgeRuntime({ shardBase, fetchImpl, reset = true } = {}) {
  if (typeof shardBase === "string" && shardBase) runtimeConfig.shardBase = shardBase;
  if (typeof fetchImpl === "function") runtimeConfig.fetchImpl = fetchImpl;
  if (reset) {
    loadedShards.clear();
    manifestPromise = null;
    routingPromise = null;
    lastManifest = null;
    lastRouting = null;
    entryBuckets = null;
  }
}

export function normalizeKnowledgeTerm(text) {
  return String(text || "").toLowerCase().replace(NORMALIZE_PUNCTUATION, "").trim();
}

function shardUrl(file) {
  return `${runtimeConfig.shardBase}${file}`;
}

async function fetchJson(file) {
  const fetcher = runtimeConfig.fetchImpl || globalThis.fetch;
  if (typeof fetcher !== "function") {
    throw new Error("knowledge runtime fetch unavailable");
  }
  const response = await fetcher(shardUrl(file), { cache: "force-cache" });
  if (!response?.ok) {
    throw new Error(`knowledge asset load failed: ${file}:${response?.status || "unknown"}`);
  }
  return response.json();
}

export async function loadKnowledgeManifest() {
  if (!manifestPromise) {
    manifestPromise = fetchJson("manifest.json").then((payload) => {
      lastManifest = payload;
      return payload;
    });
  }
  return manifestPromise;
}

export async function loadKnowledgeRouting() {
  if (!routingPromise) {
    routingPromise = fetchJson("routing.json").then((payload) => {
      lastRouting = payload;
      entryBuckets = null;
      return payload;
    });
  }
  return routingPromise;
}

function rowToCard(row) {
  const [domain, label, aliases, answers] = Array.isArray(row) ? row : [];
  return {
    domain: domain || "",
    label: label || "",
    aliases: Array.isArray(aliases) ? aliases : [],
    answers: answers && typeof answers === "object" ? answers : {},
    kind: "common_knowledge"
  };
}

function buildEntryBuckets(routing) {
  if (entryBuckets) return entryBuckets;
  const buckets = new Map();
  for (const entry of routing?.entries || []) {
    if (!Array.isArray(entry) || entry.length !== 2) continue;
    const term = normalizeKnowledgeTerm(entry[0]);
    const indexes = Array.isArray(entry[1]) ? entry[1].filter((index) => Number.isInteger(index)) : [];
    if (!term || !indexes.length) continue;
    const key = Array.from(term)[0] || "";
    const bucket = buckets.get(key) || [];
    bucket.push({ term, indexes });
    buckets.set(key, bucket);
  }
  for (const bucket of buckets.values()) {
    bucket.sort((left, right) => right.term.length - left.term.length || left.term.localeCompare(right.term));
  }
  entryBuckets = buckets;
  return buckets;
}

function queryKeys(query) {
  const normalized = normalizeKnowledgeTerm(query);
  const keys = new Set(Array.from(normalized));
  for (const word of normalized.match(/[a-z][a-z0-9_+]{1,}/g) || []) {
    keys.add(word[0]);
  }
  return { normalized, keys };
}

function scoreShardsForQuery(query, routing) {
  const { normalized, keys } = queryKeys(query);
  if (!normalized) return [];

  const scores = new Map();
  const seenTerms = new Set();
  const buckets = buildEntryBuckets(routing);
  for (const key of keys) {
    for (const entry of buckets.get(key) || []) {
      if (seenTerms.has(entry.term) || !normalized.includes(entry.term)) continue;
      seenTerms.add(entry.term);
      const score = Math.max(10, entry.term.length * 4);
      for (const index of entry.indexes) {
        scores.set(index, (scores.get(index) || 0) + score);
      }
    }
  }

  for (const shard of routing?.shards || []) {
    const index = shard?.index;
    if (!Number.isInteger(index)) continue;
    for (const domain of shard.domains || []) {
      const normalizedDomain = normalizeKnowledgeTerm(domain);
      if (normalizedDomain && normalized.includes(normalizedDomain)) {
        scores.set(index, (scores.get(index) || 0) + 2);
      }
    }
  }

  return [...scores.entries()]
    .map(([index, score]) => ({ index, score }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);
}

async function loadShard(file) {
  if (loadedShards.has(file)) return loadedShards.get(file);
  const payload = await fetchJson(file);
  const cards = (payload.cards || []).map(rowToCard);
  loadedShards.set(file, cards);
  return cards;
}

export async function warmKnowledgeForQuery(query, { maxShards = 3 } = {}) {
  const routing = await loadKnowledgeRouting();
  const manifest = await loadKnowledgeManifest();
  const manifestShardsByIndex = new Map((manifest.shards || []).map((shard) => [shard.index, shard]));
  const ranked = scoreShardsForQuery(query, routing).slice(0, Math.max(1, maxShards));
  if (!ranked.length) return [];
  const files = ranked
    .map((item) => manifestShardsByIndex.get(item.index)?.file)
    .filter(Boolean);
  const groups = await Promise.all(files.map((file) => loadShard(file)));
  return groups.flat();
}

export function cachedKnowledgeCards() {
  return [...loadedShards.values()].flat();
}

export function knowledgeRuntimeStats() {
  const cachedCards = cachedKnowledgeCards();
  const manifestStats = lastManifest?.stats || {};
  return {
    loadedShardCount: loadedShards.size,
    cardsCached: cachedCards.length,
    shardCount: lastManifest?.shard_count || lastRouting?.shard_count || 0,
    routingEntries: Array.isArray(lastRouting?.entries) ? lastRouting.entries.length : 0,
    totalCards: lastManifest?.total_cards || cachedCards.length,
    conceptCards: manifestStats.concept_cards || cachedCards.length,
    answerFields: manifestStats.answer_fields || 0,
    specificFactCards: manifestStats.specific_fact_cards || 0,
    sourceSha256: lastManifest?.source?.sha256 || lastRouting?.source_sha256 || ""
  };
}
