import { createStaticLlmBackend } from "./static_llm_backend.js";
import {
  getStaticLlmRuntimeStatus,
  loadStaticLlmAssets,
  loadStaticLlmManifest,
  loadTokenizerAndConfig,
  validateSameOriginAssetUrl
} from "./static_llm_runtime.js";

let currentManifest = null;
let currentAssets = [];
let currentTokenizer = null;
let currentConfig = null;
let currentBackend = null;

function post(requestId, type, payload = {}) {
  globalThis.postMessage({ requestId, type, ...payload });
}

function rejectExternalManifest(manifest) {
  for (const file of manifest?.files || []) {
    const check = validateSameOriginAssetUrl(file.path);
    if (!check.ok) return { ok: false, reason: check.reason || "asset_not_same_origin", path: file.path };
  }
  return { ok: true };
}

async function handleMessage(message = {}) {
  const requestId = message.requestId || "";
  const type = message.type || "";
  try {
    if (type === "STATUS") {
      post(requestId, "STATUS", {
        ok: true,
        status: getStaticLlmRuntimeStatus(),
        backend: currentBackend?.metrics?.() || null
      });
      return;
    }

    if (type === "LOAD_MANIFEST") {
      const status = await loadStaticLlmManifest(message.profile || "hobby_static_llm_lite", { scope: globalThis, includeManifest: true });
      currentManifest = status.manifestLoaded ? status.manifest || null : null;
      post(requestId, "LOAD_MANIFEST", { ok: status.manifestLoaded, status });
      return;
    }

    if (type === "INIT") {
      currentManifest = message.manifest || currentManifest;
      const sameOrigin = rejectExternalManifest(currentManifest);
      if (!sameOrigin.ok) {
        post(requestId, "ERROR", sameOrigin);
        return;
      }
      currentBackend = createStaticLlmBackend({
        manifest: currentManifest,
        capabilities: message.capabilities || {},
        policy: {
          sameOriginOnly: true,
          noBackendInference: true
        }
      });
      const init = await currentBackend.init({
        manifest: currentManifest,
        assets: currentAssets,
        tokenizer: currentTokenizer,
        config: currentConfig
      });
      post(requestId, "INIT", { ok: init.ok, init, backend: currentBackend.metrics() });
      return;
    }

    if (type === "LOAD_ASSETS") {
      currentManifest = message.manifest || currentManifest;
      const sameOrigin = rejectExternalManifest(currentManifest);
      if (!sameOrigin.ok) {
        post(requestId, "ERROR", sameOrigin);
        return;
      }
      const loaded = await loadStaticLlmAssets(currentManifest, {
        scope: globalThis,
        includeWeights: message.includeWeights === true,
        roles: message.roles || ["tokenizer", "config"]
      });
      currentAssets = loaded.assets || [];
      post(requestId, "LOAD_ASSETS", { ok: loaded.ok, loaded });
      return;
    }

    if (type === "PREFILL") {
      const result = currentBackend ? await currentBackend.prefill(message) : { ok: false, reason: "backend_not_initialized" };
      post(requestId, "PREFILL", result);
      return;
    }

    if (type === "DECODE_NEXT") {
      const result = currentBackend ? await currentBackend.decodeNext(message) : { ok: false, reason: "backend_not_initialized" };
      post(requestId, "DECODE_NEXT", result);
      return;
    }

    if (type === "GENERATE_FIRST_TOKEN") {
      const result = currentBackend ? await currentBackend.generateFirstToken(message) : { ok: false, reason: "backend_not_initialized" };
      post(requestId, "GENERATE_FIRST_TOKEN", result);
      return;
    }

    if (type === "DISPOSE") {
      const result = currentBackend ? await currentBackend.dispose() : { ok: true, reason: "backend_absent" };
      currentBackend = null;
      currentAssets = [];
      currentTokenizer = null;
      currentConfig = null;
      post(requestId, "DISPOSE", result);
      return;
    }

    if (type === "LOAD_TOKENIZER_CONFIG") {
      currentManifest = message.manifest || currentManifest;
      const result = await loadTokenizerAndConfig(currentManifest, { scope: globalThis });
      currentTokenizer = result.tokenizer || null;
      currentConfig = result.config || null;
      post(requestId, "LOAD_TOKENIZER_CONFIG", result);
      return;
    }

    post(requestId, "ERROR", { ok: false, reason: "unknown_worker_message", messageType: type });
  } catch (error) {
    post(requestId, "ERROR", { ok: false, reason: error?.message || "worker_error" });
  }
}

globalThis.addEventListener("message", (event) => {
  handleMessage(event.data);
});
