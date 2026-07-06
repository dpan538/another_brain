export function buildFallbackAnswer(input, reason = "runtime_unavailable") {
  const trimmed = String(input || "").trim();
  return {
    fallback_used: true,
    reason,
    final_answer: `Static fallback (${reason}): ${trimmed || "empty input"}`
  };
}
