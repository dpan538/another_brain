import { GENERIC_FALLBACK_TEXTS } from "./fallback_registry.js";

export { GENERIC_FALLBACK_TEXTS };

export function normalizeFallbackText(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[。.!！?？]+$/g, "");
}

export function isBareGenericFallback(answer) {
  const normalized = normalizeFallbackText(answer);
  return Object.values(GENERIC_FALLBACK_TEXTS).some((text) => normalized === normalizeFallbackText(text));
}

export function bareFallbackId(answer) {
  const normalized = normalizeFallbackText(answer);
  for (const [id, text] of Object.entries(GENERIC_FALLBACK_TEXTS)) {
    if (normalized === normalizeFallbackText(text)) return id;
  }
  return "";
}

export function mentionsGenericFallback(answer) {
  const text = String(answer || "");
  return Object.entries(GENERIC_FALLBACK_TEXTS)
    .filter(([, phrase]) => {
      const trimmed = phrase.replace(/[。.!！?？]+$/g, "");
      return text.includes(phrase) || text.includes(trimmed);
    })
    .map(([id]) => id);
}

export function hasNamedClarificationAlternatives(answer) {
  const text = String(answer || "");
  return (
    /(还是|或者|是问|你是问).{1,40}(，|,|还是|或者)/.test(text) ||
    /A.*B|第一.*第二|作者.*作品|专辑.*标题曲|人物.*作品/.test(text)
  );
}

export function isRepairQuoteAllowed({ answer, questionType = "", operation = "", lastAssistantAnswer = "" }) {
  const text = String(answer || "");
  const isRepair =
    questionType === "fallback_repair" ||
    operation === "repair_previous_bad_fallback" ||
    operation === "clarification_loop_repair" ||
    /刚才|上一句|我刚刚|前面/.test(text);

  const admitsBadFallback = /不该|答偏|没接住|反问太空|不应该只说|不该只问|这句不够|不够具体/.test(text);
  const givesReplacement = /可以直接问|这里应该|你问的是|不是事件|不是缺提问|更准确|具体选项/.test(text);
  const hasBadPrevious = Boolean(bareFallbackId(lastAssistantAnswer)) || mentionsGenericFallback(lastAssistantAnswer).length > 0;

  return isRepair && admitsBadFallback && givesReplacement && hasBadPrevious;
}

export function classifyFallbackShape({ answer, questionType = "", operation = "", lastAssistantAnswer = "" }) {
  const id = bareFallbackId(answer);
  if (id) {
    return {
      kind: "bare_generic_fallback",
      fallback_id: id,
      fallback_ids: [id],
      allowed: false,
      exemption: "none"
    };
  }

  const mentioned = mentionsGenericFallback(answer);

  if (mentioned.length && isRepairQuoteAllowed({ answer, questionType, operation, lastAssistantAnswer })) {
    return {
      kind: "repair_quote",
      fallback_ids: mentioned,
      allowed: true,
      exemption: "repair_quote"
    };
  }

  if (mentioned.includes("which_side") && hasNamedClarificationAlternatives(answer)) {
    return {
      kind: "specific_clarification",
      fallback_ids: mentioned,
      allowed: true,
      exemption: "named_alternatives"
    };
  }

  if (mentioned.length) {
    return {
      kind: "generic_fallback_mentioned_without_repair",
      fallback_ids: mentioned,
      allowed: false,
      exemption: "none"
    };
  }

  return {
    kind: "normal_answer",
    fallback_ids: [],
    allowed: true,
    exemption: "none"
  };
}
