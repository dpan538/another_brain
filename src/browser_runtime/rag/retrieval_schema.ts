export const TRUST_LEVELS = Object.freeze(["high", "medium", "low"]);
export const EVIDENCE_STATUSES = Object.freeze(["sufficient", "insufficient", "conflicting", "irrelevant"]);
export const ANSWER_POLICY_HINTS = Object.freeze([
  "answer",
  "refuse",
  "challenge_premise",
  "ask_clarifying",
  "identify_conflict"
]);

export const EVIDENCE_PACKET_SCHEMA = Object.freeze({
  query: "string",
  retrieved_evidence: [
    {
      source_id: "string",
      title: "string",
      text: "string",
      trust_level: "high | medium | low",
      retrieval_score: "number",
      license_or_origin: "string",
      can_answer: "boolean"
    }
  ],
  evidence_status: "sufficient | insufficient | conflicting | irrelevant",
  answer_policy_hint: "answer | refuse | challenge_premise | ask_clarifying | identify_conflict"
});

export function normalizeTrustLevel(value) {
  return TRUST_LEVELS.includes(value) ? value : "low";
}

export function validateEvidenceItem(item) {
  const failures = [];
  for (const key of ["source_id", "title", "text", "license_or_origin"]) {
    if (typeof item?.[key] !== "string" || !item[key].trim()) failures.push(`evidence_${key}_missing`);
  }
  if (!TRUST_LEVELS.includes(item?.trust_level)) failures.push("evidence_trust_level_invalid");
  if (typeof item?.retrieval_score !== "number" || Number.isNaN(item.retrieval_score)) {
    failures.push("evidence_retrieval_score_invalid");
  }
  if (typeof item?.can_answer !== "boolean") failures.push("evidence_can_answer_invalid");
  return failures;
}

export function validateEvidencePacket(packet) {
  const failures = [];
  if (typeof packet?.query !== "string") failures.push("query_missing");
  if (!Array.isArray(packet?.retrieved_evidence)) failures.push("retrieved_evidence_not_array");
  else {
    for (const item of packet.retrieved_evidence) failures.push(...validateEvidenceItem(item));
  }
  if (!EVIDENCE_STATUSES.includes(packet?.evidence_status)) failures.push("evidence_status_invalid");
  if (!ANSWER_POLICY_HINTS.includes(packet?.answer_policy_hint)) failures.push("answer_policy_hint_invalid");
  return { ok: failures.length === 0, failures };
}
