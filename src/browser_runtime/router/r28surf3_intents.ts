export const R28SURF3_INTENT_VERSION = "r28surf3-anchor-natural-intents-v1";

export const R28SURF3_INTENTS = Object.freeze([
  "greeting",
  "identity_name",
  "identity_crocodile",
  "origin",
  "capability",
  "boundary_model_status",
  "evidence_boundary",
  "smalltalk_light",
  "unknown_open_question"
]);

export const R28SURF3_INTENT_ROUTES = Object.freeze({
  greeting: "greeting_surface",
  identity_name: "identity_surface",
  identity_crocodile: "identity_surface",
  origin: "origin_surface",
  capability: "capability_surface",
  boundary_model_status: "boundary_model_status_surface",
  evidence_boundary: "evidence_boundary_surface",
  smalltalk_light: "smalltalk_surface",
  unknown_open_question: ""
});

export const R28SURF3_INTENT_EXAMPLES = Object.freeze({
  greeting: Object.freeze(["你好", "hello", "hi", "在吗", "早", "晚上好", "哈喽", "hey"]),
  identity_name: Object.freeze(["你是谁", "你是什么", "介绍一下你自己", "自我介绍", "你叫什么", "who are you", "what are you"]),
  identity_crocodile: Object.freeze(["你是鳄鱼吗", "你是不是鳄鱼", "你就是鳄鱼", "are you crocodile", "are you a crocodile"]),
  origin: Object.freeze(["你从哪里来", "你来自哪里", "你是谁做的", "你的来源是什么", "你怎么来的"]),
  capability: Object.freeze(["你能做什么", "你可以帮我什么", "你擅长什么", "你能怎么帮我", "你有什么用"]),
  boundary_model_status: Object.freeze([
    "你是ai吗",
    "你是不是ai",
    "你是不是另一个大脑",
    "你是另一个大脑吗",
    "模型加载了吗",
    "现在是什么模型",
    "q4运行了吗",
    "runtime status",
    "are you ai",
    "are you an ai"
  ]),
  evidence_boundary: Object.freeze(["证据不足怎么办", "没有证据怎么办", "证据不够", "没证据你怎么回答", "证据不足时怎么判断"]),
  smalltalk_light: Object.freeze(["谢谢", "好的", "好", "嗯", "收到", "明白"]),
  unknown_open_question: Object.freeze([])
});

export const R28SURF3_INTENT_KEYWORDS = Object.freeze({
  greeting: Object.freeze(["你好", "hello", "hi", "在吗", "早", "晚上好", "哈喽", "hey"]),
  identity_name: Object.freeze(["你是谁", "你是什么", "自我介绍", "你叫什么", "who are you"]),
  identity_crocodile: Object.freeze(["鳄鱼", "crocodile"]),
  origin: Object.freeze(["从哪里来", "来自哪里", "谁做的", "来源", "怎么来"]),
  capability: Object.freeze(["能做什么", "可以帮", "擅长什么", "有什么用"]),
  boundary_model_status: Object.freeze(["ai", "人工智能", "另一个大脑", "模型加载", "q4", "tokenizer", "runtime"]),
  evidence_boundary: Object.freeze(["证据不足", "没有证据", "证据不够", "没证据"]),
  smalltalk_light: Object.freeze(["谢谢", "好的", "好", "嗯", "收到", "明白"]),
  unknown_open_question: Object.freeze([])
});

