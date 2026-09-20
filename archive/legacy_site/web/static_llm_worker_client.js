function defaultWorkerUrl() {
  return new URL("./static_llm_worker.js", import.meta.url);
}

export function createStaticLlmWorkerClient(options = {}) {
  const scope = options.scope || globalThis;
  const WorkerCtor = options.Worker || scope.Worker;
  if (typeof WorkerCtor !== "function") {
    return {
      available: false,
      reason: "worker_unavailable",
      async request() {
        return { ok: false, reason: "worker_unavailable" };
      },
      async status() {
        return { ok: false, reason: "worker_unavailable" };
      },
      async dispose() {
        return { ok: true, reason: "worker_unavailable" };
      }
    };
  }

  const worker = new WorkerCtor(options.workerUrl || defaultWorkerUrl(), { type: "module" });
  let sequence = 0;
  const pending = new Map();
  const timeoutMs = Number(options.timeoutMs || 15000);

  worker.addEventListener("message", (event) => {
    const data = event.data || {};
    const entry = pending.get(data.requestId);
    if (!entry) return;
    pending.delete(data.requestId);
    clearTimeout(entry.timer);
    if (data.type === "ERROR") entry.reject(data);
    else entry.resolve(data);
  });

  worker.addEventListener("error", (event) => {
    for (const [requestId, entry] of pending.entries()) {
      clearTimeout(entry.timer);
      entry.reject({ ok: false, type: "ERROR", requestId, reason: event.message || "worker_error" });
    }
    pending.clear();
  });

  function request(type, payload = {}) {
    const requestId = `static_llm_${Date.now()}_${++sequence}`;
    return new Promise((resolve, reject) => {
      const timer = scope.setTimeout(() => {
        pending.delete(requestId);
        reject({ ok: false, type: "ERROR", requestId, reason: "worker_request_timeout" });
      }, timeoutMs);
      pending.set(requestId, { resolve, reject, timer });
      worker.postMessage({ ...payload, type, requestId });
    }).catch((error) => ({
      ok: false,
      type: "ERROR",
      requestId,
      reason: error?.reason || error?.message || "worker_request_failed"
    }));
  }

  return {
    available: true,
    request,
    init(payload = {}) {
      return request("INIT", payload);
    },
    loadManifest(payload = {}) {
      return request("LOAD_MANIFEST", payload);
    },
    loadAssets(payload = {}) {
      return request("LOAD_ASSETS", payload);
    },
    prefill(payload = {}) {
      return request("PREFILL", payload);
    },
    decodeNext(payload = {}) {
      return request("DECODE_NEXT", payload);
    },
    generateFirstToken(payload = {}) {
      return request("GENERATE_FIRST_TOKEN", payload);
    },
    status() {
      return request("STATUS");
    },
    async dispose() {
      const result = await request("DISPOSE");
      worker.terminate();
      return result;
    }
  };
}
