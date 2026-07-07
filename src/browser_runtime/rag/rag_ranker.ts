export function normalizeQuery(text) {
  return String(text || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[“”‘’"'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeForRetrieval(text) {
  return normalizeQuery(text).match(/[a-z0-9_]+|[\u4e00-\u9fff]/g) || [];
}

export function charNgrams(text, size = 2) {
  const chars = Array.from(normalizeQuery(text).replace(/\s+/g, ""));
  const grams = new Set();
  for (let index = 0; index <= chars.length - size; index += 1) {
    grams.add(chars.slice(index, index + size).join(""));
  }
  return grams;
}

function termFrequency(tokens = []) {
  const counts = new Map();
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
  return counts;
}

function buildCorpusStats(records = []) {
  const docFreq = new Map();
  for (const record of records) {
    const haystack = `${record.title || ""} ${record.text || ""} ${(record.keywords || []).join(" ")}`;
    for (const token of new Set(tokenizeForRetrieval(haystack))) {
      docFreq.set(token, (docFreq.get(token) || 0) + 1);
    }
  }
  return { docFreq, totalDocs: Math.max(1, records.length) };
}

function idf(token, stats) {
  const docsWithTerm = stats.docFreq.get(token) || 0;
  return Math.log(1 + (stats.totalDocs - docsWithTerm + 0.5) / (docsWithTerm + 0.5));
}

export function scoreMemoryRecord(query, record, options = {}) {
  const normalizedQuery = normalizeQuery(query);
  const queryTokens = tokenizeForRetrieval(normalizedQuery);
  if (queryTokens.length === 0) return 0;
  const stats = options.corpusStats || buildCorpusStats([record]);
  const title = String(record.title || "");
  const text = String(record.text || "");
  const keywords = (record.keywords || []).join(" ");
  const haystack = `${title} ${text} ${keywords}`;
  const documentTokens = tokenizeForRetrieval(haystack);
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
  const maxBm25 = queryTokens.length * 2.2;
  const bm25Score = Math.min(1, bm25 / Math.max(maxBm25, 1));
  const titleTokens = new Set(tokenizeForRetrieval(title));
  const keywordTokens = new Set(tokenizeForRetrieval(keywords));
  let titleOverlap = 0;
  let keywordOverlap = 0;
  for (const token of new Set(queryTokens)) {
    if (titleTokens.has(token)) titleOverlap += 1;
    if (keywordTokens.has(token)) keywordOverlap += 1;
  }
  const titleScore = titleOverlap / Math.max(new Set(queryTokens).size, 1);
  const keywordScore = keywordOverlap / Math.max(new Set(queryTokens).size, 1);
  const qgrams = charNgrams(normalizedQuery, /[\u4e00-\u9fff]/.test(normalizedQuery) ? 2 : 3);
  const dgrams = charNgrams(haystack, /[\u4e00-\u9fff]/.test(normalizedQuery) ? 2 : 3);
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

export function rankEvidence(query, records, options = {}) {
  const topK = Math.max(1, Number(options.topK || 3));
  const minScore = Number(options.minScore ?? 0.035);
  const corpusStats = buildCorpusStats(records || []);
  const docLengths = (records || []).map((record) => tokenizeForRetrieval(`${record.title || ""} ${record.text || ""} ${(record.keywords || []).join(" ")}`).length);
  const avgDocLength = docLengths.length ? docLengths.reduce((sum, item) => sum + item, 0) / docLengths.length : 1;
  return (records || [])
    .map((record, index) => ({
      ...record,
      retrieval_score: scoreMemoryRecord(query, record, { corpusStats, avgDocLength }),
      _index: index
    }))
    .filter((record) => record.retrieval_score >= minScore)
    .sort((left, right) => right.retrieval_score - left.retrieval_score || left._index - right._index)
    .slice(0, topK)
    .map(({ _index, ...record }) => record);
}
