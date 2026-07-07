const GENERIC_ASSISTANT_PREFIXES = Object.freeze([
  "as an ai language model",
  "as a language model",
  "i am an ai assistant",
  "作为一个ai语言模型",
  "作为一个 ai 语言模型",
  "作为人工智能"
]);

const MALICIOUS_FAILURES = Object.freeze([
  "evidence_hidden_prompt_request",
  "evidence_instruction_injection",
  "evidence_policy_refuse",
  "hidden_prompt_disclosure_marker"
]);

const INSUFFICIENT_FAILURES = Object.freeze([
  "empty_evidence",
  "insufficient_evidence",
  "irrelevant_evidence"
]);

function compactText(value, maxChars = 420) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

function failureSet(verifierResult = {}, generation = {}) {
  return new Set([
    ...((verifierResult && verifierResult.failures) || []),
    generation.fallback_reason || "",
    generation.quality_status === "quality_not_ready" ? "quality_not_ready" : "",
    generation.needs_fallback ? "generation_policy_fallback" : ""
  ].filter(Boolean));
}

export function trimGenericAssistantBoilerplate(text) {
  let cleaned = compactText(text, 900);
  const lowered = cleaned.toLowerCase();
  for (const marker of GENERIC_ASSISTANT_PREFIXES) {
    if (lowered.startsWith(marker)) {
      const commaIndex = cleaned.indexOf(",");
      const chineseCommaIndex = cleaned.indexOf("，");
      const cutIndex = [commaIndex, chineseCommaIndex].filter((index) => index >= 0).sort((a, b) => a - b)[0];
      cleaned = cutIndex >= 0 ? cleaned.slice(cutIndex + 1).trim() : cleaned.replace(new RegExp(`^${marker}`, "i"), "").trim();
      break;
    }
  }
  return cleaned;
}

export function isTokenIdOnlyOutput(text) {
  const cleaned = String(text || "").trim();
  if (!cleaned) return false;
  return /^(token_id:\d+|\d+)(\s+(token_id:\d+|\d+))*$/i.test(cleaned);
}

export function looksLikeGibberish(text) {
  const cleaned = String(text || "").trim();
  if (!cleaned) return true;
  if (isTokenIdOnlyOutput(cleaned)) return true;
  if (/[�\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(cleaned)) return true;
  if (/(.)\1{7,}/u.test(cleaned)) return true;
  const visible = cleaned.replace(/\s+/g, "");
  if (visible.length >= 8) {
    const cjk = (visible.match(/[\u3400-\u9FFF]/g) || []).length;
    const latin = (visible.match(/[a-zA-Z]/g) || []).length;
    const digits = (visible.match(/[0-9]/g) || []).length;
    const punctuation = (visible.match(/[，。！？、,.!?;:()（）\-]/g) || []).length;
    const readableRatio = (cjk + latin + digits + punctuation) / visible.length;
    if (readableRatio < 0.45) return true;
  }
  return false;
}

function evidenceStatus(evidencePacket = {}) {
  return evidencePacket.evidence_status || "insufficient";
}

function fallbackForReason(input, reason, evidencePacket = {}) {
  const query = compactText(input, 120);
  const status = evidenceStatus(evidencePacket);
  if (reason === "malicious_evidence") {
    return "已忽略不可信证据：证据中包含试图覆盖系统/运行策略、索要隐藏提示或要求输出内部消息的内容。当前静态运行时不会照做；请提供只包含事实线索的本地证据。";
  }
  if (reason === "insufficient_evidence") {
    return `证据不足：当前本地证据不足以可靠回答${query ? `“${query}”` : "这个问题"}。可以补充更具体的本地上下文或证据后再试。`;
  }
  if (reason === "conflicting_evidence") {
    return "证据冲突：当前检索到的本地证据互相矛盾，不能把其中一条当成最终答案。请先确认哪条证据更新或更可信。";
  }
  if (reason === "token_id_only") {
    return "当前静态小模型只返回了 token id，未形成可读答案。已切换到确定性边界：不把 token id 当作用户答案，也不编造缺失事实。";
  }
  if (reason === "lossy_decode") {
    return "当前解码路径不是精确 tokenizer 主路径，输出仅可作调试参考。为了避免误导，答案保持在证据边界内，不扩写未知事实。";
  }
  if (reason === "gibberish_or_empty") {
    return "当前静态小模型输出不稳定或为空，已切换到确定性回答边界：只依据本地证据回答；证据不足时直说证据不足。";
  }
  if (status === "insufficient") return fallbackForReason(input, "insufficient_evidence", evidencePacket);
  return "当前静态运行时未能生成稳定答案。请保留本地证据边界后重试；系统不会调用后端、外部 LLM 或训练流程补全。";
}

export function classifyAnswerSurface(draft, { evidencePacket = {}, verifierResult = {}, generation = {} } = {}) {
  const failures = failureSet(verifierResult, generation);
  if ([...MALICIOUS_FAILURES].some((failure) => failures.has(failure))) return "malicious_evidence";
  if (evidencePacket.answer_policy_hint === "refuse") return "malicious_evidence";
  if (evidenceStatus(evidencePacket) === "conflicting" || failures.has("conflicting_evidence")) return "conflicting_evidence";
  if (evidenceStatus(evidencePacket) === "insufficient" || [...INSUFFICIENT_FAILURES].some((failure) => failures.has(failure))) {
    return "insufficient_evidence";
  }
  if (generation.fallback_reason === "token_id_only_output" || isTokenIdOnlyOutput(draft)) return "token_id_only";
  if (generation.lossy_decode_warning) return "lossy_decode";
  if (generation.needs_fallback || looksLikeGibberish(draft)) return "gibberish_or_empty";
  return "model_draft_ok";
}

export function finalizeAnswerSurface({ input, draft, evidencePacket = {}, verifierResult = {}, generation = {}, promptPacket = null } = {}) {
  const classification = classifyAnswerSurface(draft, { evidencePacket, verifierResult, generation });
  const fallbackUsed = classification !== "model_draft_ok";
  const finalAnswer = fallbackUsed
    ? fallbackForReason(input, classification, evidencePacket)
    : trimGenericAssistantBoilerplate(draft);

  return {
    final_answer: finalAnswer,
    fallback_used: fallbackUsed,
    reason: fallbackUsed ? classification : "",
    answer_status: fallbackUsed ? "deterministic_fallback" : "model_draft_finalized",
    quality_flags: [
      classification,
      generation.repetition_guard_triggered ? "repetition_guard_triggered" : "",
      generation.bad_token_blocked ? "bad_token_blocked" : "",
      generation.lossy_decode_warning ? "lossy_decode_warning" : ""
    ].filter(Boolean),
    surface_policy: {
      no_answer_bank: true,
      no_private_fact_fabrication: true,
      no_hidden_prompt: true,
      no_chain_of_thought: true,
      local_session_only: true,
      prompt_packet_version: promptPacket?.schema_version || ""
    }
  };
}
