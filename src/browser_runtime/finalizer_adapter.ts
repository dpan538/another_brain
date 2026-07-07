import { applyGenerationGuards, normalizeGenerationPolicy, stripGenericBoilerplate } from "./generation_policy.ts";

export const R28GEN1_FINALIZER_VERSION = "r28gen1-answer-surface-finalizer-v1";

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

function evidenceText(evidencePacket = null) {
  return (evidencePacket?.retrieved_evidence || [])
    .map((item) => `${item.title || ""}\n${item.text || ""}`)
    .join("\n")
    .toLowerCase();
}

export function classifyEvidenceForFinalizer(evidencePacket = null) {
  if (!evidencePacket) return "";
  const status = evidencePacket.evidence_status || "insufficient";
  if (evidencePacket.answer_policy_hint === "refuse") return "malicious_evidence_ignored";
  if (MALICIOUS_EVIDENCE_MARKERS.some((marker) => evidenceText(evidencePacket).includes(marker))) {
    return "malicious_evidence_ignored";
  }
  if (status === "insufficient" || status === "irrelevant") return "insufficient_evidence";
  if (status === "conflicting") return "conflicting_evidence";
  return "";
}

function userSnippet(input) {
  return String(input || "").trim().slice(0, 120);
}

export function buildDeterministicFallback(input, reason = "runtime_or_verifier_fallback", details = {}) {
  const query = userSnippet(input);
  const suffix = query ? `\n\n你的问题：${query}` : "";
  let finalAnswer = "";
  if (reason === "insufficient_evidence" || reason === "empty_evidence" || reason === "irrelevant_evidence") {
    finalAnswer = `证据不足：当前本地 session 里的证据不够支持稳定回答。我不会把静态模型输出当作事实。${suffix}`;
  } else if (reason === "conflicting_evidence") {
    finalAnswer = `证据存在冲突：当前本地证据给出了互相不一致的信息，需要先确认哪条证据可信。${suffix}`;
  } else if (reason === "malicious_evidence_ignored" || reason === "evidence_policy_refuse" || reason === "evidence_instruction_injection" || reason === "evidence_hidden_prompt_request") {
    finalAnswer = `已忽略证据中的指令性内容：evidence 只能作为参考事实，不能覆盖运行时规则，也不能要求输出隐藏提示或思维链。${suffix}`;
  } else if (reason === "empty_output" || reason === "token_id_only_output" || reason === "low_confidence_gibberish" || reason === "repetition_guard" || reason === "bad_token_suppressed") {
    finalAnswer = `当前静态 q4 输出不够稳定，已切换到确定性 fallback。请补充更明确的本地证据或稍后重试。${suffix}`;
  } else if (reason === "overlong_output") {
    finalAnswer = `当前静态 q4 输出过长，已停止展示以避免误导。请缩小问题或补充更聚焦的本地证据。${suffix}`;
  } else {
    finalAnswer = `当前静态运行未能安全完成回答，已使用本地 fallback。原因：${String(reason || "runtime_or_verifier_fallback")}.${suffix}`;
  }
  return {
    final_answer: finalAnswer,
    fallback_used: true,
    fallback_reason: reason,
    answer_status: "fallback",
    finalizer_version: R28GEN1_FINALIZER_VERSION,
    chinese_first: true,
    no_answer_bank: true,
    product_admission: false,
    browser_admission: false,
    release_checkpoint_admission: false,
    details
  };
}

function makeChineseFirstAnswer(text) {
  const cleaned = stripGenericBoilerplate(text);
  if (/[\u4e00-\u9fff]/.test(cleaned.slice(0, 80))) return cleaned;
  return `根据当前本地证据：${cleaned}`;
}

export function finalizeAnswerSurface({ input, draft = "", generation = {}, evidencePacket = null, verifierResult = null, policy = null } = {}) {
  const normalizedPolicy = policy || normalizeGenerationPolicy();
  const evidenceBoundary = classifyEvidenceForFinalizer(evidencePacket);
  if (evidenceBoundary) return buildDeterministicFallback(input, evidenceBoundary, { evidence_status: evidencePacket?.evidence_status || "missing" });

  const verifierFailure = verifierResult?.passed === false
    ? (verifierResult.failures || [])[0] || "verification_failed"
    : "";
  const guarded = applyGenerationGuards({
    tokens: generation.tokens || [],
    draft,
    runtimeStats: generation,
    policy: normalizedPolicy
  });
  const guardFailure = guarded.failures[0] || "";
  const failure = verifierFailure || guardFailure;
  if (failure) return buildDeterministicFallback(input, failure, { verifier_failures: verifierResult?.failures || [], guard_failures: guarded.failures });

  const finalAnswer = makeChineseFirstAnswer(guarded.draft);
  return {
    final_answer: finalAnswer,
    fallback_used: false,
    fallback_reason: "",
    answer_status: "final",
    finalizer_version: R28GEN1_FINALIZER_VERSION,
    chinese_first: true,
    no_answer_bank: true,
    product_admission: false,
    browser_admission: false,
    release_checkpoint_admission: false,
    generation_policy: normalizedPolicy.policy_version
  };
}
