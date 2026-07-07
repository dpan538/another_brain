const HIDDEN_MARKERS = ["system prompt", "hidden prompt", "<hidden", "chain-of-thought"];
const GENERIC_FALLBACK_MARKERS = ["as an ai language model", "i cannot answer that"];
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

function verifyEvidencePacket(evidencePacket) {
  const failures = [];
  if (!evidencePacket) return failures;
  const evidence = evidencePacket.retrieved_evidence || [];
  if (!Array.isArray(evidence) || evidence.length === 0) failures.push("empty_evidence");
  if (evidencePacket.evidence_status === "insufficient") failures.push("insufficient_evidence");
  if (evidencePacket.evidence_status === "conflicting") failures.push("conflicting_evidence");
  if (evidencePacket.evidence_status === "irrelevant") failures.push("irrelevant_evidence");
  if (evidencePacket.answer_policy_hint === "refuse") failures.push("evidence_policy_refuse");
  if (evidencePacket.security_guard?.hidden_prompt_disclosure_rejected) failures.push("evidence_hidden_prompt_request");
  for (const item of evidence) {
    const text = `${item.title || ""}\n${item.text || ""}`.toLowerCase();
    if (MALICIOUS_EVIDENCE_MARKERS.some((marker) => text.includes(marker))) {
      failures.push(text.includes("hidden prompt") ? "evidence_hidden_prompt_request" : "evidence_instruction_injection");
      break;
    }
  }
  return failures;
}

export function verifyDraft(draft, options = {}) {
  const text = String(draft || "");
  const lowered = text.toLowerCase();
  const maxChars = Number(options.maxChars || 1200);
  const failures = [];
  failures.push(...verifyEvidencePacket(options.evidencePacket || options.retrievalPacket));
  if (!text.trim()) failures.push("empty_output");
  if (text.length > maxChars) failures.push("overlong_output");
  if (HIDDEN_MARKERS.some((marker) => lowered.includes(marker))) failures.push("hidden_prompt_disclosure_marker");
  if (GENERIC_FALLBACK_MARKERS.some((marker) => lowered.includes(marker))) failures.push("generic_fallback_marker");
  return {
    passed: failures.length === 0,
    failures,
    fallback_recommended: failures.length > 0
  };
}

export function finalizeDraft(draft, verifierResult) {
  if (!verifierResult.passed) return "";
  return String(draft || "").trim();
}
