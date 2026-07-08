import {
  MICRO_INTENT_EXAMPLES,
  MICRO_INTENT_KEYWORDS,
  routeForMicroIntent
} from "./intent_taxonomy.ts";

export const R28ROUT1_FUZZY_MATCHER_VERSION = "r28rout1-fuzzy-intent-matcher-v1";

const PUNCTUATION_RE = /[\s?？!！。.,，、:：;；"'“”‘’（）()\[\]【】<>《》]/g;
const MAX_MICRO_INTENT_CHARS = 42;
const MIN_CONFIDENCE = 0.56;
const AMBIGUITY_GAP = 0.08;

export function normalizeIntentText(input = "") {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(PUNCTUATION_RE, "");
}

function charNgrams(text, size = 2) {
  const value = normalizeIntentText(text);
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
  const normalizedExample = normalizeIntentText(example);
  if (!text || !normalizedExample) return 0;
  if (text === normalizedExample) return 1;
  if (text.length <= MAX_MICRO_INTENT_CHARS && normalizedExample.length >= 3 && text.includes(normalizedExample)) {
    return Math.min(0.86, normalizedExample.length / Math.max(text.length, normalizedExample.length));
  }
  if (normalizedExample.includes(text) && text.length >= 2) {
    return Math.min(0.78, text.length / normalizedExample.length);
  }
  return overlapScore(text, normalizedExample) * 0.86;
}

function keywordBoost(text, intent) {
  const keywords = MICRO_INTENT_KEYWORDS[intent] || [];
  let boost = 0;
  for (const keyword of keywords) {
    const normalized = normalizeIntentText(keyword);
    if (!normalized) continue;
    if (text === normalized) boost = Math.max(boost, 0.18);
    else if (normalized.length >= 2 && text.includes(normalized)) boost = Math.max(boost, 0.14);
  }
  return boost;
}

function scoreIntent(text, intent) {
  const examples = MICRO_INTENT_EXAMPLES[intent] || [];
  const bestExample = examples.reduce((best, example) => Math.max(best, exampleScore(text, example)), 0);
  const boosted = Math.min(1, bestExample + keywordBoost(text, intent));
  return Number(boosted.toFixed(4));
}

export function matchMicroIntent(input = "", options = {}) {
  const normalized = normalizeIntentText(input);
  if (!normalized) {
    return {
      intent: "unknown_open_question",
      route: "",
      confidence: 0,
      matched_example: "",
      normalized_input: normalized,
      ambiguous: false,
      matcher_version: R28ROUT1_FUZZY_MATCHER_VERSION
    };
  }
  if (normalized.length > (options.maxChars || MAX_MICRO_INTENT_CHARS)) {
    return {
      intent: "unknown_open_question",
      route: "",
      confidence: 0,
      matched_example: "",
      normalized_input: normalized,
      ambiguous: false,
      matcher_version: R28ROUT1_FUZZY_MATCHER_VERSION
    };
  }

  const candidates = Object.keys(MICRO_INTENT_EXAMPLES)
    .filter((intent) => intent !== "unknown_open_question")
    .map((intent) => {
      const examples = MICRO_INTENT_EXAMPLES[intent] || [];
      let matchedExample = "";
      let best = 0;
      for (const example of examples) {
        const score = exampleScore(normalized, example);
        if (score > best) {
          best = score;
          matchedExample = example;
        }
      }
      const confidence = Math.min(1, scoreIntent(normalized, intent));
      return { intent, route: routeForMicroIntent(intent), confidence, matched_example: matchedExample };
    })
    .sort((a, b) => b.confidence - a.confidence);
  const top = candidates[0] || { intent: "unknown_open_question", route: "", confidence: 0, matched_example: "" };
  const second = candidates[1] || { confidence: 0 };
  const exact = normalizeIntentText(top.matched_example) === normalized;
  const ambiguous = !exact && top.confidence >= MIN_CONFIDENCE && (top.confidence - second.confidence) < AMBIGUITY_GAP;
  if (top.confidence < (options.threshold || MIN_CONFIDENCE) || ambiguous) {
    return {
      intent: "unknown_open_question",
      route: "",
      confidence: top.confidence,
      matched_example: top.matched_example,
      normalized_input: normalized,
      ambiguous,
      matcher_version: R28ROUT1_FUZZY_MATCHER_VERSION
    };
  }
  return {
    ...top,
    normalized_input: normalized,
    ambiguous: false,
    matcher_version: R28ROUT1_FUZZY_MATCHER_VERSION
  };
}
