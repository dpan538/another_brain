import {
  R28SURF2_INTENT_EXAMPLES,
  R28SURF2_INTENT_KEYWORDS,
  R28SURF2_INTENT_VERSION,
  routeForR28Surf2Intent
} from "./r28surf2_intents.ts";

export const R28SURF2_FUZZY_MATCHER_VERSION = "r28surf2-anchor-informed-fuzzy-matcher-v1";

const PUNCTUATION_RE = /[\s?？!！。.,，、:：;；"'“”‘’（）()\[\]【】<>《》]/g;
const MAX_SURFACE_INTENT_CHARS = 48;
const MIN_CONFIDENCE = 0.58;
const AMBIGUITY_GAP = 0.08;

export function normalizeR28Surf2IntentText(input = "") {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(PUNCTUATION_RE, "");
}

function charNgrams(text, size = 2) {
  const value = normalizeR28Surf2IntentText(text);
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
  const normalizedExample = normalizeR28Surf2IntentText(example);
  if (!text || !normalizedExample) return 0;
  if (text === normalizedExample) return 1;
  if (text.length <= MAX_SURFACE_INTENT_CHARS && normalizedExample.length >= 3 && text.includes(normalizedExample)) {
    return Math.min(0.88, normalizedExample.length / Math.max(text.length, normalizedExample.length));
  }
  if (normalizedExample.includes(text) && text.length >= 2) {
    return Math.min(0.78, text.length / normalizedExample.length);
  }
  return overlapScore(text, normalizedExample) * 0.86;
}

function keywordBoost(text, intent) {
  let boost = 0;
  for (const keyword of R28SURF2_INTENT_KEYWORDS[intent] || []) {
    const normalized = normalizeR28Surf2IntentText(keyword);
    if (!normalized) continue;
    if (text === normalized) boost = Math.max(boost, 0.18);
    else if (normalized.length >= 2 && text.includes(normalized)) boost = Math.max(boost, 0.14);
  }
  return boost;
}

function scoreIntent(text, intent) {
  let best = 0;
  let matchedExample = "";
  for (const example of R28SURF2_INTENT_EXAMPLES[intent] || []) {
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

export function matchR28Surf2Intent(input = "", options = {}) {
  const normalized = normalizeR28Surf2IntentText(input);
  if (!normalized || normalized.length > (options.maxChars || MAX_SURFACE_INTENT_CHARS)) {
    return {
      intent: "unknown_open_question",
      route: "",
      confidence: 0,
      matched_example: "",
      normalized_input: normalized,
      ambiguous: false,
      matcher_version: R28SURF2_FUZZY_MATCHER_VERSION,
      taxonomy_version: R28SURF2_INTENT_VERSION
    };
  }

  const candidates = Object.keys(R28SURF2_INTENT_EXAMPLES)
    .filter((intent) => intent !== "unknown_open_question")
    .map((intent) => {
      const scored = scoreIntent(normalized, intent);
      return {
        intent,
        route: routeForR28Surf2Intent(intent),
        confidence: scored.confidence,
        matched_example: scored.matched_example
      };
    })
    .sort((a, b) => b.confidence - a.confidence);
  const top = candidates[0] || { intent: "unknown_open_question", route: "", confidence: 0, matched_example: "" };
  const second = candidates[1] || { confidence: 0 };
  const exact = normalizeR28Surf2IntentText(top.matched_example) === normalized;
  const ambiguous = !exact && top.confidence >= MIN_CONFIDENCE && (top.confidence - second.confidence) < AMBIGUITY_GAP;
  if (top.confidence < (options.threshold || MIN_CONFIDENCE) || ambiguous) {
    return {
      intent: "unknown_open_question",
      route: "",
      confidence: top.confidence,
      matched_example: top.matched_example,
      normalized_input: normalized,
      ambiguous,
      matcher_version: R28SURF2_FUZZY_MATCHER_VERSION,
      taxonomy_version: R28SURF2_INTENT_VERSION
    };
  }
  return {
    ...top,
    normalized_input: normalized,
    ambiguous: false,
    matcher_version: R28SURF2_FUZZY_MATCHER_VERSION,
    taxonomy_version: R28SURF2_INTENT_VERSION
  };
}
