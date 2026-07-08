import { getSurfaceLengthPolicySummary, policyForSurfaceCategory } from "./surface_length_policy.ts";

export const R28SURF5_ANSWER_LENGTH_POLICY_VERSION = "r28surf5-answer-length-policy-v1";

function compactSpaces(text = "") {
  return String(text || "").replace(/\s+/g, " ").trim();
}

export function answerVisibleCharCount(text = "") {
  return Array.from(compactSpaces(text).replace(/\s/g, "")).length;
}

function sentenceUnits(text = "") {
  const cleaned = compactSpaces(text);
  if (!cleaned) return [];
  const matches = cleaned.match(/[^。！？!?]+[。！？!?]?/g) || [];
  return matches.map((item) => item.trim()).filter(Boolean);
}

function ensureTerminal(text = "") {
  const cleaned = compactSpaces(text);
  if (!cleaned) return "";
  return /[。！？!?]$/.test(cleaned) ? cleaned : `${cleaned}。`;
}

function clipByVisibleChars(text = "", maxChars = 160) {
  const cleaned = compactSpaces(text);
  if (answerVisibleCharCount(cleaned) <= maxChars) return cleaned;
  let visible = 0;
  let out = "";
  for (const char of Array.from(cleaned)) {
    if (!/\s/.test(char)) visible += 1;
    if (visible > maxChars) break;
    out += char;
  }
  return ensureTerminal(out.replace(/[，、；;：:,.]+$/g, ""));
}

export function applyAnswerLengthPolicy(answer = "", category = "model_draft", options = {}) {
  const policy = policyForSurfaceCategory(category);
  const maxSentences = Number(options.sentence_max || policy.sentence_max || 4);
  const maxChars = Number(options.max_chars || policy.max_chars || 160);
  const before = compactSpaces(answer);
  let units = sentenceUnits(before);
  if (units.length > maxSentences) units = units.slice(0, maxSentences);
  let after = units.length ? units.join("") : before;
  after = clipByVisibleChars(after, maxChars);
  if (after && !/[。！？!?]$/.test(after) && category !== "model_draft") after = ensureTerminal(after);
  const charCount = answerVisibleCharCount(after);
  return {
    text: after,
    length_policy: {
      ...getSurfaceLengthPolicySummary(category),
      policy_version: R28SURF5_ANSWER_LENGTH_POLICY_VERSION,
      chars: charCount,
      sentence_count: sentenceUnits(after).length,
      trimmed: before !== after
    }
  };
}

export function enforceAnswerLengthPolicy(answer = "", category = "model_draft", options = {}) {
  return applyAnswerLengthPolicy(answer, category, options).text;
}

export function trimAcceptedOpenAnswer(answer = "") {
  return applyAnswerLengthPolicy(answer, "q4_accepted_open_answer");
}
