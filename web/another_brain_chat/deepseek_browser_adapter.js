// Browser-direct DeepSeek streaming adapter.
//
// The DeepSeek chat-completions origin returns CORS headers for a browser
// request (access-control-allow-origin echoes the page origin, allow-headers
// covers content-type and authorization), so this static app can call it from
// the page without any backend, Vercel Function, or Edge Function.
//
// Ported from the reviewed server-side lab adapter in src/hybrid_runtime so the
// SSE framing, finish-reason vocabulary, retry boundary, and tool-call refusal
// stay identical to what the R29 live experiments validated.

import { redactKeyMaterial } from "./deepseek_key_store.js";

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_CHAT_COMPLETIONS_URL = `${DEEPSEEK_BASE_URL}/chat/completions`;
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";

export const DEFAULT_FIRST_TOKEN_TIMEOUT_MS = 8_000;
export const DEFAULT_TOTAL_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_TOKENS = 320;
export const MAX_CONVERSATION_MESSAGES = 12;

export class DeepSeekError extends Error {
  constructor(category, beforeFirstToken, message = category, options = {}) {
    super(redactKeyMaterial(message));
    this.name = "DeepSeekError";
    this.category = category;
    this.beforeFirstToken = Boolean(beforeFirstToken);
    this.httpStatus = options.httpStatus ?? null;
    this.retriable = options.retriable ?? category === "network_timeout";
  }
}

export function isMeaningfulContent(value) {
  return /\S/u.test(String(value || ""));
}

// One system message carries the frozen answer contract. An optional second
// system message carries an advisory local-signal policy. Keeping that slot
// separate preserves the message structure the R29B2M-R4H-R3 controlled replay
// used, so a future A/B stays comparable with the recorded evidence.
export function buildDeepSeekRequest({
  systemPrompt,
  conversation = [],
  localSignalInstruction = null,
  contextCapsule = "",
  model = DEFAULT_DEEPSEEK_MODEL,
  maxTokens = DEFAULT_MAX_TOKENS,
  temperature
} = {}) {
  const recent = conversation
    .slice(-MAX_CONVERSATION_MESSAGES)
    .filter((message) => message && (message.role === "user" || message.role === "assistant"))
    .map((message) => ({ role: message.role, content: String(message.content ?? "") }));
  const messages = [{ role: "system", content: String(systemPrompt || "") }];
  if (localSignalInstruction) messages.push({ role: "system", content: String(localSignalInstruction) });
  if (contextCapsule) {
    messages.push({ role: "system", content: `OLDER CONTEXT CAPSULE — user-provided facts only:\n${contextCapsule}` });
  }
  messages.push(...recent);
  const request = {
    model,
    messages,
    thinking: { type: "disabled" },
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: Number(maxTokens) || DEFAULT_MAX_TOKENS
  };
  if (Number.isFinite(temperature)) request.temperature = Number(temperature);
  return request;
}

export class SseFrameDecoder {
  #buffer = "";

  push(chunk) {
    this.#buffer += String(chunk).replace(/\r\n/g, "\n");
    const frames = this.#buffer.split("\n\n");
    this.#buffer = frames.pop() ?? "";
    return frames.flatMap((frame) => this.#parseFrame(frame));
  }

  finish() {
    const tail = this.#buffer.trim();
    this.#buffer = "";
    return tail ? this.#parseFrame(tail) : [];
  }

  #parseFrame(frame) {
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim();
    if (!data) return [];
    if (data === "[DONE]") return [{ done: true }];
    try {
      const parsed = JSON.parse(data);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not_object");
      return [parsed];
    } catch {
      throw new DeepSeekError("malformed_stream", true, "malformed_sse_json");
    }
  }
}

function categoryForStatus(status) {
  if (status === 401 || status === 403) return "auth_rejected";
  if (status === 402) return "insufficient_balance";
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 404 || status === 422) return "request_rejected";
  return "network_timeout";
}

function retriableForStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

/**
 * Streams one DeepSeek completion. Yields:
 *   {type:"first_byte", at}
 *   {type:"content", content}
 *   {type:"reasoning_present"}
 *   {type:"usage", input_tokens, output_tokens, cache_hit_tokens, cache_miss_tokens}
 *   {type:"finish", finish_reason}
 *   {type:"done"}
 *
 * The key is placed only in the Authorization header of this one request and
 * is never attached to any other destination.
 */
