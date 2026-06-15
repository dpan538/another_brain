export function buildRouteTrace({
  query = "",
  questionLike = false,
  domain = "",
  questionType = "",
  operation = "",
  entityHits = [],
  workHits = [],
  sessionMemoryHits = [],
  answerSource = "",
  draftAnswer = "",
  verifierReasons = [],
  fallbackFirewall = null,
  finalAnswer = ""
} = {}) {
  return {
    query,
    question_like: Boolean(questionLike),
    domain,
    question_type: questionType,
    operation,
    entity_hits: entityHits,
    work_hits: workHits,
    session_memory_hits: sessionMemoryHits,
    answer_source: answerSource,
    draft_answer: draftAnswer,
    verifier_reasons: verifierReasons,
    fallback_firewall: fallbackFirewall || {
      checked: false,
      allowed: true,
      reason: "",
      replacement_policy: ""
    },
    final_answer: finalAnswer
  };
}
