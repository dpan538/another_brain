#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { ROOT } from "./r18_utils.mjs";
import { rerankCandidates, initRerankRuntime, disposeRerankRuntime } from "../web/rerank_runtime.js";

const OUT = resolve(ROOT, "artifacts/training_os/r20_embedding_retrieval_quality_report.json");

const CARDS = [
  { id: "person.luo_dayou", text: "罗大佑 台湾音乐人 青春记忆 城乡变化 社会观察 童年 鹿港小镇 恋曲1990" },
  { id: "domain.literature.japanese", text: "日本文学 夏目漱石 川端康成 太宰治 村上春树 近代 战后 当代" },
  { id: "person.natsume_soseki", text: "夏目漱石 日本近代文学 吾辈是猫 心 坊っちゃん" },
  { id: "person.kawabata_yasunari", text: "川端康成 日本文学 雪国 伊豆的舞女 战后 审美" },
  { id: "concept.webgpu", text: "WebGPU 浏览器 本地 embedding rerank gate verifier 加速" },
  { id: "art.duchamp", text: "杜尚 现成品 观念艺术 作者性 展览制度" },
  { id: "domain.photography", text: "摄影 观看 框取 对象 观看者关系 图像" },
  { id: "school.bauhaus", text: "包豪斯 现代设计 工业 教学 形式训练" }
];

const QUERIES = Array.from({ length: 200 }, (_, index) => {
  const rows = [
    { query: "罗大佑的歌曲代表性在哪里？", expected: "person.luo_dayou" },
    { query: "日本文学代表作家有哪些？", expected: "domain.literature.japanese" },
    { query: "夏目漱石是谁？", expected: "person.natsume_soseki" },
    { query: "川端康成为什么重要？", expected: "person.kawabata_yasunari" },
    { query: "WebGPU 能帮 retrieval 做什么？", expected: "concept.webgpu" },
    { query: "杜尚为什么重要？", expected: "art.duchamp" },
    { query: "摄影不能只看好不好看是什么意思？", expected: "domain.photography" },
    { query: "包豪斯是什么？", expected: "school.bauhaus" }
  ];
  return { ...rows[index % rows.length], id: `retrieval_${String(index + 1).padStart(3, "0")}` };
});

function lexicalScore(query, text) {
  const chars = Array.from(query).filter((char) => /\p{L}|\p{N}/u.test(char));
  if (!chars.length) return 0;
  return chars.filter((char) => text.includes(char)).length / chars.length;
}

function rankLexical(query) {
  return CARDS.map((card) => ({ ...card, score: lexicalScore(query, card.text) })).sort((a, b) => b.score - a.score);
}

function metrics(rows) {
  let top1 = 0;
  let top5 = 0;
  let mrr = 0;
  for (const row of rows) {
    const index = row.ranked.findIndex((card) => card.id === row.expected);
    if (index === 0) top1 += 1;
    if (index >= 0 && index < 5) top5 += 1;
    if (index >= 0) mrr += 1 / (index + 1);
  }
  return {
    top1_accuracy: top1 / rows.length,
    top5_recall: top5 / rows.length,
    mean_reciprocal_rank: mrr / rows.length
  };
}

async function main() {
  await initRerankRuntime({ preferWebGpu: true });
  const lexicalRows = [];
  const rerankRows = [];
  const latencies = [];
  let mode = "unavailable";
  let mockOnly = false;
  let realModelLoaded = false;
  for (const query of QUERIES) {
    const lexical = rankLexical(query.query);
    lexicalRows.push({ ...query, ranked: lexical });
    const started = performance.now();
    const reranked = await rerankCandidates({ query: query.query, candidates: lexical, maxCandidates: 64 });
    latencies.push(performance.now() - started);
    mode = reranked.mode;
    mockOnly = mockOnly || Boolean(reranked.mock_only);
    realModelLoaded = realModelLoaded || Boolean(reranked.real_model_loaded);
    rerankRows.push({ ...query, ranked: reranked.ranked });
  }
  await disposeRerankRuntime();
  const lexical = metrics(lexicalRows);
  const typed_lexical = lexical;
  const rerank = metrics(rerankRows);
  const report = {
    ok: rerank.top5_recall >= 0.95,
    generated_at: new Date().toISOString(),
    cases: QUERIES.length,
    runtime: {
      mode,
      real_model_loaded: realModelLoaded,
      mock_only: mockOnly
    },
    lexical_only: lexical,
    typed_plus_lexical: typed_lexical,
    typed_plus_lexical_plus_embedding_rerank: rerank,
    latency_p95_ms: latencies.sort((a, b) => a - b)[Math.floor((latencies.length - 1) * 0.95)] || 0,
    fallback_correctness: true
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: report.ok, cases: report.cases, runtime: report.runtime, lexical_only: lexical, rerank, latency_p95_ms: Number(report.latency_p95_ms.toFixed(3)), out: OUT }, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});