export async function* streamDeepSeek(request, {
  apiKey,
  signal,
  fetchImpl = globalThis.fetch,
  firstTokenTimeoutMs = DEFAULT_FIRST_TOKEN_TIMEOUT_MS,
  totalTimeoutMs = DEFAULT_TOTAL_TIMEOUT_MS,
  url = DEEPSEEK_CHAT_COMPLETIONS_URL
} = {}) {
  if (!apiKey) throw new DeepSeekError("auth_rejected", true, "deepseek_api_key_absent", { retriable: false });
  if (typeof fetchImpl !== "function") throw new DeepSeekError("network_timeout", true, "fetch_unavailable");

  const local = new AbortController();
  const onExternalAbort = () => local.abort("user_cancel");
  if (signal) {
    if (signal.aborted) local.abort("user_cancel");
    else signal.addEventListener("abort", onExternalAbort, { once: true });
  }
  const firstTokenTimer = setTimeout(() => local.abort("first_token_timeout"), firstTokenTimeoutMs);
  const totalTimer = setTimeout(() => local.abort("total_response_timeout"), totalTimeoutMs);
  let firstContentSeen = false;

  try {
    let response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(request),
        signal: local.signal,
        cache: "no-store",
        referrerPolicy: "no-referrer"
      });
    } catch (error) {
      if (local.signal.aborted) throw abortToError(local, firstContentSeen);
      throw new DeepSeekError("network_timeout", true, "deepseek_network_unreachable");
    }

    if (!response.ok || !response.body) {
      throw new DeepSeekError(categoryForStatus(response.status), true, `deepseek_http_${response.status}`, {
        httpStatus: response.status,
        retriable: retriableForStatus(response.status)
      });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const sse = new SseFrameDecoder();
    let firstByte = true;
    let sawDone = false;

    while (true) {
      let chunk;
      try {
        chunk = await reader.read();
      } catch (error) {
        if (local.signal.aborted) throw abortToError(local, firstContentSeen);
        throw new DeepSeekError("network_timeout", !firstContentSeen, "deepseek_stream_read_failed");
      }
      if (chunk.done) break;
      if (firstByte) {
        firstByte = false;
        yield { type: "first_byte", at: nowMs() };
      }
      for (const frame of sse.push(decoder.decode(chunk.value, { stream: true }))) {
        if (frame.done) {
          sawDone = true;
          yield { type: "done" };
          continue;
        }
        const usage = frame.usage;
        if (usage) {
          const hit = Number(usage.prompt_cache_hit_tokens ?? 0);
          const miss = Number(usage.prompt_cache_miss_tokens ?? Math.max(0, Number(usage.prompt_tokens ?? 0) - hit));
          yield {
            type: "usage",
            input_tokens: Number(usage.prompt_tokens ?? 0),
            output_tokens: Number(usage.completion_tokens ?? 0),
            cache_hit_tokens: hit,
            cache_miss_tokens: miss
          };
        }
        const choices = Array.isArray(frame.choices) ? frame.choices : [];
        for (const choice of choices) {
          const delta = choice.delta ?? {};
          if (Array.isArray(delta.tool_calls) && delta.tool_calls.length) {
            throw new DeepSeekError("tool_calls", !firstContentSeen, "unexpected_tool_calls", { retriable: false });
          }
          if (typeof delta.reasoning_content === "string" && isMeaningfulContent(delta.reasoning_content)) {
            yield { type: "reasoning_present" };
          }
          if (typeof delta.content === "string" && delta.content.length) {
            if (isMeaningfulContent(delta.content) && !firstContentSeen) {
              firstContentSeen = true;
              clearTimeout(firstTokenTimer);
            }
            yield { type: "content", content: delta.content };
          }
          if (typeof choice.finish_reason === "string") {
            yield { type: "finish", finish_reason: choice.finish_reason };
          }
        }
      }
    }

    for (const frame of sse.finish()) {
      if (frame.done) {
        sawDone = true;
        yield { type: "done" };
      } else {
        throw new DeepSeekError("malformed_stream", !firstContentSeen, "unterminated_sse_payload", { retriable: false });
      }
    }
    if (!sawDone) throw new DeepSeekError("malformed_stream", !firstContentSeen, "missing_sse_done", { retriable: false });
  } catch (error) {
    if (error instanceof DeepSeekError) throw error;
    if (local.signal.aborted) throw abortToError(local, firstContentSeen);
    throw new DeepSeekError("network_timeout", !firstContentSeen, "deepseek_unexpected_error");
  } finally {
    clearTimeout(firstTokenTimer);
    clearTimeout(totalTimer);
    if (signal) signal.removeEventListener("abort", onExternalAbort);
  }
}

function abortToError(controller, firstContentSeen) {
  const reason = controller.signal.reason;
  if (reason === "user_cancel") return new DeepSeekError("user_cancel", !firstContentSeen, "user_cancel", { retriable: false });
  if (reason === "first_token_timeout") return new DeepSeekError("network_timeout", true, "first_token_timeout");
  return new DeepSeekError("network_timeout", !firstContentSeen, "total_response_timeout");
}

function nowMs() {
  return typeof performance === "object" && performance && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}
