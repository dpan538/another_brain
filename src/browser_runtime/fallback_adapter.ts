export function buildFallbackAnswer(input, reason = "runtime_unavailable") {
  const trimmed = String(input || "").trim();
  return {
    fallback_used: true,
    reason,
    final_answer: `静态 fallback（${reason}）：${trimmed || "空输入"}`
  };
}
