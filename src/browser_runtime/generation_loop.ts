import { buildFallbackAnswer } from "./fallback_adapter.ts";
import { buildMockRetrievalPacket, buildStatePacket } from "./rag_packet.ts";
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
    if (repeatCount >= 3) break;
    previous = token;
    tokens.push(token);
    onToken(token);
    if (tokens.length >= maxTokens) break;
  }

  return {
    draft: tokens.join(" ").replace(/\s+/g, " ").trim(),
    tokens,
    finish_reason: tokens.length >= maxTokens ? "max_tokens" : "stop"
  };
}

export async function runChatPipeline(input, options = {}) {
  const statePacket = buildStatePacket(input, options);
  const retrievalPacket = buildMockRetrievalPacket(input, statePacket);
  const runtime = options.runtime || new SyntheticTinyRuntime({ mode: statePacket.mode });
  try {
    const generation = await runGenerationLoop(runtime, input, options);
    const verifierResult = verifyDraft(generation.draft, options);
    if (!verifierResult.passed) {
      return {
        input,
        state_packet: statePacket,
        retrieved_evidence: retrievalPacket.retrieved_evidence,
        decoder_draft: generation.draft,
        verifier_result: verifierResult,
        ...buildFallbackAnswer(input, verifierResult.failures[0] || "verification_failed")
      };
    }
    return {
      input,
      state_packet: statePacket,
      retrieved_evidence: retrievalPacket.retrieved_evidence,
      decoder_draft: generation.draft,
      verifier_result: verifierResult,
      final_answer: finalizeDraft(generation.draft, verifierResult),
      fallback_used: false
    };
  } catch (error) {
    return {
      input,
      state_packet: statePacket,
      retrieved_evidence: retrievalPacket.retrieved_evidence,
      decoder_draft: "",
      verifier_result: { passed: false, failures: [error.message], fallback_recommended: true },
      ...buildFallbackAnswer(input, error.message || "runtime_failed")
    };
  }
}