const PUNCTUATION_RE = /[\s?？!！。.,，、:：;；"'“”‘’（）()\[\]【】<>《》]/g;
const MAX_MICRO_INTENT_CHARS = 48;
const MIN_CONFIDENCE = 0.58;
const AMBIGUITY_GAP = 0.08;

export function routeForR28Surf3Intent(intent) {
  return R28SURF3_INTENT_ROUTES[intent] || "";
}

export function isR28Surf3Intent(intent) {
  return R28SURF3_INTENTS.includes(intent);
}

export function isR28Surf3SurfaceRoute(route) {
  return [
    "greeting_surface",
    "identity_surface",
    "origin_surface",
    "capability_surface",
    "boundary_model_status_surface",
    "evidence_boundary_surface",
    "smalltalk_surface"
  ].includes(route);
}

export function normalizeR28Surf3IntentText(input = "") {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(PUNCTUATION_RE, "");
}

function charNgrams(text, size = 2) {
  const value = normalizeR28Surf3IntentText(text);
  if (!value) return [];
  if (value.length <= size) return [value];
  const grams = [];
  for (let index = 0; index <= value.length - size; index += 1) {
    grams.push(value.slice(index, index + size));
  }
  return grams;
}

function overlapScore(a, b) {
  const left = new Set(charNgrams(a));
  const right = new Set(charNgrams(b));
  if (!left.size || !right.size) return 0;
  let hit = 0;
  for (const gram of left) {
    if (right.has(gram)) hit += 1;
  }
  return hit / Math.max(left.size, right.size);
}

function exampleScore(text, example) {
  const normalizedExample = normalizeR28Surf3IntentText(example);
  if (!text || !normalizedExample) return 0;
  if (text === normalizedExample) return 1;
  if (text.length <= MAX_MICRO_INTENT_CHARS && normalizedExample.length >= 3 && text.includes(normalizedExample)) {
    return Math.min(0.88, normalizedExample.length / Math.max(text.length, normalizedExample.length));
  }
  if (normalizedExample.includes(text) && text.length >= 2) {
    return Math.min(0.78, text.length / normalizedExample.length);
  }
  return overlapScore(text, normalizedExample) * 0.86;
}

function keywordBoost(text, intent) {
  let boost = 0;
  for (const keyword of R28SURF3_INTENT_KEYWORDS[intent] || []) {
    const normalized = normalizeR28Surf3IntentText(keyword);
    if (!normalized) continue;
    if (text === normalized) boost = Math.max(boost, 0.18);
    else if (normalized.length >= 2 && text.includes(normalized)) boost = Math.max(boost, 0.14);
  }
  return boost;
}

function scoreIntent(text, intent) {
  let best = 0;
  let matchedExample = "";
  for (const example of R28SURF3_INTENT_EXAMPLES[intent] || []) {
    const score = exampleScore(text, example);
    if (score > best) {
      best = score;
      matchedExample = example;
    }
  }
  return {
    confidence: Number(Math.min(1, best + keywordBoost(text, intent)).toFixed(4)),
    matched_example: matchedExample
  };
}

export function matchR28Surf3Intent(input = "", options = {}) {
  const normalized = normalizeR28Surf3IntentText(input);
  if (!normalized || normalized.length > (options.maxChars || MAX_MICRO_INTENT_CHARS)) {
    return {
      intent: "unknown_open_question",
      route: "",
      confidence: 0,
      matched_example: "",
      normalized_input: normalized,
      ambiguous: false,
      matcher_version: R28SURF3_INTENT_VERSION
    };
  }

  const candidates = Object.keys(R28SURF3_INTENT_EXAMPLES)
    .filter((intent) => intent !== "unknown_open_question")
    .map((intent) => {
      const scored = scoreIntent(normalized, intent);
      return {
        intent,
        route: routeForR28Surf3Intent(intent),
        confidence: scored.confidence,
        matched_example: scored.matched_example
      };
    })
    .sort((a, b) => b.confidence - a.confidence);
  const top = candidates[0] || { intent: "unknown_open_question", route: "", confidence: 0, matched_example: "" };
  const second = candidates[1] || { confidence: 0 };
  const exact = normalizeR28Surf3IntentText(top.matched_example) === normalized;
  const ambiguous = !exact && top.confidence >= MIN_CONFIDENCE && (top.confidence - second.confidence) < AMBIGUITY_GAP;
  if (top.confidence < (options.threshold || MIN_CONFIDENCE) || ambiguous) {
    return {
      intent: "unknown_open_question",
      route: "",
      confidence: top.confidence,
      matched_example: top.matched_example,
      normalized_input: normalized,
      ambiguous,
      matcher_version: R28SURF3_INTENT_VERSION
    };
  }
  return {
    ...top,
    normalized_input: normalized,
    ambiguous: false,
    matcher_version: R28SURF3_INTENT_VERSION
  };
}
