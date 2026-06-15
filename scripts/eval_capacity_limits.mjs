#!/usr/bin/env node
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MODEL_PATH = resolve(ROOT, "artifacts/tiny_router_model.json");
const WEB_MODEL_PATH = resolve(ROOT, "web/tiny_router_model.generated.js");
const KNOWLEDGE_MANIFEST_PATH = resolve(ROOT, "web/knowledge_shards/manifest.json");
const DEFAULT_OUT = resolve(ROOT, "artifacts/training_os/capacity_limits_report.json");
const MB = 1024 * 1024;

function parseArgs(argv) {
  const args = {
    out: DEFAULT_OUT,
    targetsMb: [20, 40],
    iterations: 700,
    nearIterations: 80,
    routeIterations: 5000
  };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--out") args.out = resolve(ROOT, argv[++index]);
    else if (item === "--targets-mb") {
      args.targetsMb = argv[++index]
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value) && value > 0);
    } else if (item === "--iterations") args.iterations = Number(argv[++index]);
    else if (item === "--near-iterations") args.nearIterations = Number(argv[++index]);
    else if (item === "--route-iterations") args.routeIterations = Number(argv[++index]);
    else if (item === "--help") {
      console.log("Usage: node scripts/eval_capacity_limits.mjs [--targets-mb 20,40] [--out path]");
      process.exit(0);
    }
  }
  return args;
}

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

function classifyTinyRoute(model, text) {
  const classifier = model.classifier;
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
    margin: top.score - second.score
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

function tinyDirectAnswer(model, text) {
  const key = normalizeTinyText(text);
  const exact = model.answerIndex.find((entry) => entry.key === key) || null;
  if (exact) {
    return { answer: exact.answer, label: exact.label, mode: "exact", confidence: 1, similarity: 1 };
  }

  const route = classifyTinyRoute(model, text);
  const thresholds = model.thresholds;
  if (route.confidence < thresholds.routeConfidence || route.margin < thresholds.routeMargin) return null;

  const allowedNearLabels = new Set([
    "CHAT_LIGHT",
    "REFUSE_ROLEPLAY",
    "REFUSE_PRIVACY",
    "ANSWER_WITH_UNCERTAINTY",
    "SUGGEST_SEARCH",
    "ASK_PREMISE",
    "ASK_DIRECTION",
    "SHORTEN_TEXT",
    "COMMENT_CREATIVE",
    "HELP_START",
    "HELP_FEATURES",
    "HELP_EXAMPLES",
    "HELP_PROJECT",
    "HELP_PRIVACY",
    "HELP_LIMITS",
    "HELP_MEMORY",
    "SURFACE_IDENTITY_SELF",
    "SURFACE_IDENTITY_ALIAS",
    "SURFACE_IDENTITY_ORIGIN_REFUSAL",
    "SURFACE_IDENTITY_RELATION_PRESSURE"
  ]);

  let best = null;
  for (const entry of model.answerIndex) {
    if (entry.label !== route.label) continue;
    if (!allowedNearLabels.has(entry.label)) continue;
    const similarity = diceSimilarity(text, entry.prompt);
    if (!best || similarity > best.similarity) best = { entry, similarity };
  }
  if (!best || best.similarity < thresholds.answerSimilarity) return null;
  return {
    answer: best.entry.answer,
    label: best.entry.label,
    mode: "near",
    confidence: route.confidence,
    similarity: best.similarity
  };
}

function serializedWebBytes(model) {
  return Buffer.byteLength(
    `// synthetic capacity estimate\nexport const TINY_ROUTER_MODEL = Object.freeze(${JSON.stringify(model)});\n`,
    "utf8"
  );
}

function makeSyntheticEntry(index, label = "CHAT_LIGHT") {
  const id = String(index).padStart(8, "0");
  const prompt = `容量测试问题${id}：如果对话框遇到第${id}个影子问题应该怎么回答？`;
  return {
    key: normalizeTinyText(prompt),
    prompt,
    answer: `容量测试回答${id}。`,
    label,
    source: "synthetic_capacity",
    priority: 1
  };
}

function expandModelToTarget(baseModel, targetBytes) {
  const model = structuredClone(baseModel);
  let nextIndex = 0;
  let bytes = serializedWebBytes(model);
  while (bytes < targetBytes) {
    const remaining = targetBytes - bytes;
    const batch = remaining > 8 * MB ? 10000 : remaining > 2 * MB ? 3000 : 500;
    for (let offset = 0; offset < batch; offset += 1) {
      model.answerIndex.push(makeSyntheticEntry(nextIndex));
      nextIndex += 1;
    }
    bytes = serializedWebBytes(model);
  }
  model.stats = {
    ...model.stats,
    answerIndex: model.answerIndex.length,
    syntheticAnswerIndex: nextIndex,
    estimatedWebBytes: bytes
  };
  return { model, syntheticEntries: nextIndex, estimatedWebBytes: bytes };
}

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] || 0;
}

function bench(name, iterations, fn) {
  for (let index = 0; index < Math.min(20, iterations); index += 1) fn(index);
  const samples = [];
  const start = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    const itemStart = performance.now();
    fn(index);
    samples.push(performance.now() - itemStart);
  }
  const totalMs = performance.now() - start;
  samples.sort((left, right) => left - right);
  return {
    name,
    iterations,
    totalMs: Number(totalMs.toFixed(3)),
    avgMs: Number((totalMs / iterations).toFixed(6)),
    p50Ms: Number(percentile(samples, 0.5).toFixed(6)),
    p95Ms: Number(percentile(samples, 0.95).toFixed(6)),
    p99Ms: Number(percentile(samples, 0.99).toFixed(6)),
    maxMs: Number(samples[samples.length - 1].toFixed(6))
  };
}

