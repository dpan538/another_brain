import { detectBrowserInferenceProfile } from "./webgpu_capability.js?v=1";

function nowMs() {
  const perf = globalThis.performance;
  return typeof perf?.now === "function" ? perf.now() : Date.now();
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

const RERANK_ALIASES = [
  [/川端康成|kawabata/i, ["川端康成", "kawabata", "yasunari", "japanese literature"]],
  [/夏目漱石|natsume/i, ["夏目漱石", "natsume", "soseki", "japanese literature"]],
  [/罗大佑|luo dayou|lo ta-yu/i, ["罗大佑", "luo", "dayou", "music"]],
  [/杜尚|duchamp/i, ["杜尚", "duchamp", "art"]]
];

function scoreText(query, text) {
  const haystack = String(text || "").toLowerCase();
  const needle = String(query || "").toLowerCase().trim();
  if (needle && haystack.includes(needle)) return 1;
  for (const [pattern, aliases] of RERANK_ALIASES) {
    if (pattern.test(query)) {
      const aliasHits = aliases.filter((alias) => haystack.includes(String(alias).toLowerCase())).length;
      if (aliasHits > 0) return 0.8 + aliasHits / (aliases.length * 10);
    }
  }
  const q = new Set(tokenize(query));
  if (!q.size) {
    const chars = Array.from(needle).filter((char) => /\p{L}|\p{N}/u.test(char));
    if (!chars.length) return 0;
    const hits = chars.filter((char) => haystack.includes(char)).length;
    return hits / chars.length;
  }
  let score = 0;
  for (const token of tokenize(text)) if (q.has(token)) score += 1;
  const tokenScore = score / q.size;
  if (tokenScore > 0) return tokenScore;
  const chars = Array.from(needle).filter((char) => /\p{L}|\p{N}/u.test(char));
  if (!chars.length) return 0;
  const hits = chars.filter((char) => haystack.includes(char)).length;
  return hits / chars.length;
}

export class BrowserInferenceAdapter {
  constructor(config = {}) {
    this.config = config;
    this.initialized = false;
    this.backend = "base";
    this.metricState = {
      backend: this.backend,
      initMs: 0,
      calls: 0,
      lastLatencyMs: 0,
      failures: 0,
      cloudCalls: 0
    };
  }

  async init(config = {}) {
    const started = nowMs();
    this.config = { ...this.config, ...config };
    this.initialized = true;
    this.metricState.initMs = Math.round(nowMs() - started);
    return this;
  }

  async classify(input) {
    this._recordCall();
    return { ok: false, backend: this.backend, labels: {}, reason: "not_implemented" };
  }

  async embed(texts) {
    this._recordCall();
    return { ok: false, backend: this.backend, vectors: [], reason: "not_implemented" };
  }

  async rerank(query, candidates) {
    this._recordCall();
    return { ok: false, backend: this.backend, ranked: candidates || [], reason: "not_implemented" };
  }

  async verify(input) {
    this._recordCall();
    return { ok: false, backend: this.backend, verdict: "unknown", reason: "not_implemented" };
  }

  async generateShort(input) {
    this._recordCall();
    return { ok: false, backend: this.backend, text: "", reason: "generation_disabled" };
  }

  async dispose() {
    this.initialized = false;
  }

  metrics() {
    return { ...this.metricState, backend: this.backend };
  }

  _recordCall(started = nowMs()) {
    this.metricState.calls += 1;
    this.metricState.lastLatencyMs = Math.round(nowMs() - started);
  }
}

export class NullAdapter extends BrowserInferenceAdapter {
  constructor(config = {}) {
    super(config);
    this.backend = "none";
  }

  async init(config = {}) {
    await super.init(config);
    this.metricState.backend = this.backend;
    return this;
  }
}

export class WasmFallbackAdapter extends BrowserInferenceAdapter {
  constructor(config = {}) {
    super(config);
    this.backend = "wasm";
  }

  async init(config = {}) {
    await super.init(config);
    this.metricState.backend = this.backend;
    return this;
  }

  async classify(input = {}) {
    const started = nowMs();
    const text = String(input.query || input.text || "");
    const labels = {
      domain: /罗大佑|音乐|歌曲|专辑/.test(text) ? "music.chinese_pop_general" : /日本文学|夏目|川端|村上/.test(text) ? "literature.japanese" : "generic",
      task_type: /几个|多少|等于|加|减|乘|除/.test(text) ? "reasoning" : /比较|差在哪|共同点/.test(text) ? "culture_compare" : "dialog",
      risk_label: /歌词|全文|原文|地址|电话|邮箱/.test(text) ? "high" : "low"
    };
    this._recordCall(started);
    return { ok: true, backend: this.backend, labels, confidence: 0.65 };
  }

  async embed(texts = []) {
    const started = nowMs();
    const vectors = texts.map((text) => {
      const tokens = tokenize(text);
      const vector = new Array(8).fill(0);
      tokens.forEach((token, index) => {
        vector[index % vector.length] += Math.min(token.length, 12) / 12;
      });
      return vector;
    });
    this._recordCall(started);
    return { ok: true, backend: this.backend, vectors };
  }

  async rerank(query, candidates = []) {
    const started = nowMs();
    const ranked = candidates
      .map((candidate, index) => ({
        candidate,
        index,
        score: scoreText(query, candidate?.text || candidate?.name || JSON.stringify(candidate))
      }))
      .sort((a, b) => b.score - a.score);
    this._recordCall(started);
    return { ok: true, backend: this.backend, ranked };
  }

  async verify(input = {}) {
    const started = nowMs();
    const text = String(input.answer || input.draft || "");
    const risk = /\/Users\/|@|电话|地址|完整歌词|全文|原文/.test(text);
    this._recordCall(started);
    return {
      ok: true,
      backend: this.backend,
      verdict: risk ? "reject" : "accept",
      reason: risk ? "surface_risk_pattern" : "heuristic_accept"
    };
  }
}

export class WebGpuAdapter extends WasmFallbackAdapter {
  constructor(config = {}) {
    super(config);
    this.backend = "webgpu";
  }

  async init(config = {}) {
    const started = nowMs();
    this.config = { ...this.config, ...config };
    this.capabilities = this.config.capabilities || (await detectBrowserInferenceProfile({ runtimeProfile: this.config.runtimeProfile || "standard" }));
    if (!this.capabilities.webgpu?.available) {
      this.metricState.failures += 1;
      throw new Error("WebGPU unavailable; use WASM fallback");
    }
    this.initialized = true;
    this.metricState.backend = this.backend;
    this.metricState.initMs = Math.round(nowMs() - started);
    return this;
  }
}

export async function createBrowserInferenceAdapter(config = {}) {
  const capabilities = config.capabilities || (await detectBrowserInferenceProfile({ runtimeProfile: config.runtimeProfile || "standard" }));
  if (config.preferWebGpu && capabilities.webgpu?.available) {
    try {
      return await new WebGpuAdapter({ ...config, capabilities }).init();
    } catch {
      return await new WasmFallbackAdapter({ ...config, capabilities, fallbackFrom: "webgpu" }).init();
    }
  }
  if (capabilities.wasm?.available !== false) {
    return await new WasmFallbackAdapter({ ...config, capabilities }).init();
  }
  return await new NullAdapter({ ...config, capabilities }).init();
}
