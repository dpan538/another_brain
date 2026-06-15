import { createBrowserInferenceAdapter } from "./browser_inference_adapters.js?v=1";
import { detectBrowserInferenceProfile } from "./webgpu_capability.js?v=1";

let adapter = null;

async function ensureAdapter(config = {}) {
  if (!adapter) {
    const capabilities = await detectBrowserInferenceProfile(config);
    adapter = await createBrowserInferenceAdapter({ ...config, capabilities });
  }
  return adapter;
}

self.onmessage = async (event) => {
  const { id, type, payload = {}, config = {} } = event.data || {};
  try {
    const active = await ensureAdapter(config);
    let result;
    if (type === "classify") result = await active.classify(payload);
    else if (type === "embed") result = await active.embed(payload.texts || []);
    else if (type === "rerank") result = await active.rerank(payload.query || "", payload.candidates || []);
    else if (type === "verify") result = await active.verify(payload);
    else if (type === "metrics") result = active.metrics();
    else result = { ok: false, reason: "unknown_worker_message" };
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message || "worker_error" });
  }
};
