import { normalizeTrustLevel, validateEvidencePacket } from "./retrieval_schema.ts";
import {
  classifyEvidenceStatus,
  evidenceContainsInstructionInjection,
  evidenceHasConflict
} from "./evidence_status.ts";

export { evidenceContainsInstructionInjection, evidenceHasConflict };

export function normalizeEvidenceItem(item, index = 0) {
  return {
    source_id: String(item.source_id || item.id || `demo_source_${index}`),
    title: String(item.title || "Untitled demo memory"),
    text: String(item.text || ""),
    trust_level: normalizeTrustLevel(item.trust_level),
    retrieval_score: Number(item.retrieval_score || item.score || 0),
    license_or_origin: String(item.license_or_origin || item.origin || "demo fixture"),
    origin: String(item.origin || item.license_or_origin || "demo fixture"),
    provenance: String(item.provenance || item.origin || item.license_or_origin || "demo fixture"),
    review_status: String(item.review_status || item.metadata?.review_status || "reviewed_demo_safe"),
    can_answer: item.can_answer !== false,
    allowed_for_training: false,
    metadata: item.metadata || {}
  };
}

export function classifyEvidence(query, evidence) {
  return classifyEvidenceStatus(query, evidence);
}

export function createEvidencePacket({ query, retrievedEvidence = [], statePacket = null }) {
  const evidence = retrievedEvidence.map((item, index) => normalizeEvidenceItem(item, index));
  const classification = classifyEvidence(query, evidence);
  const packet = {
    query: String(query || ""),
    retrieved_evidence: evidence,
    evidence_status: classification.evidence_status,
    answer_policy_hint: classification.answer_policy_hint,
    fallback_reason: classification.fallback_reason || "",
    evidence_summary: {
      top_score: Number(classification.top_score || 0),
      source_count: evidence.length,
      sources: classification.source_summary || []
    },
    local_only: true,
    same_origin_only: true,
    backend_retrieval: false,
    hosted_vector_store: false,
    external_storage_runtime: false
  };
  if (statePacket) packet.state_packet = statePacket;
  const validation = validateEvidencePacket(packet);
  if (!validation.ok) packet.schema_failures = validation.failures;
  return packet;
}
