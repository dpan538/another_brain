export function buildFallbackAnswer(input, reason = "runtime_unavailable") {
  return {
    fallback_used: true,
    reason,
    final_answer: `Static fallback (${reason}): local static guard could not produce a grounded answer.`
  };
}
