// Streaming transport to DeepSeek.
//
// Two modes share one parser:
//   direct — the browser calls api.deepseek.com with a key the person supplied
//            at runtime (the origin answers CORS preflight for browser callers);
//   proxy  — the browser calls a same-origin endpoint that holds the key
//            server-side and passes the provider's SSE through unchanged.
// Which one runs is a deployment decision, not a code change.

import { redactKeyMaterial } from "./key_store.js";

export const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
export const DEFAULT_MODEL = "deepseek-flash";      // current name; "deepseek-v4-flash" is a retired alias of the same model
export const FIRST_TOKEN_TIMEOUT_MS = 8_000;
export const TOTAL_TIMEOUT_MS = 20_000;

export class StreamError extends Error {
  constructor(category, beforeFirstToken, message = category, options = {}) {
    super(redactKeyMaterial(message));
    this.name = "StreamError";
    this.category = category;
    this.beforeFirstToken = Boolean(beforeFirstToken);
    this.httpStatus = options.httpStatus ?? null;
    this.retriable = options.retriable ?? category === "network";
  }
}

export class SseDecoder {
  #buffer = "";
  push(chunk) {
    this.#buffer += String(chunk).replace(/\r\n/g, "\n");
    const frames = this.#buffer.split("\n\n");
    this.#buffer = frames.pop() ?? "";
    return frames.flatMap((f) => this.#parse(f));
  }
  finish() {
    const tail = this.#buffer.trim();
    this.#buffer = "";
    return tail ? this.#parse(tail) : [];
  }
  #parse(frame) {
    const data = frame.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n").trim();
    if (!data) return [];
    if (data === "[DONE]") return [{ done: true }];
    try {
      const parsed = JSON.parse(data);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not_object");
      return [parsed];
    } catch {
      throw new StreamError("malformed_stream", true, "malformed_sse_json", { retriable: false });
    }
  }
}

function categoryFor(status, viaProxy) {
  if (viaProxy && (status === 503 || status === 404 || status === 405)) return "not_configured";   // endpoint absent or has no key yet
  if (viaProxy && status === 403) return "proxy_rejected";
  if (status === 401 || status === 403) return "auth_rejected";
  if (status === 402) return "insufficient_balance";
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 404 || status === 422) return "request_rejected";
  return "network";
}

export function buildRequest({ systemPrompt, conversation = [], extraSystem = "", model = DEFAULT_MODEL, maxTokens = 160 }) {
  const messages = [{ role: "system", content: String(systemPrompt || "") }];
  if (extraSystem) messages.push({ role: "system", content: String(extraSystem) });
  for (const m of conversation.slice(-12)) {
    if (m && (m.role === "user" || m.role === "assistant")) messages.push({ role: m.role, content: String(m.content ?? "") });
  }
  return { model, messages, thinking: { type: "disabled" }, stream: true, stream_options: { include_usage: true }, max_tokens: maxTokens };
}

/** Yields {type:"content",content} | {type:"usage",...} | {type:"finish",finish_reason} | {type:"done"} */
export async function* streamCompletion(request, { apiKey = "", proxyUrl = "", signal, fetchImpl = globalThis.fetch,
  firstTokenTimeoutMs = FIRST_TOKEN_TIMEOUT_MS, totalTimeoutMs = TOTAL_TIMEOUT_MS } = {}) {
  const viaProxy = Boolean(proxyUrl);
  if (!viaProxy && !apiKey) throw new StreamError("auth_rejected", true, "api_key_absent", { retriable: false });

  const local = new AbortController();
  const onAbort = () => local.abort("user_cancel");
  if (signal) { if (signal.aborted) local.abort("user_cancel"); else signal.addEventListener("abort", onAbort, { once: true }); }
  const tFirst = setTimeout(() => local.abort("first_token_timeout"), firstTokenTimeoutMs);
  const tTotal = setTimeout(() => local.abort("total_timeout"), totalTimeoutMs);
  let sawContent = false;

  const abortError = () => {
    const r = local.signal.reason;
    if (r === "user_cancel") return new StreamError("user_cancel", !sawContent, "user_cancel", { retriable: false });
    return new StreamError("network", r === "first_token_timeout" ? true : !sawContent, String(r || "timeout"));
  };

  try {
    const headers = { "Content-Type": "application/json" };
    if (!viaProxy) headers.Authorization = `Bearer ${apiKey}`;
    let response;
    try {
      // Through the proxy only the conversation travels. The persona, the model and
      // the token ceiling are fixed on the server and cannot be set from here.
      const payload = viaProxy ? { messages: request.messages.filter((m) => m.role !== "system") } : request;
      response = await fetchImpl(viaProxy ? proxyUrl : DEEPSEEK_URL, {
        method: "POST", headers, body: JSON.stringify(payload), signal: local.signal, cache: "no-store", referrerPolicy: "no-referrer"
      });
    } catch {
      if (local.signal.aborted) throw abortError();
      throw new StreamError("network", true, "unreachable");
    }
    if (!response.ok || !response.body) {
      throw new StreamError(categoryFor(response.status, viaProxy), true, `http_${response.status}`, {
        httpStatus: response.status, retriable: response.status === 408 || response.status === 429 || response.status >= 500
      });
    }
    const reader = response.body.getReader();
    const text = new TextDecoder();
    const sse = new SseDecoder();
    let sawDone = false;
    const handle = function* (frame) {
      if (frame.done) { sawDone = true; yield { type: "done" }; return; }
      if (frame.usage) {
        const hit = Number(frame.usage.prompt_cache_hit_tokens ?? 0);
        yield { type: "usage", input_tokens: Number(frame.usage.prompt_tokens ?? 0), output_tokens: Number(frame.usage.completion_tokens ?? 0), cache_hit_tokens: hit };
      }
      for (const choice of Array.isArray(frame.choices) ? frame.choices : []) {
        const delta = choice.delta ?? {};
        if (Array.isArray(delta.tool_calls) && delta.tool_calls.length) throw new StreamError("tool_calls", !sawContent, "unexpected_tool_calls", { retriable: false });
        if (typeof delta.content === "string" && delta.content.length) {
          if (/\S/u.test(delta.content) && !sawContent) { sawContent = true; clearTimeout(tFirst); }
          yield { type: "content", content: delta.content };
        }
        if (typeof choice.finish_reason === "string") yield { type: "finish", finish_reason: choice.finish_reason };
      }
    };
    while (true) {
      let chunk;
      try { chunk = await reader.read(); } catch { if (local.signal.aborted) throw abortError(); throw new StreamError("network", !sawContent, "read_failed"); }
      if (chunk.done) break;
      for (const frame of sse.push(text.decode(chunk.value, { stream: true }))) yield* handle(frame);
    }
    for (const frame of sse.finish()) yield* handle(frame);
    if (!sawDone) throw new StreamError("malformed_stream", !sawContent, "missing_done", { retriable: false });
  } catch (error) {
    if (error instanceof StreamError) throw error;
    if (local.signal.aborted) throw abortError();
    throw new StreamError("network", !sawContent, "unexpected");
  } finally {
    clearTimeout(tFirst); clearTimeout(tTotal);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}
