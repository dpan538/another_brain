const HIDDEN_MARKERS = ["system prompt", "hidden prompt", "<hidden", "chain-of-thought"];
const GENERIC_MARKERS = ["as an ai language model", "i cannot answer that"];

export function probeBrowserCapabilities() {
  return {
    webgpu_available: typeof navigator !== "undefined" && Boolean(navigator.gpu),
    webassembly_available: typeof WebAssembly !== "undefined",
    worker_available: typeof Worker !== "undefined",
    shared_array_buffer_available: typeof SharedArrayBuffer !== "undefined"
  };
}

export function buildStatePacket(input, turnIndex, mode = "synthetic_tiny") {
  return {
    runtime_version: "r27b1b-browser-runtime-smoke-v1",
    input,
    turn_index: turnIndex,
    local_only: true,
    backend_inference: false,
    external_runtime_dependency: false,
    mode
  };
}

export function buildRetrievalPacket(input, statePacket) {
  return [
    {
      id: "r27b1b-local-memory-smoke",
      source: "same-origin mock retrieval",
      score: 1,
      text: `Local packet for: ${String(input).slice(0, 80)}`
    }
  ].map((item) => ({ ...item, turn_index: statePacket.turn_index }));
}

export function verifyDraft(draft, maxChars = 1200) {
  const text = String(draft || "");
  const lowered = text.toLowerCase();
  const failures = [];
  if (!text.trim()) failures.push("empty_output");
  if (text.length > maxChars) failures.push("overlong_output");
  if (HIDDEN_MARKERS.some((marker) => lowered.includes(marker))) failures.push("hidden_prompt_disclosure_marker");
  if (GENERIC_MARKERS.some((marker) => lowered.includes(marker))) failures.push("generic_fallback_marker");
  return { passed: failures.length === 0, failures, fallback_recommended: failures.length > 0 };
}

function fallbackAnswer(input, reason) {
  return `Static fallback (${reason}): ${String(input || "").slice(0, 120)}`;
}

function syntheticDraft(input, maxTokens = 32) {
  return [
    "Static",
    "browser",
    "draft:",
    String(input || "").slice(0, 80),
    "local",
    "runtime",
    "smoke",
    "complete."
  ].slice(0, Math.min(maxTokens, 8)).join(" ");
}

export class BrowserChatRuntime {
  constructor(options = {}) {
    this.mode = options.mode || "synthetic_tiny";
    this.turnIndex = 0;
    this.worker = null;
    this.capabilities = probeBrowserCapabilities();
  }

  async load() {
    if (this.capabilities.worker_available) {
      this.worker = new Worker("./runtime_worker.js", { type: "module" });
    }
    return {
      status: "loaded",
      mode: this.mode,
      product_model: false,
      capabilities: this.capabilities
    };
  }

  abort() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  async draftWithWorker(input, options = {}) {
    if (!this.worker) return syntheticDraft(input, options.maxTokens);
    return new Promise((resolve, reject) => {
      const tokens = [];
      const timeout = setTimeout(() => reject(new Error("generation_timeout")), options.timeoutMs || 3000);
      this.worker.onmessage = (event) => {
        const message = event.data || {};
        if (message.type === "token") tokens.push(message.token);
        if (message.type === "error") {
          clearTimeout(timeout);
          reject(new Error(message.error || "worker_generation_failed"));
        }
        if (message.type === "final") {
          clearTimeout(timeout);
          resolve(message.draft || tokens.join(" "));
        }
      };
      this.worker.postMessage({
        type: "generate",
        prompt: input,
        mode: this.mode,
        maxTokens: Math.min(options.maxTokens || 32, 128),
        contextLength: Math.min(options.contextLength || 256, 1024)
      });
    });
  }

  async run(input, hooks = {}) {
    this.turnIndex += 1;
    const setStatus = typeof hooks.onStatus === "function" ? hooks.onStatus : () => {};
    const statePacket = buildStatePacket(input, this.turnIndex, this.mode);
    setStatus("loading_model");
    if (!this.worker && this.capabilities.worker_available) await this.load();
    setStatus("retrieving_local_memory");
    const retrievedEvidence = buildRetrievalPacket(input, statePacket);
    setStatus("drafting");

    let decoderDraft = "";
    let fallbackUsed = false;
    let finalAnswer = "";
    let verifierResult = { passed: false, failures: ["not_run"], fallback_recommended: true };

    try {
      decoderDraft = await this.draftWithWorker(input, { maxTokens: 32, timeoutMs: 3000 });
      setStatus("verifying");
      verifierResult = verifyDraft(decoderDraft);
      if (verifierResult.passed) {
        finalAnswer = decoderDraft;
        setStatus("final");
      } else {
        fallbackUsed = true;
        finalAnswer = fallbackAnswer(input, verifierResult.failures[0]);
        setStatus("fallback");
      }
    } catch (error) {
      fallbackUsed = true;
      verifierResult = { passed: false, failures: [error.message], fallback_recommended: true };
      finalAnswer = fallbackAnswer(input, error.message || "runtime_failed");
      setStatus("fallback");
    }

    return {
      input,
      state_packet: statePacket,
      retrieved_evidence: retrievedEvidence,
      decoder_draft: decoderDraft,
      verifier_result: verifierResult,
      final_answer: finalAnswer,
      fallback_used: fallbackUsed,
      capabilities: this.capabilities
    };
  }
}
