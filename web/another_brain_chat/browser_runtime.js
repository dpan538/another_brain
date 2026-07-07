import { buildEvidencePacket, loadStaticMemoryRecords } from "./static_retriever.js";
import {
  applyImportedStatePackets,
  buildAdapterContextSummary,
  buildAnswerSurfaceRequest,
  buildAnswerSurfaceResponse,
  mergeAdapterEvidenceRecords
} from "./context_bridge.js";

const HIDDEN_MARKERS = ["system prompt", "hidden prompt", "<hidden", "chain-of-thought"];
const GENERIC_MARKERS = ["as an ai language model", "i cannot answer that"];
const EVIDENCE_INJECTION_MARKERS = ["ignore previous instructions", "reveal hidden prompt", "developer message"];
const MAX_STATIC_RUNTIME_INPUT_CHARS = 8192;
const INPUT_SECURITY_MARKERS = [
  "ignore previous instructions",
  "ignore the previous instructions",
  "disregard previous instructions",
  "override runtime policy",
  "reveal hidden prompt",
  "reveal the hidden prompt",
  "show hidden prompt",
  "show the hidden prompt",
  "print hidden prompt",
  "hidden prompt:",
  "reveal system prompt",
  "show system prompt",
  "show the system prompt",
  "print system prompt",
  "system prompt:",
  "reveal developer message",
  "show developer message",
  "show the developer message",
  "print developer message",
  "developer message:",
  "developer instructions:",
  "chain-of-thought",
  "chain of thought",
  "hidden reasoning",
  "<hidden",
  "<system",
  "<developer"
];
const SECRET_LIKE_PATTERN = /\b(?:api[_-]?key|secret|password|passwd|token)\s*[:=]\s*["']?[^"'\s]{8,}/i;

function inspectSecurityText(value) {
  const text = String(value || "").toLowerCase();
  const failures = INPUT_SECURITY_MARKERS
    .filter((marker) => text.includes(marker))
    .map((marker) => marker.includes("chain") || marker.includes("reasoning")
      ? "chain_of_thought_request_blocked"
      : marker.includes("ignore") || marker.includes("override") || marker.includes("disregard")
        ? "prompt_injection_marker_blocked"
        : "hidden_prompt_or_developer_marker_blocked");
  return {
    ok: failures.length === 0,
    failures: Array.from(new Set(failures)),
    warnings: SECRET_LIKE_PATTERN.test(String(value || "")) ? ["secrets_like_input_warning"] : []
  };
}

function sanitizeInputForLocalRuntime(input) {
  const raw = String(input || "");
  const inspection = inspectSecurityText(raw);
  const failures = [...inspection.failures];
  if (raw.length > MAX_STATIC_RUNTIME_INPUT_CHARS) failures.push("input_too_large");
  const uniqueFailures = Array.from(new Set(failures));
  const blocked = uniqueFailures.length > 0;
  return {
    ok: !blocked,
    blocked,
    failures: uniqueFailures,
    warnings: inspection.warnings,
    sanitized_input: blocked ? "" : raw.trim().slice(0, MAX_STATIC_RUNTIME_INPUT_CHARS),
    redacted_input: blocked ? `[blocked by r28sec0-static-security-v1: ${uniqueFailures[0] || "security_guard"}]` : raw.trim(),
    local_only: true,
    allowed_for_training: false,
    forwarded_to_external_runtime: false,
    persisted: false
  };
}

function validateDeliverySecurityPolicy(config = {}) {
  const failures = [];
  if (config.backend_inference !== false) failures.push("backend_inference_rejected");
  if (config.external_llm_api !== false) failures.push("external_llm_api_rejected");
  if (config.hosted_vector_store === true) failures.push("hosted_vector_store_rejected");
  if (config.product_model === true) failures.push("product_model_rejected");
  if (config.product_admission === true) failures.push("product_admission_rejected");
  if (config.browser_admission === true) failures.push("browser_admission_rejected");
  return {
    ok: failures.length === 0,
    failures,
    policy_version: "r28sec0-static-security-v1",
    local_only: true,
    imported_context_is_training_data: false,
    no_local_persistence_by_default: true
  };
}

export function probeBrowserCapabilities() {
  const cacheStorageAvailable = typeof caches !== "undefined" && typeof caches.open === "function";
  return {
    webgpu_available: typeof navigator !== "undefined" && Boolean(navigator.gpu),
    webassembly_available: typeof WebAssembly !== "undefined",
    worker_available: typeof Worker !== "undefined",
    shared_array_buffer_available: typeof SharedArrayBuffer !== "undefined",
    cache_storage_available: cacheStorageAvailable,
    offline_static_cache_supported: cacheStorageAvailable,
    online: typeof navigator === "undefined" || navigator.onLine !== false
  };
}

export function buildStatePacket(input, turnIndex, mode = "synthetic_tiny") {
  return {
    runtime_version: "r27b4-end-to-end-static-delivery-v1",
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
    if (evidencePacket.security_guard?.hidden_prompt_disclosure_rejected) failures.push("evidence_hidden_prompt_request");
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
  return `Static fallback (${reason}): local static guard could not produce a grounded answer.`;
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
    this.deliveryConfig = options.deliveryConfig || {};
    this.turnIndex = 0;
    this.worker = null;
    this.capabilities = probeBrowserCapabilities();
    this.memoryRecords = null;
    this.contextPackets = [];
    this.assetStatus = {
      cache_mode: this.capabilities.cache_storage_available ? "cache_storage" : "memory_fallback",
      cache_result: "not_checked",
      progress: "0/0",
      verification: "no_model_assets",
      fallback_reason: this.capabilities.cache_storage_available ? "" : "cache_storage_unavailable",
      offline_ready: this.capabilities.offline_static_cache_supported
    };
  }

  async load() {
    if (this.capabilities.worker_available) {
      this.worker = new Worker("./runtime_worker.js", { type: "module" });
    }
    this.memoryRecords = await loadStaticMemoryRecords().catch(() => null);
    return {
      status: "loaded",
      mode: this.mode,
      delivery_mode: this.deliveryConfig.delivery_mode || "demo_static",
      rag_mode: this.deliveryConfig.rag_mode || "static_demo",
      product_model: false,
      capabilities: this.capabilities,
      asset_status: this.assetStatus
    };
  }

  abort() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  setContextPackets(packets = []) {
    this.contextPackets = Array.isArray(packets) ? [...packets] : [];
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
    const inputGuard = sanitizeInputForLocalRuntime(input);
    const policyGuard = validateDeliverySecurityPolicy(this.deliveryConfig);
    const blockedReason = !policyGuard.ok
      ? policyGuard.failures[0]
      : (!inputGuard.ok ? inputGuard.failures[0] : null);
    if (blockedReason) {
      setStatus("fallback");
      const statePacket = buildStatePacket("", this.turnIndex, this.mode);
      statePacket.security_guard = { input: inputGuard, policy: policyGuard };
      const finalAnswer = fallbackAnswer("", blockedReason);
      const answerSurfaceRequest = buildAnswerSurfaceRequest({
        input: inputGuard.redacted_input,
        statePacket,
        evidencePacket: null,
        contextPackets: []
      });
      return {
        input: inputGuard.redacted_input,
        state_packet: statePacket,
        evidence_packet: null,
        retrieved_evidence: [],
        decoder_draft: "",
        verifier_result: {
          passed: false,
          failures: [blockedReason],
          fallback_recommended: true,
          security_guard: { input: inputGuard, policy: policyGuard }
        },
        final_answer: finalAnswer,
        fallback_used: true,
        reason: blockedReason,
        security_guard: { input: inputGuard, policy: policyGuard },
        adapter_context_summary: buildAdapterContextSummary([]),
        answer_surface_request: answerSurfaceRequest,
        answer_surface_response: buildAnswerSurfaceResponse({
          finalAnswer,
          requestPacket: answerSurfaceRequest,
          evidencePacket: null
        }),
        delivery_config: this.deliveryConfig,
        capabilities: this.capabilities,
        asset_status: this.assetStatus
      };
    }

    const safeInput = inputGuard.sanitized_input;
    const statePacket = applyImportedStatePackets(buildStatePacket(safeInput, this.turnIndex, this.mode), this.contextPackets);
    statePacket.delivery_mode = this.deliveryConfig.delivery_mode || "demo_static";
    statePacket.rag_mode = this.deliveryConfig.rag_mode || "static_demo";
    statePacket.product_model = false;
    statePacket.security_guard = { input: inputGuard, policy: policyGuard };
    setStatus("loading_model");
    if (!this.worker && this.capabilities.worker_available) await this.load();
    setStatus("retrieving_local_memory");
    if (!this.memoryRecords) this.memoryRecords = await loadStaticMemoryRecords().catch(() => null);
    const memoryRecords = this.contextPackets.length > 0
      ? mergeAdapterEvidenceRecords(this.memoryRecords || [], this.contextPackets)
      : this.memoryRecords || undefined;
    const evidencePacket = buildRetrievalPacket(safeInput, statePacket, memoryRecords);
    const answerSurfaceRequest = buildAnswerSurfaceRequest({
      input: safeInput,
      statePacket,
      evidencePacket,
      contextPackets: this.contextPackets
    });
    setStatus("drafting");

    let decoderDraft = "";
    let fallbackUsed = false;
    let finalAnswer = "";
    let verifierResult = { passed: false, failures: ["not_run"], fallback_recommended: true };

    try {
      decoderDraft = await this.draftWithWorker(buildDecoderPrompt(safeInput, evidencePacket), { maxTokens: 32, timeoutMs: 3000 });
      setStatus("verifying");
      verifierResult = verifyDraft(decoderDraft, evidencePacket);
      if (verifierResult.passed) {
        finalAnswer = decoderDraft;
        setStatus("final");
      } else {
        fallbackUsed = true;
        finalAnswer = fallbackAnswer(safeInput, verifierResult.failures[0]);
        setStatus("fallback");
      }
    } catch (error) {
      fallbackUsed = true;
      verifierResult = { passed: false, failures: [error.message], fallback_recommended: true };
      finalAnswer = fallbackAnswer(safeInput, error.message || "runtime_failed");
      setStatus("fallback");
    }

    return {
      input: safeInput,
      state_packet: statePacket,
      evidence_packet: evidencePacket,
      retrieved_evidence: evidencePacket.retrieved_evidence,
      decoder_draft: decoderDraft,
      verifier_result: verifierResult,
      final_answer: finalAnswer,
      fallback_used: fallbackUsed,
      reason: fallbackUsed ? (verifierResult.failures[0] || "runtime_failed") : "",
      security_guard: { input: inputGuard, policy: policyGuard, evidence: evidencePacket.security_guard },
      adapter_context_summary: buildAdapterContextSummary(this.contextPackets),
      answer_surface_request: answerSurfaceRequest,
      answer_surface_response: buildAnswerSurfaceResponse({
        finalAnswer,
        requestPacket: answerSurfaceRequest,
        evidencePacket
      }),
      delivery_config: this.deliveryConfig,
      capabilities: this.capabilities,
      asset_status: this.assetStatus
    };
  }
}
