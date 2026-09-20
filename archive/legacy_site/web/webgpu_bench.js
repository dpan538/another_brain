import { createBrowserInferenceAdapter } from "./browser_inference_adapters.js?v=1";
import { detectBrowserInferenceProfile } from "./webgpu_capability.js?v=1";

async function gpuSmokeTest() {
  if (!navigator.gpu) return { ok: false, reason: "navigator.gpu unavailable" };
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return { ok: false, reason: "adapter unavailable" };
  const device = await adapter.requestDevice();
  const buffer = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
  });
  buffer.destroy();
  return { ok: true, reason: "buffer allocation smoke test passed" };
}

export async function runWebGpuBench() {
  const started = performance.now();
  const profile = await detectBrowserInferenceProfile({ runtimeProfile: "full", preferWebGpu: true });
  const smoke = await gpuSmokeTest().catch((error) => ({ ok: false, reason: error.message }));
  const adapter = await createBrowserInferenceAdapter({
    preferWebGpu: true,
    runtimeProfile: "standard",
    capabilities: profile
  });
  const classify = await adapter.classify({ query: "罗大佑和日本文学怎么比较？" });
  const embed = await adapter.embed(["罗大佑", "日本文学", "WebGPU local inference"]);
  const rerank = await adapter.rerank("日本文学", [
    { id: "a", text: "music metadata" },
    { id: "b", text: "Japanese literature author and work metadata" }
  ]);
  const verify = await adapter.verify({ draft: "短答，不含原文或路径。" });
  return {
    ok: true,
    elapsedMs: Math.round(performance.now() - started),
    profile,
    smoke,
    adapter: adapter.metrics(),
    classify,
    embed_dimensions: embed.vectors?.[0]?.length || 0,
    rerank_top: rerank.ranked?.[0] || null,
    verify,
    personal_200m_feasibility: profile.webgpu.available ? "candidate_needs_real_model_benchmark" : "blocked_without_webgpu",
    fallback_path: profile.recommendedBackend === "webgpu" ? "webgpu_with_wasm_fallback" : "wasm_or_deterministic"
  };
}

const button = document.querySelector("#runBench");
const output = document.querySelector("#benchOutput");
button?.addEventListener("click", async () => {
  output.textContent = "Running...";
  const report = await runWebGpuBench().catch((error) => ({ ok: false, error: error.message }));
  output.textContent = JSON.stringify(report, null, 2);
});
