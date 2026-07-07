export const R28GEN1_POLICY_VERSION = "r28gen1-deterministic-generation-policy-v1";

export const DEFAULT_R28GEN1_GENERATION_POLICY = Object.freeze({
  policy_version: R28GEN1_POLICY_VERSION,
  decoding: "greedy",
  max_new_tokens: 16,
  hard_max_new_tokens: 32,
  context_length_cap: 256,
  timeout_ms: 3000,
  repetition_limit: 4,
  max_output_chars: 900,
  no_hidden_prompt: true,
  no_cot_output: true,
  chinese_first: true,
  answer_bank: false,
  product_admission: false,
  browser_admission: false,
  release_checkpoint_admission: false
});

const BAD_TOKEN_TEXT = [
  "token_id:",
  "<hidden",
  "</hidden",
  "system prompt",
  "developer message",
  "chain-of-thought",
  "chain of thought",
  "hidden prompt",
  "思维链",
  "隐藏提示"
];

const GENERIC_BOILERPLATE = [
  /^as an ai language model,?\s*/i,
  /^i cannot answer that\.?\s*/i,
  /^static browser draft:\s*/i
];

function asNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeGenerationPolicy(options = {}) {
  const hardMax = Math.max(1, asNumber(options.hard_max_new_tokens ?? options.maxTokenCap, DEFAULT_R28GEN1_GENERATION_POLICY.hard_max_new_tokens));
  const requestedMax = asNumber(
    options.max_new_tokens ?? options.maxTokens,
    DEFAULT_R28GEN1_GENERATION_POLICY.max_new_tokens
  );
  return {
    ...DEFAULT_R28GEN1_GENERATION_POLICY,
    ...options.policy,
    decoding: "greedy",
    max_new_tokens: Math.max(1, Math.min(requestedMax, hardMax)),
    hard_max_new_tokens: hardMax,
    context_length_cap: Math.max(1, asNumber(options.contextLength ?? options.context_length_cap, DEFAULT_R28GEN1_GENERATION_POLICY.context_length_cap)),
    timeout_ms: Math.max(1, asNumber(options.timeoutMs ?? options.timeout_ms, DEFAULT_R28GEN1_GENERATION_POLICY.timeout_ms)),
    repetition_limit: Math.max(2, asNumber(options.repetitionLimit ?? options.repetition_limit, DEFAULT_R28GEN1_GENERATION_POLICY.repetition_limit)),
    max_output_chars: Math.max(80, asNumber(options.maxChars ?? options.max_output_chars, DEFAULT_R28GEN1_GENERATION_POLICY.max_output_chars)),
    answer_bank: false,
    product_admission: false,
    browser_admission: false,
    release_checkpoint_admission: false
  };
}

export function isBadTokenText(token) {
  const lowered = String(token || "").toLowerCase();
  return BAD_TOKEN_TEXT.some((marker) => lowered.includes(marker));
}

export function isTokenIdOnlyOutput(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  return /^(token_id:\d+\s*)+$/i.test(value) || /^(\d+[\s,;|]*){3,}$/.test(value);
}

export function stripGenericBoilerplate(text) {
  let output = String(text || "").trim();
  for (const pattern of GENERIC_BOILERPLATE) output = output.replace(pattern, "").trim();
  return output;
}

function hasSevereCharacterRepetition(text) {
  return /(.)\1{7,}/u.test(String(text || ""));
}

function hasWordRepetition(tokens, limit) {
  let previous = "";
  let count = 0;
  for (const token of tokens || []) {
    const value = String(token || "").trim();
    if (!value) continue;
    if (value === previous) count += 1;
    else count = 1;
    previous = value;
    if (count >= limit) return true;
  }
  return false;
}

export function detectOutputQualityFailure(text, options = {}) {
  const policy = normalizeGenerationPolicy(options);
  const draft = String(text || "").trim();
  const lowered = draft.toLowerCase();
  if (!draft) return "empty_output";
  if (draft.length > policy.max_output_chars) return "overlong_output";
  if (isTokenIdOnlyOutput(draft)) return "token_id_only_output";
  if (isBadTokenText(draft)) return "hidden_prompt_or_cot_marker";
  if (hasSevereCharacterRepetition(draft)) return "repetition_guard";
  if (options.quality_status === "quality_not_ready") return "low_confidence_gibberish";
  return "";
}

export function applyGenerationGuards({ tokens = [], draft = "", runtimeStats = {}, policy = null } = {}) {
  const normalizedPolicy = policy || normalizeGenerationPolicy();
  const keptTokens = [];
  const failures = [];
  for (const token of tokens || []) {
    if (isBadTokenText(token)) {
      failures.push("bad_token_suppressed");
      continue;
    }
    keptTokens.push(token);
  }
  if (hasWordRepetition(keptTokens, normalizedPolicy.repetition_limit)) failures.push("repetition_guard");
  const text = stripGenericBoilerplate(String(draft || keptTokens.join(" ")).replace(/\s+/g, " ").trim());
  const qualityFailure = detectOutputQualityFailure(text, {
    policy: normalizedPolicy,
    quality_status: runtimeStats.quality_status
  });
  if (qualityFailure) failures.push(qualityFailure);
  return {
    ok: failures.length === 0,
    failures: Array.from(new Set(failures)),
    tokens: keptTokens,
    draft: text,
    fallback_recommended: failures.length > 0
  };
}
