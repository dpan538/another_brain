export const R28HOTFIX2_IDENTITY_ROUTE_VERSION = "r28hotfix2-identity-route-v1";

export const IDENTITY_ROUTE = "identity_boundary";

export const IDENTITY_ANSWER =
  "你可以叫我鳄鱼。";

const CHINESE_IDENTITY_PATTERNS = [
  "你是谁",
  "你是什么",
  "介绍一下你自己",
  "自我介绍",
  "你叫什么"
];

const ENGLISH_IDENTITY_PATTERNS = [
  "who are you",
  "what are you",
  "what is your name",
  "introduce yourself"
];

function normalizeIdentityInput(input = "") {
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/[\s?？!！。.,，、:：;；"'“”‘’（）()]/g, "");
}

export function isIdentityQuestion(input = "") {
  const raw = String(input || "").trim().toLowerCase();
  const normalized = normalizeIdentityInput(raw);
  if (!normalized) return false;
  if (normalized.length <= 24 && CHINESE_IDENTITY_PATTERNS.some((marker) => normalized.includes(normalizeIdentityInput(marker)))) {
    return true;
  }
  if (raw.length <= 56 && ENGLISH_IDENTITY_PATTERNS.some((marker) => raw.includes(marker))) {
    return true;
  }
  return false;
}

export function buildIdentityRouteOutput() {
  return {
    route: IDENTITY_ROUTE,
    use_model_draft: false,
    final_answer: IDENTITY_ANSWER,
    fallback_reason: "identity_boundary",
    quality_flags: ["identity_boundary"],
    answer_bank: false
  };
}
