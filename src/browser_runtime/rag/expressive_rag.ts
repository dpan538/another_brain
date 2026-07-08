import { createEvidencePacket } from "./evidence_packet.ts";
import { ProfileRetriever } from "./profile_retriever.ts";

export const R28RAG3_EXPRESSIVE_CONTEXT_VERSION = "r28rag3.expressive_context_pack.v1";

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean).map(String)));
}

export function buildExpressiveContextPack(query, evidence = []) {
  const profileEvidence = (evidence || []).filter((item) => item.metadata?.profile_card === true);
  const kinds = unique(profileEvidence.map((item) => item.metadata?.kind));
  const provenances = unique(profileEvidence.map((item) => item.metadata?.provenance || item.license_or_origin));
  const expressiveHints = unique(profileEvidence.flatMap((item) => item.metadata?.expressive_hints || [])).slice(0, 8);
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
    kinds,
    provenances,
    expressive_hints: expressiveHints,
    chat_mode_hint: expressiveHints.slice(0, 3).join(", "),
    dashboard_sources: profileEvidence.slice(0, 4).map((item) => ({
      source_id: item.source_id,
      title: item.title,
      kind: item.metadata?.kind || "",
      provenance: item.metadata?.provenance || item.license_or_origin || "",
      review_status: item.metadata?.review_status || "",
      retrieval_score: Number(item.retrieval_score || 0)
    }))
  };
}

function sortEvidence(evidence) {
  return [...(evidence || [])].sort((left, right) =>
    Number(right.retrieval_score || 0) - Number(left.retrieval_score || 0)
    || String(left.source_id || "").localeCompare(String(right.source_id || ""))
  );
}

export function mergeProfileEvidence(baseEvidencePacket, profileEvidence, options = {}) {
  const query = baseEvidencePacket?.query || options.query || "";
  const statePacket = baseEvidencePacket?.state_packet || options.statePacket || null;
  const combined = sortEvidence([...(baseEvidencePacket?.retrieved_evidence || []), ...(profileEvidence || [])])
    .slice(0, Number(options.topK || 6));
  const packet = createEvidencePacket({ query, retrievedEvidence: combined, statePacket });
  packet.profile_rag = {
    enabled: true,
    cards_considered: Number(options.cardsConsidered || 0),
    cards_used: profileEvidence.map((item) => item.source_id),
    answer_bank: false,
    broad_answer_bank: false,
    allowed_for_training: false,
    private_raw_data: false
  };
  packet.expressive_context_pack = buildExpressiveContextPack(query, packet.retrieved_evidence);
  return packet;
}

export async function buildExpressiveRagPacket(input, statePacket = null, options = {}) {
  const retriever = options.profileRetriever || new ProfileRetriever({
    cards: options.profileCards,
    topK: options.profileTopK || 4,
    minScore: options.profileMinScore
  });
  const profileEvidence = retriever.retrieveEvidence(input, {
    topK: options.profileTopK || 4,
    minScore: options.profileMinScore
  });
  const basePacket = options.baseEvidencePacket || createEvidencePacket({
    query: input,
    retrievedEvidence: [],
    statePacket
  });
  return mergeProfileEvidence(basePacket, profileEvidence, {
    query: input,
    statePacket,
    topK: options.topK || 6,
    cardsConsidered: retriever.cards.length
  });
}
