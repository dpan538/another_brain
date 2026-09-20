function nowMs() {
  return typeof globalThis.performance?.now === "function" ? globalThis.performance.now() : Date.now();
}

function clean(text) {
  return String(text || "").trim();
}

function isFixtureManifest(manifest = {}) {
  return /fixture/i.test(String(manifest?.review_status || ""));
}

function isAdmittedManifest(manifest = {}) {
  const review = String(manifest?.review_status || "");
  const admission = String(manifest?.admission_status || "admitted");
  return /^(admitted|reviewed_admitted)$/.test(review) && admission === "admitted";
}

function rejectsHiddenReasoning(text = "") {
  return /chain[-_ ]?of[-_ ]?thought|hidden_prompt|system_prompt|思维链|内部提示/i.test(String(text || ""));
}

export class StaticLlmBackendBase {
  constructor(options = {}) {
    this.options = options;
    this.manifest = options.manifest || null;
    this.backend = options.backend || "base";
    this.initialized = false;
    this.metricState = {
      initMs: 0,
      firstTokenMs: 0,
      backend: this.backend,
      modelId: this.manifest?.model_id || "",
      admitted: isAdmittedManifest(this.manifest),
      fixture: isFixtureManifest(this.manifest),
      calls: 0,
      failures: 0
    };
  }

  async init({ manifest = this.manifest, assets = [], tokenizer = null, config = null } = {}) {
    const started = nowMs();
    this.manifest = manifest;
    this.assets = assets;
    this.tokenizer = tokenizer;
    this.config = config;
    this.initialized = true;
    this.metricState.initMs = Math.max(0, Math.round(nowMs() - started));
    this.metricState.modelId = manifest?.model_id || "";
    this.metricState.admitted = isAdmittedManifest(manifest);
    this.metricState.fixture = isFixtureManifest(manifest);
    return { ok: true, backend: this.backend, initialized: true };
  }

  async prefill() {
    this.metricState.calls += 1;
    this.metricState.failures += 1;
    return { ok: false, reason: "backend_not_implemented", backend: this.backend };
  }

  async decodeNext() {
    this.metricState.calls += 1;
    this.metricState.failures += 1;
    return { ok: false, reason: "backend_not_implemented", backend: this.backend };
  }

  async generateFirstToken() {
    const started = nowMs();
    this.metricState.calls += 1;
    this.metricState.failures += 1;
    this.metricState.firstTokenMs = Math.max(0, Math.round(nowMs() - started));
    return {
      ok: false,
      reason: "backend_not_implemented",
      backend: this.backend,
      token: "",
      text: "",
      firstTokenMs: this.metricState.firstTokenMs
    };
  }

  async dispose() {
    this.initialized = false;
    return { ok: true, backend: this.backend };
  }

  metrics() {
    return { ...this.metricState, backend: this.backend };
  }
}

export class StaticLlmBackendUnavailable extends StaticLlmBackendBase {
  constructor(options = {}) {
    super({ ...options, backend: options.backend || "unavailable" });
    this.reason = options.reason || "no_admitted_static_llm_manifest";
  }

  async init() {
    this.metricState.failures += 1;
    return { ok: false, backend: this.backend, reason: this.reason, initialized: false };
  }

  async generateFirstToken() {
    const started = nowMs();
    this.metricState.calls += 1;
    this.metricState.firstTokenMs = Math.max(0, Math.round(nowMs() - started));
    return {
      ok: false,
      unavailable: true,
      reason: this.reason,
      backend: this.backend,
      token: "",
      text: "",
      firstTokenMs: this.metricState.firstTokenMs
    };
  }
}

export class StaticLlmFixtureBackend extends StaticLlmBackendBase {
  constructor(options = {}) {
    super({ ...options, backend: "fixture" });
  }

  async init(args = {}) {
    const result = await super.init(args);
    if (!isFixtureManifest(this.manifest)) {
      this.metricState.failures += 1;
      this.initialized = false;
      return { ok: false, backend: this.backend, reason: "fixture_backend_requires_fixture_manifest" };
    }
    return result;
  }

  async prefill({ inputIds = [], attentionMask = [] } = {}) {
    this.metricState.calls += 1;
    return {
      ok: true,
      backend: this.backend,
      state: {
        fixture: true,
        inputIds: Array.isArray(inputIds) ? inputIds.slice() : [],
        attentionMask: Array.isArray(attentionMask) ? attentionMask.slice() : []
      }
    };
  }

  async decodeNext() {
    this.metricState.calls += 1;
    return {
      ok: true,
      backend: this.backend,
      token: "static",
      tokenId: 5,
      text: "static"
    };
  }

  async generateFirstToken({ prompt = "" } = {}) {
    const started = nowMs();
    this.metricState.calls += 1;
    const safePrompt = clean(prompt);
    if (rejectsHiddenReasoning(safePrompt)) {
      this.metricState.failures += 1;
      return {
        ok: false,
        backend: this.backend,
        reason: "hidden_reasoning_prompt_rejected",
        token: "",
        text: "",
        firstTokenMs: 0
      };
    }
    this.metricState.firstTokenMs = Math.max(0, Math.round(nowMs() - started));
    return {
      ok: true,
      backend: this.backend,
      fixture: true,
      token: "static",
      tokenId: 5,
      text: "static",
      firstTokenMs: this.metricState.firstTokenMs
    };
  }
}

export class StaticLlmWebGpuBackendStub extends StaticLlmBackendBase {
  constructor(options = {}) {
    super({ ...options, backend: "webgpu_stub" });
  }
}

export class StaticLlmWasmBackendStub extends StaticLlmBackendBase {
  constructor(options = {}) {
    super({ ...options, backend: "wasm_stub" });
  }
}

export function selectStaticLlmBackend({ manifest = null, capabilities = {}, policy = {} } = {}) {
  if (isFixtureManifest(manifest)) {
    return { backend: "fixture", reason: "fixture_manifest", admitted: false, fixture: true };
  }
  if (!isAdmittedManifest(manifest)) {
    return {
      backend: "unavailable",
      reason: manifest ? "manifest_not_admitted" : "no_admitted_static_llm_manifest",
      admitted: false,
      fixture: false
    };
  }
  if (policy.noBackendInference === false || policy.sameOriginOnly === false) {
    return { backend: "unavailable", reason: "policy_rejected_backend", admitted: true, fixture: false };
  }
  if (manifest.runtime_backend === "webgpu") {
    if (capabilities.webgpu?.available === false) {
      return { backend: "unavailable", reason: "webgpu_unavailable", admitted: true, fixture: false };
    }
    return { backend: "webgpu_stub", reason: "webgpu_backend_stub_only", admitted: true, fixture: false };
  }
  if (manifest.runtime_backend === "wasm") {
    if (capabilities.wasm?.available === false) {
      return { backend: "unavailable", reason: "wasm_unavailable", admitted: true, fixture: false };
    }
    return { backend: "wasm_stub", reason: "wasm_backend_stub_only", admitted: true, fixture: false };
  }
  return { backend: "unavailable", reason: "runtime_backend_not_supported", admitted: true, fixture: false };
}

export function createStaticLlmBackend(options = {}) {
  const selection = selectStaticLlmBackend(options);
  const args = { ...options, backend: selection.backend, reason: selection.reason };
  if (selection.backend === "fixture") return new StaticLlmFixtureBackend(args);
  if (selection.backend === "webgpu_stub") return new StaticLlmWebGpuBackendStub(args);
  if (selection.backend === "wasm_stub") return new StaticLlmWasmBackendStub(args);
  return new StaticLlmBackendUnavailable(args);
}