function findEntry(model, label) {
  return model.answerIndex.find((entry) => entry.label === label) || model.answerIndex[0];
}

function benchmarkModel(model, args) {
  const headPrompt = model.answerIndex[0].prompt;
  const tailPrompt = model.answerIndex[model.answerIndex.length - 1].prompt;
  const nearEntry = findEntry(model, "CHAT_LIGHT");
  const nearPrompt = `${nearEntry.prompt}呢`;
  const missPrompt = "容量测试中完全不存在的陌生问题会不会让线性索引变慢？";
  const routePrompt = "罗大佑是谁？";

  const exactMap = new Map(model.answerIndex.map((entry) => [entry.key, entry]));
  const mapLookup = (text) => exactMap.get(normalizeTinyText(text)) || null;

  return [
    bench("classify_route_only", args.routeIterations, () => classifyTinyRoute(model, routePrompt)),
    bench("tiny_exact_head_linear", args.iterations, () => tinyDirectAnswer(model, headPrompt)),
    bench("tiny_exact_tail_linear", args.iterations, () => tinyDirectAnswer(model, tailPrompt)),
    bench("tiny_exact_miss_then_route_linear", args.iterations, () => tinyDirectAnswer(model, missPrompt)),
    bench("tiny_near_match_linear", args.nearIterations, () => tinyDirectAnswer(model, nearPrompt)),
    bench("exact_tail_map_projection", args.iterations, () => mapLookup(tailPrompt)),
    bench("exact_miss_map_projection", args.iterations, () => mapLookup(missPrompt))
  ];
}

function maxCardsAtSize(currentCards, currentBytes, targetMb) {
  return Math.floor((currentCards / currentBytes) * targetMb * MB);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const raw = await readFile(MODEL_PATH, "utf8");
  const baseModel = JSON.parse(raw);
  const knowledgeManifest = JSON.parse(await readFile(KNOWLEDGE_MANIFEST_PATH, "utf8"));
  const webModelStats = await stat(WEB_MODEL_PATH);
  const currentWebBytes = webModelStats.size;

  const targets = [
    {
      name: "current",
      targetMb: Number((currentWebBytes / MB).toFixed(3)),
      model: structuredClone(baseModel),
      syntheticEntries: 0,
      estimatedWebBytes: currentWebBytes
    },
    ...args.targetsMb.map((targetMb) => expandModelToTarget(baseModel, targetMb * MB)).map((item, index) => ({
      name: `synthetic_${args.targetsMb[index]}mb`,
      targetMb: args.targetsMb[index],
      ...item
    }))
  ];

  const modelReports = targets.map((item) => {
    const started = performance.now();
    const benchmarks = benchmarkModel(item.model, args);
    const benchMs = performance.now() - started;
    return {
      name: item.name,
      targetMb: item.targetMb,
      estimatedWebBytes: item.estimatedWebBytes,
      estimatedWebMb: Number((item.estimatedWebBytes / MB).toFixed(3)),
      answerIndex: item.model.answerIndex.length,
      syntheticEntries: item.syntheticEntries,
      featureWeights: Object.keys(item.model.classifier.featureWeights).length,
      labels: item.model.classifier.labels.length,
      benchWallMs: Number(benchMs.toFixed(3)),
      benchmarks
    };
  });

  const knowledgeBytes = knowledgeManifest.source?.bytes || 0;
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    assumptions: {
      routerTargetBytes: "serialized web JS bytes, loaded-page runtime only; network cold-start is excluded",
      syntheticData: "answerIndex expansion with synthetic short prompt/answer pairs; classifier feature count is unchanged",
      currentRuntimeShape: "exact and near answer lookup use linear Array.find/scan in web/tiny_router.js"
    },
    currentArtifacts: {
      tinyRouterWebBytes: currentWebBytes,
      tinyRouterJsonBytes: Buffer.byteLength(raw, "utf8"),
      answerIndex: baseModel.answerIndex.length,
      featureWeights: Object.keys(baseModel.classifier.featureWeights).length,
      labels: baseModel.classifier.labels.length
    },
    knowledgeBase: {
      cards: knowledgeManifest.total_cards,
      answerFields: knowledgeManifest.stats?.answer_fields,
      specificFactCards: knowledgeManifest.stats?.specific_fact_cards,
      domains: knowledgeManifest.stats?.domains?.length,
      shardCount: knowledgeManifest.shard_count,
      shardMaxBytes: knowledgeManifest.shard_max_bytes,
      sourceBytes: knowledgeBytes,
      currentCardsPerMb: Number((knowledgeManifest.total_cards / (knowledgeBytes / MB)).toFixed(1)),
      estimatedCardsAt20Mb: maxCardsAtSize(knowledgeManifest.total_cards, knowledgeBytes, 20),
      estimatedCardsAt40Mb: maxCardsAtSize(knowledgeManifest.total_cards, knowledgeBytes, 40)
    },
    modelReports
  };

  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({
    ok: report.ok,
    out: args.out,
    currentArtifacts: report.currentArtifacts,
    knowledgeBase: report.knowledgeBase,
    modelReports: report.modelReports.map((item) => ({
      name: item.name,
      estimatedWebMb: item.estimatedWebMb,
      answerIndex: item.answerIndex,
      benchmarks: item.benchmarks
    }))
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
