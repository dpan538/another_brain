import { TINY_ROUTER_MODEL } from "./tiny_router_model.generated.js?v=9";

const KNOWLEDGE_QUESTION_RE =
  /(你知道|是什么|什么是|是谁|怎么样|如何|在哪|哪里|为什么|为何|由什么|什么组成|组成|构成|用来|用途|有什么用|能不能|可以|会不会|适合|区别|关系|关于|告诉|讲讲|介绍|what is|who is|where is|why|use for|like)/i;
const ROLEPLAY_RE =
  /(扮演|角色扮演|假装|模拟|代入|人设|设定为|自认为|认为自己是|以.{1,18}身份|用.{1,18}身份|你现在是|请你当)/;
const REWRITE_RE = /(把|将).{0,8}(这句|这句话|下面的话).{0,12}(说短|改短|缩短|短一点|短些|更短)/;

function normalizeTinyText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[\s\u3000，。！？、；：,.!?;:"'“”‘’（）()[\]{}<>《》]+/g, "");
}

function tinyFeatures(text) {
  const normalized = normalizeTinyText(text);
  const features = [];
  for (const n of [1, 2, 3]) {
    if (normalized.length < n) continue;
    for (let index = 0; index <= normalized.length - n; index += 1) {
      features.push(normalized.slice(index, index + n));
    }
  }
  for (const match of String(text || "").toLowerCase().matchAll(/[a-z][a-z0-9_+\-]{1,}/g)) {
    features.push(`w:${match[0]}`);
  }
  return Array.from(new Set(features));
}

function softmaxTopConfidence(scores, topIndex) {
  const top = scores[topIndex];
  let sum = 0;
  for (const score of scores) sum += Math.exp(Math.min(50, score - top));
  return sum ? 1 / sum : 0;
}

export function classifyTinyRoute(text) {
  const classifier = TINY_ROUTER_MODEL.classifier;
  const labels = classifier.labels;
  const scores = classifier.priors.slice();
  for (const feature of tinyFeatures(text)) {
    const weights = classifier.featureWeights[feature];
    if (!weights) continue;
    for (let index = 0; index < weights.length; index += 1) {
      scores[index] += weights[index];
    }
  }
  const order = scores.map((score, index) => ({ score, index })).sort((left, right) => right.score - left.score);
  const top = order[0];
  const second = order[1] || top;
  return {
    label: labels[top.index],
    confidence: softmaxTopConfidence(scores, top.index),
    margin: top.score - second.score,
    scores
  };
}

function bigrams(text) {
  const normalized = normalizeTinyText(text);
  if (normalized.length <= 1) return normalized ? [normalized] : [];
  const grams = [];
  for (let index = 0; index < normalized.length - 1; index += 1) {
    grams.push(normalized.slice(index, index + 2));
  }
  return grams;
}

function diceSimilarity(left, right) {
  const leftGrams = bigrams(left);
  const rightGrams = bigrams(right);
  if (!leftGrams.length || !rightGrams.length) return 0;
  const counts = new Map();
  for (const gram of leftGrams) counts.set(gram, (counts.get(gram) || 0) + 1);
  let overlap = 0;
  for (const gram of rightGrams) {
    const count = counts.get(gram) || 0;
    if (!count) continue;
    overlap += 1;
    counts.set(gram, count - 1);
  }
  return (2 * overlap) / (leftGrams.length + rightGrams.length);
}

function exactAnswerEntry(text) {
  const key = normalizeTinyText(text);
  return TINY_ROUTER_MODEL.answerIndex.find((entry) => entry.key === key) || null;
}

export function tinyDirectAnswer(text) {
  const exact = exactAnswerEntry(text);
  if (exact) {
    return {
      answer: exact.answer,
      label: exact.label,
      source: exact.source,
      confidence: 1,
      similarity: 1,
      mode: "exact"
    };
  }

  const route = classifyTinyRoute(text);
  const thresholds = TINY_ROUTER_MODEL.thresholds;
  if (route.confidence < thresholds.routeConfidence || route.margin < thresholds.routeMargin) return null;

  let best = null;
  for (const entry of TINY_ROUTER_MODEL.answerIndex) {
    if (entry.label !== route.label) continue;
    if (!["fixed", "boundary", "unknown", "reasoning", "philosophy", "rewrite_short"].includes(entry.label)) continue;
    const similarity = diceSimilarity(text, entry.prompt);
    if (!best || similarity > best.similarity) best = { entry, similarity };
  }
  if (!best || best.similarity < thresholds.answerSimilarity) return null;
  const queryLength = normalizeTinyText(text).length;
  const promptLength = normalizeTinyText(best.entry.prompt).length;
  const lengthRatio = Math.min(queryLength, promptLength) / Math.max(queryLength, promptLength);
  if (lengthRatio < 0.62) return null;
  return {
    answer: best.entry.answer,
    label: best.entry.label,
    source: best.entry.source,
    confidence: route.confidence,
    similarity: best.similarity,
    mode: "near"
  };
}

export function tinyIntentHint(text) {
  const route = classifyTinyRoute(text);
  const thresholds = TINY_ROUTER_MODEL.thresholds;
  if (route.confidence < thresholds.routeConfidence || route.margin < thresholds.routeMargin) return null;
  if (route.label === "rewrite_short" && REWRITE_RE.test(text)) return { intent: "rewrite_short", route };
  if (route.label === "boundary" && ROLEPLAY_RE.test(text)) return { intent: "forced_roleplay", route };
  if (route.label === "unknown" && KNOWLEDGE_QUESTION_RE.test(text)) return { intent: "knowledge_unknown", route };
  if (route.label === "reasoning") return { intent: "reasoning_reflection", route };
  if ((route.label === "common_knowledge" || route.label === "personal_world") && KNOWLEDGE_QUESTION_RE.test(text)) {
    return { intent: "knowledge_unknown", route };
  }
  if (route.label === "memory") return { intent: "memory", route };
  if (route.label === "creative") return { intent: "creative", route };
  return null;
}

export const TINY_ROUTER_STATS = Object.freeze({
  examples: TINY_ROUTER_MODEL.stats.examples,
  answerIndex: TINY_ROUTER_MODEL.stats.answerIndex,
  featureWeights: TINY_ROUTER_MODEL.stats.featureWeights,
  labels: TINY_ROUTER_MODEL.classifier.labels
});
