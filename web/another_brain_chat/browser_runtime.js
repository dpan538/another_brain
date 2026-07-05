import { buildEvidencePacket, loadStaticMemoryRecords } from "./static_retriever.js";

const HIDDEN_MARKERS = ["system prompt", "hidden prompt", "<hidden", "chain-of-thought"];
const GENERIC_MARKERS = ["as an ai language model", "i cannot answer that"];
const EVIDENCE_INJECTION_MARKERS = ["ignore previous instructions", "reveal hidden prompt", "developer message"];

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
    runtime_version: "r27b3-static-rag-memory-v1",
    input,
    turn_index: turnIndex,
    local_only: true,
    backend_inference: false,
    external_runtime_dependency: false,
    mode
  };
}

export function buildRetrievalPacket(input, statePacket, records) {
  return buildEvidencePacket(input, statePacket, records);
}

export function verifyDraft(draft, evidencePacket = null, maxChars = 1200) {
  const text = String(draft || "");
  const lowered = text.toLowerCase();
  const failures = [];
  const evidence = evidencePacket?.retrieved_evidence || [];
  if (evidencePacket) {
    if (evidence.length === 0) failures.push("empty_evidence");
    if (evidencePacket.evidence_status === "insufficient") failures.push("insufficient_evidence");
    if (evidencePacket.evidence_status === "conflicting") failures.push("conflicting_evidence");
    if (evidencePacket.answer_policy_hint === "refuse") failures.push("evidence_policy_refuse");
    if (evidence.some((item) => EVIDENCE_INJECTION_MARKERS.some((marker) => `${item.title}\n${item.text}`.toLowerCase().includes(marker)))) {
      failures.push("evidence_instruction_injection");
    }
  }
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

function buildDecoderPrompt(input, evidencePacket) {
  const evidenceLines = (evidencePacket?.retrieved_evidence || [])
    .slice(0, 3)
    .map((item) => `- ${item.title}: ${item.text}`)
    .join("\n");
  return [
    `Query: ${String(input || "").slice(0, 120)}`,
    "Evidence packet:",
    evidenceLines || "- no local evidence",
    `Evidence status: ${evidencePacket?.evidence_status || "insufficient"}`,
    `Policy hint: ${evidencePacket?.answer_policy_hint || "ask_clarifying"}`
  ].join("\n");
}

export class BrowserChatRuntime {
  constructor(options = {}) {
    this.mode = options.mode || "synthetic_tiny";
    this.turnIndex = 0;
    this.worker = null;
    this.capabilities = probeBrowserCapabilities();
    this.memoryRecords = null;
  }

  async load() {
    if (this.capabilities.worker_available) {
      this.worker = new Worker("./runtime_worker.js", { type: "module" });
    }
    this.memoryRecords = await loadStaticMemoryRecords().catch(() => null);
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
    if (!this.memoryRecords) this.memoryRecords = await loadStaticMemoryRecords().catch(() => null);
    const evidencePacket = buildRetrievalPacket(input, statePacket, this.memoryRecords || undefined);
    setStatus("drafting");

    let decoderDraft = "";
    let fallbackUsed = false;
    let finalAnswer = "";
    let verifierResult = { passed: false, failures: ["not_run"], fallback_recommended: true };

    try {
      decoderDraft = await this.draftWithWorker(buildDecoderPrompt(input, evidencePacket), { maxTokens: 32, timeoutMs: 3000 });
      setStatus("verifying");
      verifierResult = verifyDraft(decoderDraft, evidencePacket);
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
      evidence_packet: evidencePacket,
      retrieved_evidence: evidencePacket.retrieved_evidence,
      decoder_draft: decoderDraft,
      verifier_result: verifierResult,
      final_answer: finalAnswer,
      fallback_used: fallbackUsed,
      capabilities: this.capabilities
    };
  }
}
