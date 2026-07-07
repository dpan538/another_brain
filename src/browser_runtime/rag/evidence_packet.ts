import { normalizeTrustLevel, validateEvidencePacket } from "./retrieval_schema.ts";
import { evidenceGuardMetadata, guardEvidenceRecords } from "../security/evidence_injection_guard.ts";

const MALICIOUS_EVIDENCE_MARKERS = [
  "ignore previous instructions",
  "ignore the previous instructions",
  "reveal hidden prompt",
  "show the hidden prompt",
  "system prompt",
  "developer message",
  "chain-of-thought",
  "<hidden"
];

export function normalizeEvidenceItem(item, index = 0) {
  return {
    source_id: String(item.source_id || item.id || `demo_source_${index}`),
    title: String(item.title || "Untitled demo memory"),
    text: String(item.text || ""),
    trust_level: normalizeTrustLevel(item.trust_level),
    retrieval_score: Number(item.retrieval_score || item.score || 0),
    license_or_origin: String(item.license_or_origin || item.origin || "demo fixture"),
    can_answer: item.can_answer !== false,
    metadata: item.metadata || {}
  };
}

export function evidenceContainsInstructionInjection(evidence) {
  return guardEvidenceRecords(evidence || []).rejected_count > 0;
}

export function evidenceHasConflict(evidence) {
  const groups = new Map();
  for (const item of evidence || []) {
    const group = item.metadata?.conflict_group;
    const value = item.metadata?.claim_value;
    if (!group || value === undefined || value === null) continue;
    if (!groups.has(group)) groups.set(group, new Set());
    groups.get(group).add(String(value));
  }
  return Array.from(groups.values()).some((values) => values.size > 1);
}

export function classifyEvidence(query, evidence) {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery || evidence.length === 0) {
    return { evidence_status: "insufficient", answer_policy_hint: "ask_clarifying" };
  }
  if (evidenceHasConflict(evidence)) {
    return { evidence_status: "conflicting", answer_policy_hint: "identify_conflict" };
  }
  if (evidenceContainsInstructionInjection(evidence)) {
    return { evidence_status: "sufficient", answer_policy_hint: "refuse" };
  }
  if (!evidence.some((item) => item.can_answer)) {
    return { evidence_status: "insufficient", answer_policy_hint: "ask_clarifying" };
  }
  if (Math.max(...evidence.map((item) => Number(item.retrieval_score || 0))) <= 0) {
    return { evidence_status: "irrelevant", answer_policy_hint: "ask_clarifying" };
  }
  return { evidence_status: "sufficient", answer_policy_hint: "answer" };
}

export function createEvidencePacket({ query, retrievedEvidence = [], statePacket = null }) {
  const rawGuard = guardEvidenceRecords(retrievedEvidence);
  const normalizedEvidence = rawGuard.safe_evidence.map((item, index) => normalizeEvidenceItem(item, index));
  const normalizedGuard = guardEvidenceRecords(normalizedEvidence);
  const guard = {
    ...normalizedGuard,
    rejected_count: rawGuard.rejected_count + normalizedGuard.rejected_count,
    rejected_evidence: [...rawGuard.rejected_evidence, ...normalizedGuard.rejected_evidence],
    failures: Array.from(new Set([...rawGuard.failures, ...normalizedGuard.failures])),
    warnings: Array.from(new Set([...rawGuard.warnings, ...normalizedGuard.warnings])),
    forced_refusal: (rawGuard.forced_refusal && normalizedEvidence.length === 0) || normalizedGuard.forced_refusal,
    malicious_evidence_ignored: rawGuard.malicious_evidence_ignored || normalizedGuard.malicious_evidence_ignored,
    hidden_prompt_disclosure_rejected: rawGuard.hidden_prompt_disclosure_rejected || normalizedGuard.hidden_prompt_disclosure_rejected
  };
  const evidence = guard.safe_evidence;
  const classification = guard.forced_refusal
    ? { evidence_status: "insufficient", answer_policy_hint: "refuse" }
    : classifyEvidence(query, evidence);
  const packet = {
    query: String(query || ""),
    retrieved_evidence: evidence,
    evidence_status: classification.evidence_status,
    answer_policy_hint: classification.answer_policy_hint,
    local_only: true,
    same_origin_only: true,
    backend_retrieval: false,
    hosted_vector_store: false,
    external_storage_runtime: false,
    security_guard: evidenceGuardMetadata(guard)
  };
  if (statePacket) packet.state_packet = statePacket;
  const validation = validateEvidencePacket(packet);
  if (!validation.ok) packet.schema_failures = validation.failures;
  return packet;
}
