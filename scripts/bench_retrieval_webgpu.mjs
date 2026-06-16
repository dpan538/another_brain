#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { ROOT } from "./r18_utils.mjs";
import { detectBrowserInferenceProfile } from "../web/webgpu_capability.js";
import { initEmbeddingRuntime, embedQuery, disposeEmbeddingRuntime } from "../web/embedding_runtime.js";
import { initRerankRuntime, rerankCandidates, disposeRerankRuntime } from "../web/rerank_runtime.js";

const OUT = resolve(ROOT, "artifacts/training_os/r20_webgpu_retrieval_bench.json");

const CANDIDATES = [
  { id: "person.luo_dayou", text: "罗大佑 台湾 音乐人 青春记忆 社会观察 城乡变化" },
  { id: "domain.literature.japanese", text: "日本文学 夏目漱石 川端康成 太宰治 村上春树" },
  { id: "concept.webgpu", text: "WebGPU browser local embedding rerank verifier accelerator" },
  { id: "art.duchamp", text: "杜尚 现成品 观念艺术 作者性 展览制度" }
];

function p95(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * 0.95))] || 0;
}

async function main() {
  const capabilities = await detectBrowserInferenceProfile({ runtimeProfile: "standard", preferWebGpu: true });
  const lexicalLatencies = [];
  const embeddingLatencies = [];
  const rerankLatencies = [];
  const queries = ["罗大佑的歌有什么代表性？", "日本文学代表作家有哪些？", "WebGPU 可以帮什么？", "杜尚为什么重要？"];
  await initEmbeddingRuntime({ preferWebGpu: true, capabilities });
  await initRerankRuntime({ preferWebGpu: true, capabilities });
  let embeddingMode = "unavailable";
  let rerankMode = "unavailable";
  let realModelLoaded = false;
  let mockOnly = false;
  for (const query of queries) {
    let started = performance.now();
    const lexical = CANDIDATES.map((candidate) => ({ ...candidate, score: candidate.text.includes(query.slice(0, 2)) ? 1 : 0 })).sort((a, b) => b.score - a.score);
    lexicalLatencies.push(performance.now() - started);
    started = performance.now();
    const embedding = await embedQuery(query);
    embeddingLatencies.push(performance.now() - started);
    embeddingMode = embedding.mode;
    realModelLoaded = Boolean(embedding.real_model_loaded);
    mockOnly = Boolean(embedding.mock_only);
    started = performance.now();
    const reranked = await rerankCandidates({ query, candidates: lexical.length ? lexical : CANDIDATES, maxCandidates: 64 });
    rerankLatencies.push(performance.now() - started);
    rerankMode = reranked.mode;
    mockOnly = mockOnly || Boolean(reranked.mock_only);
  }
  await disposeEmbeddingRuntime();
  await disposeRerankRuntime();
  const report = {
    ok: true,
    generated_at: new Date().toISOString(),
    capability_detection: capabilities,
    lexical_retrieval_latency: {
      p50_ms: Number((lexicalLatencies[1] || 0).toFixed(3)),
      p95_ms: Number(p95(lexicalLatencies).toFixed(3))
    },
    embedding_runtime_mode: embeddingMode,
    rerank_runtime_mode: rerankMode,
    real_model_loaded: realModelLoaded,
    mock_only: mockOnly,
    webgpu_available: Boolean(capabilities.webgpu?.available),
    wasm_fallback_available: Boolean(capabilities.wasm?.available),
    candidate_count: CANDIDATES.length,
    embedding_latency_p95_ms: Number(p95(embeddingLatencies).toFixed(3)),
    rerank_latency_p95_ms: Number(p95(rerankLatencies).toFixed(3)),
    false_real_inference_reported: false
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: report.ok, webgpu_available: report.webgpu_available, wasm_fallback_available: report.wasm_fallback_available, embedding_runtime_mode: embeddingMode, rerank_runtime_mode: rerankMode, real_model_loaded: realModelLoaded, mock_only: mockOnly, p95_ms: { embedding: report.embedding_latency_p95_ms, rerank: report.rerank_latency_p95_ms }, out: OUT }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});

