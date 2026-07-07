import { buildFallbackAnswer } from "./fallback_adapter.ts";
import {
  applyImportedStatePackets,
  buildAdapterContextSummary,
  buildAnswerSurfaceRequest,
  buildAnswerSurfaceResponse
} from "./context_adapter.ts";
import { finalizeAnswerSurface } from "./finalizer_adapter.ts";
import { buildGenerationPrompt } from "./generation_prompt.ts";
import { buildRetrievalPacket, buildStatePacket } from "./rag_packet.ts";
import { finalizeDraft, verifyDraft } from "./verifier_adapter.ts";

export const R28GEN0_GENERATION_POLICY_VERSION = "r28gen0-deterministic-generation-policy-v1";

const DEFAULT_STOP_TOKENS = Object.freeze(["<eos>", "</s>", "[DONE]", "<|endoftext|>"]);
const DEFAULT_BAD_TOKEN_PATTERNS = Object.freeze([
  /^token_id:\d+$/i,
  /^<\|.*\|>$/,
  /^<unk>$/i,
  /[�\u0000-\u0008\u000B\u000C\u000E-\u001F]/
]);

function compactDraft(tokens) {
  return tokens.join(" ").replace(/\s+/g, " ").trim();
}

export function normalizeGenerationPolicy(options = {}) {
  const maxTokenCap = Math.max(1, Number(options.maxTokenCap || 64));
  const requestedMax = Number(options.maxNewTokens || options.maxTokens || 16);
  return {
    version: R28GEN0_GENERATION_POLICY_VERSION,
    decoding: "greedy",
    max_new_tokens: Math.min(Math.max(requestedMax || 16, 1), maxTokenCap),
    max_token_cap: maxTokenCap,
    context_length: Number(options.contextLength || 256),
    timeout_ms: Number(options.timeoutMs || 3000),
    repetition_limit: Math.max(2, Number(options.repetitionLimit || 6)),
    stop_tokens: Array.isArray(options.stopTokens) ? options.stopTokens : [...DEFAULT_STOP_TOKENS],
    bad_token_guard: true,
    repetition_guard: true,
    empty_output_fallback: true,
    token_id_only_fallback: true,
    lossy_decode_warning: true
  };
}

function isStopToken(token, policy) {
  const cleaned = String(token || "").trim();
  return cleaned && policy.stop_tokens.includes(cleaned);
}

function isBadToken(token) {
  const cleaned = String(token || "").trim();
  return DEFAULT_BAD_TOKEN_PATTERNS.some((pattern) => pattern.test(cleaned));
}

export function isTokenIdOnlyDraft(text, tokens = []) {
  const values = tokens.length ? tokens : String(text || "").split(/\s+/).filter(Boolean);
  if (values.length === 0) return false;
  return values.every((token) => /^(token_id:\d+|\d+)$/i.test(String(token || "").trim()));
}

export function generationNeedsSurfaceFallback(generation) {
  if (!generation) return "generation_missing";
  if (!String(generation.draft || "").trim()) return "empty_output";
  if (generation.bad_token_blocked) return "bad_token_blocked";
  if (generation.repetition_guard_triggered) return "repetition_guard_triggered";
  if (isTokenIdOnlyDraft(generation.draft, generation.tokens)) return "token_id_only_output";
  return "";
}

export class SyntheticTinyRuntime {
  constructor(options = {}) {
    this.mode = options.mode || "synthetic_tiny";
    this.loaded = false;
  }

  async load() {
    this.loaded = true;
    return { mode: this.mode, status: "loaded", product_model: false };
  }

  async *generate(prompt, options = {}) {
    const words = [
      "Static",
      "browser",
      "draft:",
      String(prompt || "").slice(0, 80),
      "local",
      "runtime",
      "smoke",
      "complete."
    ];
    const maxTokens = Math.min(Number(options.maxTokens || 32), words.length);
    for (let index = 0; index < maxTokens; index += 1) {
      yield words[index];
    }
  }
}

function abortError() {
  const error = new Error("generation_aborted");
  error.name = "AbortError";
  return error;
}

