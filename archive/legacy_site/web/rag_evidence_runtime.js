import { cachedKnowledgeCards, normalizeKnowledgeTerm } from "./knowledge_runtime.js?v=1";

function clean(text) {
  return String(text || "").trim();
}

function stableId(prefix, text) {
  let hash = 2166136261;
  for (const ch of clean(text)) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}_${(hash >>> 0).toString(16)}`;
}

function tokens(text) {
  return Array.from(new Set((clean(text).toLowerCase().match(/[\u4e00-\u9fff]{2,}|[a-z][a-z0-9_+\-]{1,}/g) || []).slice(0, 24)));
}

function compactSnippet(card) {
  const answers = card?.answers && typeof card.answers === "object" ? Object.values(card.answers) : [];
  const first = clean(answers.find(Boolean) || card?.label || "");
  return first.length > 120 ? `${first.slice(0, 117)}...` : first;
}

function cardRef(card, index) {
  return card?.source_id || card?.id || `${card?.domain || "card"}:${card?.label || index}`;
}

function relationRefsFromCard(card, index) {
  const refs = [];
  if (card?.label) refs.push({ relation_type: "entity", ref: card.label });
  if (card?.domain) refs.push({ relation_type: "domain", ref: card.domain });
  if (card?.source_id) refs.push({ relation_type: "source_card", ref: card.source_id });
  for (const alias of (card?.aliases || []).slice(0, 2)) refs.push({ relation_type: "entity", ref: alias });
  return refs.slice(0, Math.max(1, index === 0 ? 5 : 3));
}

export function scoreKnowledgeRoute(query, routingIndex = {}, options = {}) {
  const normalized = normalizeKnowledgeTerm(query);
  const queryTokens = tokens(query).map(normalizeKnowledgeTerm);
  const domainHints = routingIndex.domain_hints || routingIndex.domains || [];
  const scores = [];
  for (const domain of domainHints) {
    const label = typeof domain === "string" ? domain : domain.domain;
    if (!label) continue;
    const normalizedLabel = normalizeKnowledgeTerm(label);
    const score = normalized.includes(normalizedLabel) ? 1 : queryTokens.some((token) => normalizedLabel.includes(token)) ? 0.35 : 0;
    if (score > 0) scores.push({ route: label, score });
  }
  return scores.sort((left, right) => right.score - left.score).slice(0, options.limit || 8);
}

export function collectCandidateEvidence(query, reasoningPlan = {}, cachedCards = null, options = {}) {
  const cards = Array.isArray(cachedCards) ? cachedCards : cachedKnowledgeCards();
  const queryTokens = tokens(query);
  const normalizedQuery = normalizeKnowledgeTerm(query);
  const maxCards = options.maxCards || 5;
  const scored = [];

  for (const [index, card] of cards.entries()) {
    const haystack = normalizeKnowledgeTerm([
      card?.label || "",
      ...(card?.aliases || []),
      card?.domain || "",
      ...Object.values(card?.answers || {})
    ].join(" "));
    if (!haystack) continue;
    let score = 0;
    for (const token of queryTokens) {
      const normalizedToken = normalizeKnowledgeTerm(token);
      if (normalizedToken && haystack.includes(normalizedToken)) score += normalizedToken.length;
    }
    if (normalizedQuery && card?.label && normalizedQuery.includes(normalizeKnowledgeTerm(card.label))) score += 12;
    if (reasoningPlan?.expected_operation === "relation_binding" && card?.domain) score += 1;
    if (score > 0) scored.push({ card, score, index });
  }

  return scored.sort((left, right) => right.score - left.score || left.index - right.index).slice(0, maxCards);
}

export function buildEvidencePacket(query, reasoningPlan = {}, options = {}) {
  const text = clean(query);
  const candidates = collectCandidateEvidence(text, reasoningPlan, options.cachedCards || null, options);
  const refs = candidates.map(({ card, index }) => cardRef(card, index));
  const relationRefs = candidates.flatMap(({ card }, index) => relationRefsFromCard(card, index)).slice(0, 12);
  const snippets = candidates.map(({ card }) => compactSnippet(card)).filter(Boolean).slice(0, 5);
  const needsEvidence = Boolean(reasoningPlan?.needs_retrieval);
  const sufficiency = candidates.length >= 2 ? "sufficient" : candidates.length === 1 ? "partial" : "absent";
  return {
    packet_id: options.packet_id || stableId("evidence_packet", `${text}:${reasoningPlan?.plan_id || ""}`),
    query: text,
    retrieval_queries: Array.from(new Set([text, ...(options.retrieval_queries || [])].filter(Boolean))).slice(0, 4),
    source_refs: candidates.map(({ card }) => card?.provenance?.source_path || card?.source_type || "knowledge_shard").slice(0, 8),
    card_refs: refs,
    relation_refs: relationRefs,
    evidence_snippets: snippets,
    confidence: candidates.length ? Math.min(1, 0.35 + candidates.length * 0.15) : 0,
    evidence_sufficiency: needsEvidence ? sufficiency : candidates.length ? "partial" : "absent",
    must_not_claim: [
      "do_not_claim_unretrieved_specific_fact",
      "do_not_treat_absent_evidence_as_negative_proof",
      "do_not_quote_long_source_text"
    ],
    private_data_allowed: false,
    chain_of_thought_allowed: false
  };
}

export function summarizeEvidencePacket(packet = {}) {
  return {
    packet_id: packet.packet_id || "",
    card_ref_count: Array.isArray(packet.card_refs) ? packet.card_refs.length : 0,
    relation_ref_count: Array.isArray(packet.relation_refs) ? packet.relation_refs.length : 0,
    evidence_sufficiency: packet.evidence_sufficiency || "absent",
    confidence: Number(packet.confidence || 0),
    private_data_allowed: packet.private_data_allowed === true,
    chain_of_thought_allowed: packet.chain_of_thought_allowed === true
  };
}
