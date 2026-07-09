import { createEvidencePacket } from "./evidence_packet.ts";
import {
  collectToneHints,
  normalizeR28Rag3CardFixture,
  rankProfileCards,
  summarizeProfileSources
} from "./profile_retriever.ts";

export const R28RAG3_EXPRESSIVE_CONTEXT_VERSION = "r28rag3.expressive_context_pack.v1";

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean).map(String)));
}

export function buildExpressiveContextPack(query, evidence = []) {
  const profileEvidence = (evidence || []).filter((item) =>
    item.metadata?.r28rag3_profile_card === true || item.metadata?.profile_card === true
  );
  const toneHints = collectToneHints(profileEvidence, 8);
  return {
    schema_version: R28RAG3_EXPRESSIVE_CONTEXT_VERSION,
    query: String(query || ""),
    runtime_hints_only: true,
    evidence_is_instruction: false,
    answer_bank: false,
    broad_answer_bank: false,
    hidden_prompt: false,
    cot: false,
    local_only: true,
    backend_retrieval: false,
    external_llm_api: false,
    doubao: false,
    hosted_vector_store: false,
    cards_used: profileEvidence.map((item) => item.source_id),
    kinds: unique(profileEvidence.map((item) => item.metadata?.card_kind || item.metadata?.kind)),
    provenances: unique(profileEvidence.map((item) => item.metadata?.provenance || item.license_or_origin)),
    expressive_hints: toneHints,
    chat_mode_hint: toneHints.slice(0, 3).join(", "),
    dashboard_sources: summarizeProfileSources(profileEvidence).slice(0, 4)
  };
}

export function mergeExpressiveEvidence(baseEvidencePacket, profileEvidence, options = {}) {
  const query = baseEvidencePacket?.query || options.query || "";
  const statePacket = baseEvidencePacket?.state_packet || options.statePacket || null;
  const byId = new Map();
  for (const item of [
    ...(baseEvidencePacket?.retrieved_evidence || []),
    ...(profileEvidence || [])
  ]) {
    const id = String(item.source_id || item.id || byId.size);
    if (!byId.has(id)) byId.set(id, item);
  }
  const combined = Array.from(byId.values())
    .sort((left, right) => Number(right.retrieval_score || 0) - Number(left.retrieval_score || 0))
    .slice(0, Number(options.topK || 6));
  const packet = createEvidencePacket({ query, retrievedEvidence: combined, statePacket });
  packet.profile_rag = {
    enabled: true,
    cards_used: profileEvidence.map((item) => item.source_id),
    answer_bank: false,
    broad_answer_bank: false,
    allowed_for_training: false,
    private_raw_data: false
  };
  packet.expressive_context_pack = buildExpressiveContextPack(query, packet.retrieved_evidence);
  return packet;
}

export function buildExpressiveRagPacket(input, statePacket = null, options = {}) {
  const cards = normalizeR28Rag3CardFixture({ cards: options.rawCards || options.cards || [] });
  const profileEvidence = rankProfileCards(input, cards, {
    topK: options.profileTopK || 4,
    minScore: options.profileMinScore ?? 0.025
  });
  const basePacket = options.baseEvidencePacket || createEvidencePacket({
    query: input,
    retrievedEvidence: [],
    statePacket
  });
  return mergeExpressiveEvidence(basePacket, profileEvidence, {
    query: input,
    statePacket,
    topK: options.topK || 6
  });
}
