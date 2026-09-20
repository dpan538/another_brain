import { createBrowserInferenceAdapter } from "./browser_inference_adapters.js?v=1";

let rerankRuntime = null;

export async function initRerankRuntime(config = {}) {
  const adapter = await createBrowserInferenceAdapter({
    runtimeProfile: config.runtimeProfile || "standard",
    preferWebGpu: Boolean(config.preferWebGpu),
    capabilities: config.capabilities
  });
  rerankRuntime = {
    adapter,
    mode: adapter.backend === "webgpu" ? "webgpu" : adapter.backend === "wasm" ? "wasm_fallback" : "unavailable",
    realModelLoaded: false,
    mockOnly: adapter.backend !== "none"
  };
  return { ...rerankRuntime, metrics: adapter.metrics() };
}

export async function rerankCandidates({ query = "", candidates = [], maxCandidates = 64 } = {}) {
  if (!rerankRuntime) await initRerankRuntime();
  const narrowed = candidates.slice(0, Math.max(1, maxCandidates));
  const result = await rerankRuntime.adapter.rerank(query, narrowed);
  return {
    mode: rerankRuntime.mode,
    real_model_loaded: rerankRuntime.realModelLoaded,
    mock_only: rerankRuntime.mockOnly,
    backend: result.backend || rerankRuntime.adapter.backend,
    ranked: (result.ranked || []).map((row) => row.candidate || row),
    scored: result.ranked || [],
    ok: Boolean(result.ok)
  };
}

export async function disposeRerankRuntime() {
  if (rerankRuntime?.adapter) await rerankRuntime.adapter.dispose();
  rerankRuntime = null;
}

