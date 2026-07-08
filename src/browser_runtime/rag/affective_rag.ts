import { createEvidencePacket } from "./evidence_packet.ts";
import {
  collectToneHints,
  normalizeR28Rag3CardFixture,
  rankProfileCards,
  summarizeProfileSources
} from "./profile_retriever.ts";

export const R28RAG3_AFFECTIVE_RAG_VERSION = "r28rag3-lightweight-affective-rag-v1";

export function buildAffectiveRagPacket(query, statePacket = null, options = {}) {
  const cards = options.cards || normalizeR28Rag3CardFixture({ cards: options.rawCards || [] });
  const ranked = rankProfileCards(query, cards, {
    topK: options.topK || 4,
    minScore: options.minScore ?? 0.025
  });
  const packet = createEvidencePacket({ query, retrievedEvidence: ranked, statePacket });
  const toneHints = collectToneHints(packet.retrieved_evidence);
  return {
    ...packet,
    rag_profile_pack: {
      version: R28RAG3_AFFECTIVE_RAG_VERSION,
      runtime_hints_only: true,
      training_data: false,
      broad_answer_bank: false,
      private_raw_data: false,
      hosted_vector_store: false,
      tone_hints: toneHints,
      source_display: summarizeProfileSources(packet.retrieved_evidence)
    }
  };
}

export function mergeAffectiveEvidence(baseEvidence = [], affectiveEvidence = [], limit = 4) {
  const byId = new Map();
  for (const item of [...(baseEvidence || []), ...(affectiveEvidence || [])]) {
    const id = String(item.source_id || item.id || byId.size);
    if (!byId.has(id)) byId.set(id, item);
  }
  return Array.from(byId.values())
    .sort((left, right) => Number(right.retrieval_score || 0) - Number(left.retrieval_score || 0))
    .slice(0, limit);
}
