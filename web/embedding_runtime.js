import { createBrowserInferenceAdapter } from "./browser_inference_adapters.js?v=1";

let runtime = null;

function normalizeTexts(texts) {
  return Array.isArray(texts) ? texts.map((text) => String(text || "")) : [String(texts || "")];
}

export async function initEmbeddingRuntime(config = {}) {
  const adapter = await createBrowserInferenceAdapter({
    runtimeProfile: config.runtimeProfile || "standard",
    preferWebGpu: Boolean(config.preferWebGpu),
    capabilities: config.capabilities
  });
  runtime = {
    adapter,
    mode: adapter.backend === "webgpu" ? "webgpu" : adapter.backend === "wasm" ? "wasm_fallback" : "unavailable",
    realModelLoaded: false,
    mockOnly: adapter.backend !== "none",
    initializedAt: new Date().toISOString()
  };
  return { ...runtime, metrics: adapter.metrics() };
}

export async function embedTexts(texts = []) {
  if (!runtime) await initEmbeddingRuntime();
  const normalized = normalizeTexts(texts);
  const result = await runtime.adapter.embed(normalized);
  return {
    mode: runtime.mode,
    real_model_loaded: runtime.realModelLoaded,
    mock_only: runtime.mockOnly,
    vectors: result.vectors || [],
    backend: result.backend || runtime.adapter.backend,
    ok: Boolean(result.ok)
  };
}

export async function embedQuery(query = "") {
  const result = await embedTexts([query]);
  return { ...result, vector: result.vectors[0] || [] };
}

export async function disposeEmbeddingRuntime() {
  if (runtime?.adapter) await runtime.adapter.dispose();
  runtime = null;
}

