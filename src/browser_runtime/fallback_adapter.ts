export function buildFallbackAnswer(input, reason = "runtime_unavailable") {
  const trimmed = String(input || "").trim();
  const suffix = trimmed ? `\n\n你的问题：${trimmed.slice(0, 120)}` : "";
  return {
    fallback_used: true,
    reason,
    fallback_reason: reason,
    answer_status: "fallback",
    chinese_first: true,
    no_answer_bank: true,
    final_answer: `当前静态运行未能安全完成回答，已使用本地 fallback。原因：${String(reason || "runtime_unavailable")}.${suffix}`
  };
}