export async function runGenerationLoop(runtime, prompt, options = {}) {
  const policy = normalizeGenerationPolicy(options);
  const maxTokens = policy.max_new_tokens;
  const contextLength = policy.context_length;
  const timeoutMs = policy.timeout_ms;
  const repetitionLimit = policy.repetition_limit;
  const signal = options.signal;
  const onToken = typeof options.onToken === "function" ? options.onToken : () => {};
  const started = Date.now();
  const tokens = [];
  let previous = "";
  let repeatCount = 0;
  let finishReason = "stop";
  let fallbackReason = "";
  let badTokenBlocked = false;
  let repetitionGuardTriggered = false;
  let stoppedByToken = false;

  if (signal?.aborted) throw abortError();
  if (String(prompt || "").length > contextLength * 8) {
    throw new Error("context_length_cap_exceeded");
  }
  if (!runtime.loaded) await runtime.load();

  for await (const token of runtime.generate(prompt, { maxTokens, contextLength })) {
    if (signal?.aborted) throw abortError();
    if (Date.now() - started > timeoutMs) throw new Error("generation_timeout");
    if (isStopToken(token, policy)) {
      stoppedByToken = true;
      finishReason = "stop_token";
      break;
    }
    if (policy.bad_token_guard && isBadToken(token)) {
      badTokenBlocked = true;
      fallbackReason = "bad_token_blocked";
      finishReason = "bad_token";
      break;
    }
    if (token === previous) repeatCount += 1;
    else repeatCount = 0;
    if (policy.repetition_guard && repeatCount >= repetitionLimit) {
      repetitionGuardTriggered = true;
      fallbackReason = "repetition_guard_triggered";
      finishReason = "repetition_guard";
      break;
    }
    previous = token;
    tokens.push(token);
    onToken(token, { token_index: tokens.length - 1 });
    if (tokens.length >= maxTokens) {
      finishReason = "max_tokens";
      break;
    }
  }

  const runtimeStats = runtime.lastGenerationStats || {};
  const draft = compactDraft(tokens);
  const decodeStatus = runtimeStats.decode_status || "";
  const policyFallbackReason = fallbackReason || generationNeedsSurfaceFallback({ draft, tokens, bad_token_blocked: badTokenBlocked, repetition_guard_triggered: repetitionGuardTriggered });
  const lossyDecodeWarning = decodeStatus && decodeStatus !== "exact_runtime_tokenizer";
  return {
    draft,
    tokens,
    finish_reason: finishReason,
    tokens_generated: tokens.length,
    elapsed_ms: Date.now() - started,
    runtime_mode: runtime.mode || "unknown",
    fallback_used: false,
    generation_policy: policy,
    needs_fallback: Boolean(policyFallbackReason),
    fallback_reason: policyFallbackReason,
    repetition_guard_triggered: repetitionGuardTriggered,
    bad_token_blocked: badTokenBlocked,
    stopped_by_token: stoppedByToken,
    lossy_decode_warning: Boolean(lossyDecodeWarning),
    decode_status: runtimeStats.decode_status || "",
    decoded_text_available: runtimeStats.decoded_text_available === true || tokens.join("").trim().length > 0,
    generated_token_ids: runtimeStats.token_ids || [],
    quality_status: runtimeStats.quality_status || "not_assessed"
  };
}

export async function runChatPipeline(input, options = {}) {
  const contextPackets = options.contextPackets || options.adapterPackets || [];
  const statePacket = applyImportedStatePackets(buildStatePacket(input, options), contextPackets);
  const runtime = options.runtime || new SyntheticTinyRuntime({ mode: statePacket.mode });
  let evidencePacket = null;
  let answerSurfaceRequest = null;
  try {
    evidencePacket = options.evidencePacket || await buildRetrievalPacket(input, statePacket, { ...options, contextPackets });
    answerSurfaceRequest = buildAnswerSurfaceRequest({ input, statePacket, evidencePacket, contextPackets });
    const promptPacket = buildGenerationPrompt(input, evidencePacket, { ...options, statePacket, contextPackets });
    const generation = await runGenerationLoop(runtime, promptPacket.prompt, options);
    const verifierResult = verifyDraft(generation.draft, { ...options, evidencePacket });
    if (!verifierResult.passed) {
      const fallback = finalizeAnswerSurface({
        input,
        draft: generation.draft,
        evidencePacket,
        verifierResult,
        generation,
        promptPacket: promptPacket.packet
      });
      return {
        input,
        state_packet: statePacket,
        prompt_packet: promptPacket.packet,
        evidence_packet: evidencePacket,
        retrieved_evidence: evidencePacket.retrieved_evidence,
        decoder_draft: generation.draft,
        generation_result: generation,
        verifier_result: verifierResult,
        ...fallback,
        adapter_context_summary: buildAdapterContextSummary(contextPackets),
        answer_surface_request: answerSurfaceRequest,
        answer_surface_response: buildAnswerSurfaceResponse({
          finalAnswer: fallback.final_answer,
          requestPacket: answerSurfaceRequest,
          evidencePacket
        })
      };
    }
    const modelFinal = finalizeDraft(generation.draft, verifierResult);
    const finalized = finalizeAnswerSurface({
      input,
      draft: modelFinal,
      evidencePacket,
      verifierResult,
      generation,
      promptPacket: promptPacket.packet
    });
    return {
      input,
      state_packet: statePacket,
      prompt_packet: promptPacket.packet,
      evidence_packet: evidencePacket,
      retrieved_evidence: evidencePacket.retrieved_evidence,
      decoder_draft: generation.draft,
      generation_result: generation,
      verifier_result: verifierResult,
      ...finalized,
      adapter_context_summary: buildAdapterContextSummary(contextPackets),
      answer_surface_request: answerSurfaceRequest,
      answer_surface_response: buildAnswerSurfaceResponse({
        finalAnswer: finalized.final_answer,
        requestPacket: answerSurfaceRequest,
        evidencePacket
      })
    };
  } catch (error) {
    const baseFallback = buildFallbackAnswer(input, error.message || "runtime_failed");
    const fallback = {
      ...finalizeAnswerSurface({
        input,
        draft: "",
        evidencePacket: evidencePacket || { evidence_status: "insufficient" },
        verifierResult: { passed: false, failures: [error.message || "runtime_failed"] },
        generation: { needs_fallback: true, fallback_reason: "runtime_failed" }
      }),
      reason: error.message || baseFallback.reason || "runtime_failed"
    };
    return {
      input,
      state_packet: statePacket,
      evidence_packet: evidencePacket,
      retrieved_evidence: evidencePacket?.retrieved_evidence || [],
      decoder_draft: "",
      verifier_result: { passed: false, failures: [error.message], fallback_recommended: true },
      ...fallback,
      adapter_context_summary: buildAdapterContextSummary(contextPackets),
      answer_surface_request: answerSurfaceRequest,
      answer_surface_response: buildAnswerSurfaceResponse({
        finalAnswer: fallback.final_answer,
        requestPacket: answerSurfaceRequest,
        evidencePacket
      })
    };
  }
}
