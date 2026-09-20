export const ANSWER_LATENCY_PROFILE = Object.freeze({
  answerSlaMsLoadedPage: 3000,
  fastPathTargetMs: 300,
  standardPathTargetMs: 1200,
  fullProfileTargetMs: 3000,
  visibleThinkingAllowed: true,
  thinkingNotChainOfThought: true
});

export const THINKING_PROFILES = Object.freeze({
  instant: Object.freeze({
    name: "instant",
    mode: "instant",
    targetMs: 120,
    delayMs: 80,
    visibleThinking: false
  }),
  fast: Object.freeze({
    name: "fast",
    mode: "fast",
    targetMs: ANSWER_LATENCY_PROFILE.fastPathTargetMs,
    delayMs: 260,
    visibleThinking: true
  }),
  standard: Object.freeze({
    name: "standard",
    mode: "normal",
    targetMs: ANSWER_LATENCY_PROFILE.standardPathTargetMs,
    delayMs: 680,
    visibleThinking: true
  }),
  deep: Object.freeze({
    name: "deep",
    mode: "deep",
    targetMs: 2200,
    delayMs: 1320,
    visibleThinking: true
  }),
  full: Object.freeze({
    name: "full",
    mode: "full",
    targetMs: ANSWER_LATENCY_PROFILE.fullProfileTargetMs,
    delayMs: 2600,
    visibleThinking: true,
    requiresWebGpu: true
  })
});

const INSTANT_PATTERN = /(你好|hi\b|hello\b|你是谁|隐私|地址|电话|邮箱|身份证|银行卡|完整歌词|全文|原文)/i;
const FAST_PATTERN = /(几个|多少|等于|加|减|乘|除|周[一二三四五六日天]|直接事实|在哪里读|做哪些方向)/i;
const STANDARD_PATTERN = /(这首|这本|这个|那他|第一首|第一本|继续|再展开|为什么重要|从哪里开始|代表作|有哪些)/i;
const DEEP_PATTERN = /(比较|差在哪|共同点|关系|怎么发展|从古典到现代|跨领域|华语流行音乐和日本文学|谁更冷|为什么会)/i;

function normalize(value) {
  return String(value || "").trim();
}

function profileWithReason(name, reason, extras = {}) {
  const base = THINKING_PROFILES[name] || THINKING_PROFILES.standard;
  return {
    ...base,
    reason,
    answerSlaMs: ANSWER_LATENCY_PROFILE.answerSlaMsLoadedPage,
    thinkingNotChainOfThought: ANSWER_LATENCY_PROFILE.thinkingNotChainOfThought,
    ...extras
  };
}

export function selectThinkingProfile({
  query,
  taskType = "",
  runtimeProfile = "standard",
  webgpuAvailable = false,
  repeated = false,
  relatedIdentity = false
} = {}) {
  const text = normalize(query);
  const task = normalize(taskType);
  const runtime = normalize(runtimeProfile) || "standard";

  if (runtime === "personal_200m" || runtime === "full") {
    if (webgpuAvailable) return profileWithReason("full", "full_profile_webgpu");
    return profileWithReason("standard", "full_profile_fallback_without_webgpu", {
      degradedFrom: runtime,
      fallbackRequired: true
    });
  }

  if (repeated || relatedIdentity) return profileWithReason("deep", repeated ? "repeated_prompt" : "related_identity");

  if (/solver|arithmetic|syllogism|transitive|personal_fact|privacy|copyright/.test(task)) {
    return profileWithReason(task.includes("privacy") || task.includes("copyright") ? "instant" : "fast", "deterministic_or_boundary");
  }

  if (/culture_compare|cross_domain|ambiguous_referent|verifier_rewrite|deep/.test(task)) {
    return profileWithReason("deep", "complex_culture_or_verifier_path");
  }

  if (/culture|entry_path|work_explanation|memory_binding|followup/.test(task)) {
    return profileWithReason("standard", "standard_culture_or_memory_path");
  }

  if (DEEP_PATTERN.test(text)) return profileWithReason("deep", "query_pattern_deep");
  if (STANDARD_PATTERN.test(text)) return profileWithReason("standard", "query_pattern_standard");
  if (FAST_PATTERN.test(text)) return profileWithReason("fast", "query_pattern_fast");
  if (INSTANT_PATTERN.test(text)) return profileWithReason("instant", "query_pattern_instant");

  return profileWithReason("standard", "default_standard");
}

export function clampThinkingProfile(profile) {
  const selected = profile || THINKING_PROFILES.standard;
  const delayMs = Math.min(selected.delayMs || 0, ANSWER_LATENCY_PROFILE.answerSlaMsLoadedPage);
  const targetMs = Math.min(selected.targetMs || delayMs, ANSWER_LATENCY_PROFILE.answerSlaMsLoadedPage);
  return {
    ...selected,
    delayMs,
    targetMs,
    answerSlaMs: ANSWER_LATENCY_PROFILE.answerSlaMsLoadedPage,
    thinkingNotChainOfThought: true
  };
}
