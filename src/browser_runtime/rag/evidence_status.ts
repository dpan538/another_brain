const MALICIOUS_EVIDENCE_MARKERS = [
  "ignore previous instructions",
  "ignore the previous instructions",
  "reveal hidden prompt",
  "show the hidden prompt",
  "system prompt",
  "developer message",
  "chain-of-thought",
  "chain of thought",
  "<hidden",
  "忽略前面的规则",
  "隐藏提示",
  "开发者消息",
  "系统提示"
];

export function evidenceContainsInstructionInjection(evidence = []) {
  return (evidence || []).some((item) => {
    const text = `${item.title || ""}\n${item.text || ""}`.toLowerCase();
    return item.metadata?.malicious_fixture === true
      || MALICIOUS_EVIDENCE_MARKERS.some((marker) => text.includes(marker));
  });
}

export function evidenceHasConflict(evidence = []) {
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

export function summarizeEvidenceSources(evidence = []) {
  return (evidence || []).slice(0, 5).map((item) => ({
    source_id: String(item.source_id || item.id || "local"),
    title: String(item.title || "local evidence").slice(0, 120),
    origin: String(item.origin || item.license_or_origin || "synthetic demo fixture"),
    provenance: String(item.provenance || item.license_or_origin || "synthetic demo fixture"),
    review_status: String(item.review_status || item.metadata?.review_status || "reviewed_demo_safe"),
    retrieval_score: Number(item.retrieval_score || 0)
  }));
}

export function classifyEvidenceStatus(query, evidence = [], options = {}) {
  const cleanQuery = String(query || "").trim();
  const minSufficientScore = Number(options.minSufficientScore ?? 0.08);
  const topScore = Math.max(0, ...evidence.map((item) => Number(item.retrieval_score || 0)));
  if (!cleanQuery || evidence.length === 0) {
    return {
      evidence_status: "insufficient",
      answer_policy_hint: "ask_clarifying",
      fallback_reason: "insufficient_evidence",
      top_score: topScore,
      source_summary: []
    };
  }
  if (evidenceContainsInstructionInjection(evidence)) {
    return {
      evidence_status: "malicious",
      answer_policy_hint: "ignore_untrusted_instruction",
      fallback_reason: "malicious_evidence_ignored",
      top_score: topScore,
      source_summary: summarizeEvidenceSources(evidence)
    };
  }
  if (evidenceHasConflict(evidence)) {
    return {
      evidence_status: "conflicting",
      answer_policy_hint: "identify_conflict",
      fallback_reason: "conflicting_evidence",
      top_score: topScore,
      source_summary: summarizeEvidenceSources(evidence)
    };
  }
  if (!evidence.some((item) => item.can_answer !== false)) {
    return {
      evidence_status: "insufficient",
      answer_policy_hint: "ask_clarifying",
      fallback_reason: "no_answerable_evidence",
      top_score: topScore,
      source_summary: summarizeEvidenceSources(evidence)
    };
  }
  if (topScore < minSufficientScore) {
    return {
      evidence_status: "insufficient",
      answer_policy_hint: "ask_clarifying",
      fallback_reason: "retrieval_score_below_threshold",
      top_score: topScore,
      source_summary: summarizeEvidenceSources(evidence)
    };
  }
  return {
    evidence_status: "sufficient",
    answer_policy_hint: "answer_with_evidence",
    fallback_reason: "",
    top_score: topScore,
    source_summary: summarizeEvidenceSources(evidence)
  };
}
