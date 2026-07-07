export function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .match(/[a-z0-9_]+|[\u4e00-\u9fff]/g) || [];
}

function charNgrams(text, size = 3) {
  const clean = String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
  const grams = new Set();
  for (let index = 0; index <= clean.length - size; index += 1) grams.add(clean.slice(index, index + size));
  return grams;
}

export function scoreMemoryRecord(query, record) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return 0;
  const haystack = `${record.title || ""} ${record.text || ""} ${(record.keywords || []).join(" ")}`;
  const documentTokens = tokenize(haystack);
  const documentTokenSet = new Set(documentTokens);
  let overlap = 0;
  for (const token of new Set(queryTokens)) {
    if (documentTokenSet.has(token)) overlap += 1;
  }
  const keywordScore = overlap / Math.max(queryTokens.length, 1);
  const qgrams = charNgrams(query);
  const dgrams = charNgrams(haystack);
  let gramOverlap = 0;
  for (const gram of qgrams) {
    if (dgrams.has(gram)) gramOverlap += 1;
  }
  const gramScore = qgrams.size ? gramOverlap / qgrams.size : 0;
  const phraseBoost = haystack.toLowerCase().includes(String(query || "").toLowerCase().trim()) ? 0.25 : 0;
  const trustBoost = record.trust_level === "high" ? 0.08 : record.trust_level === "medium" ? 0.04 : 0;
  return Number((keywordScore * 0.72 + gramScore * 0.2 + phraseBoost + trustBoost).toFixed(6));
}

export function rankEvidence(query, records, options = {}) {
  const topK = Math.max(1, Number(options.topK || 1));
  const minScore = Number(options.minScore ?? 0.04);
  return (records || [])
    .map((record, index) => ({ ...record, retrieval_score: scoreMemoryRecord(query, record), _index: index }))
    .filter((record) => record.retrieval_score >= minScore)
    .sort((left, right) => right.retrieval_score - left.retrieval_score || left._index - right._index)
    .slice(0, topK)
    .map(({ _index, ...record }) => record);
}
