import { buildFallbackAnswer } from "./fallback_adapter.ts";
import {
  applyImportedStatePackets,
  buildAdapterContextSummary,
  buildAnswerSurfaceRequest,
  buildAnswerSurfaceResponse
} from "./context_adapter.ts";
import { buildRetrievalPacket, buildStatePacket } from "./rag_packet.ts";
import { finalizeDraft, verifyDraft } from "./verifier_adapter.ts";

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
  const maxTokens = Math.min(Math.max(Number(options.maxTokens || 32), 1), Number(options.maxTokenCap || 128));
  const contextLength = Number(options.contextLength || 256);
  const timeoutMs = Number(options.timeoutMs || 3000);
  const repetitionLimit = Math.max(2, Number(options.repetitionLimit || 6));
  const signal = options.signal;
  const onToken = typeof options.onToken === "function" ? options.onToken : () => {};
  const started = Date.now();
  const tokens = [];
  let previous = "";
  let repeatCount = 0;

  if (signal?.aborted) throw abortError();
  if (String(prompt || "").length > contextLength * 8) {
    throw new Error("context_length_cap_exceeded");
  }
  if (!runtime.loaded) await runtime.load();

  for await (const token of runtime.generate(prompt, { maxTokens, contextLength })) {
    if (signal?.aborted) throw abortError();
    if (Date.now() - started > timeoutMs) throw new Error("generation_timeout");
    if (token === previous) repeatCount += 1;
    else repeatCount = 0;
    if (repeatCount >= repetitionLimit) break;
    previous = token;
    tokens.push(token);
    onToken(token, { token_index: tokens.length - 1 });
    if (tokens.length >= maxTokens) break;
  }

  const runtimeStats = runtime.lastGenerationStats || {};
  return {
    draft: tokens.join(" ").replace(/\s+/g, " ").trim(),
    tokens,
    finish_reason: tokens.length >= maxTokens ? "max_tokens" : "stop",
    tokens_generated: tokens.length,
    elapsed_ms: Date.now() - started,
    runtime_mode: runtime.mode || "unknown",
    fallback_used: false,
    decode_status: runtimeStats.decode_status || "",
    decoded_text_available: runtimeStats.decoded_text_available === true || tokens.join("").trim().length > 0,
    generated_token_ids: runtimeStats.token_ids || [],
    quality_status: runtimeStats.quality_status || "not_assessed"
  };
}

function buildDecoderPrompt(input, evidencePacket) {
  const evidenceLines = (evidencePacket?.retrieved_evidence || [])
    .slice(0, 3)
    .map((item) => `- ${item.title}: ${item.text}`)
    .join("\n");
  return [
    `Query: ${String(input || "").trim()}`,
    "Evidence packet:",
    evidenceLines || "- no local evidence",
    `Evidence status: ${evidencePacket?.evidence_status || "insufficient"}`,
    `Policy hint: ${evidencePacket?.answer_policy_hint || "ask_clarifying"}`
  ].join("\n");
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
    const generation = await runGenerationLoop(runtime, buildDecoderPrompt(input, evidencePacket), options);
    const verifierResult = verifyDraft(generation.draft, { ...options, evidencePacket });
    if (!verifierResult.passed) {
      const fallback = buildFallbackAnswer(input, verifierResult.failures[0] || "verification_failed");
      return {
        input,
        state_packet: statePacket,
        evidence_packet: evidencePacket,
        retrieved_evidence: evidencePacket.retrieved_evidence,
        decoder_draft: generation.draft,
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
    const finalAnswer = finalizeDraft(generation.draft, verifierResult);
    return {
      input,
      state_packet: statePacket,
      evidence_packet: evidencePacket,
      retrieved_evidence: evidencePacket.retrieved_evidence,
      decoder_draft: generation.draft,
      verifier_result: verifierResult,
      final_answer: finalAnswer,
      fallback_used: false,
      adapter_context_summary: buildAdapterContextSummary(contextPackets),
      answer_surface_request: answerSurfaceRequest,
      answer_surface_response: buildAnswerSurfaceResponse({
        finalAnswer,
        requestPacket: answerSurfaceRequest,
        evidencePacket
      })
    };
  } catch (error) {
    const fallback = buildFallbackAnswer(input, error.message || "runtime_failed");
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
