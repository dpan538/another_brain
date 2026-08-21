import {
  DEEPSEEK_CHAT_COMPLETIONS_URL,
  HybridAdapterError,
  SseFrameDecoder,
  type AdapterStreamOptions,
  type DeepSeekAdapter,
  type DeepSeekFinishReason,
  type DeepSeekRequest,
  type DeepSeekStreamEvent,
} from "./deepseek_adapter.ts";

function safeStatus(status: number): string {
  return `deepseek_http_${Number.isInteger(status) ? status : "error"}`;
}

export class LiveDeepSeekAdapter implements DeepSeekAdapter {
  readonly adapterType = "live_deepseek_server_only";
  requestCount = 0;
  readonly #fetch: typeof fetch;
  readonly #controllers = new Map<string, AbortController>();

  constructor(options: { fetchImpl?: typeof fetch } = {}) {
    if (typeof window !== "undefined") throw new Error("live_deepseek_adapter_server_only");
    this.#fetch = options.fetchImpl ?? fetch;
  }

  async *stream(request: DeepSeekRequest, options: AdapterStreamOptions): AsyncIterable<DeepSeekStreamEvent> {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new HybridAdapterError("network_timeout", true, "deepseek_api_key_unavailable");
    this.requestCount += 1;
    const local = new AbortController();
    this.#controllers.set(options.turnId, local);
    const externalAbort = () => local.abort("user_cancel");
    options.signal.addEventListener("abort", externalAbort, { once: true });
    const firstTokenTimer = setTimeout(() => local.abort("first_token_timeout"), 8_000);
    const totalTimer = setTimeout(() => local.abort("total_response_timeout"), 15_000);
    let firstContentSeen = false;
    try {
      const response = await this.#fetch(DEEPSEEK_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(request),
        signal: local.signal,
      });
      if (!response.ok || !response.body) throw new HybridAdapterError("network_timeout", true, safeStatus(response.status));
      const reader = response.body.getReader();
      const text = new TextDecoder();
      const sse = new SseFrameDecoder();
      let firstByte = true;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (firstByte) {
          firstByte = false;
          yield { type: "first_byte", at: performance.now() };
        }
        for (const frame of sse.push(text.decode(value, { stream: true }))) {
          if ("done" in frame) continue;
          const usage = frame.usage as Record<string, unknown> | null | undefined;
          if (usage) {
            const details = usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details;
            const hit = typeof details === "number" ? details : Number((details as Record<string, unknown> | undefined)?.cached_tokens ?? 0);
            yield {
              type: "usage",
              input_tokens: Number(usage.prompt_tokens ?? 0),
              output_tokens: Number(usage.completion_tokens ?? 0),
              cache_hit_tokens: hit,
              cache_miss_tokens: Math.max(0, Number(usage.prompt_tokens ?? 0) - hit),
            };
          }
          const choices = Array.isArray(frame.choices) ? frame.choices : [];
          for (const choice of choices as Array<Record<string, unknown>>) {
            const delta = (choice.delta ?? {}) as Record<string, unknown>;
            if (Array.isArray(delta.tool_calls) && delta.tool_calls.length) {
              throw new HybridAdapterError("tool_calls", !firstContentSeen, "unexpected_tool_calls");
            }
            if (typeof delta.content === "string" && delta.content.length) {
              if (/\S/u.test(delta.content) && !firstContentSeen) {
                firstContentSeen = true;
                clearTimeout(firstTokenTimer);
              }
              yield { type: "content", content: delta.content };
            }
            if (typeof choice.finish_reason === "string") {
              yield { type: "finish", finish_reason: choice.finish_reason as DeepSeekFinishReason };
            }
          }
        }
      }
      for (const frame of sse.finish()) {
        if (!("done" in frame)) throw new HybridAdapterError("malformed_stream", !firstContentSeen, "unterminated_sse_payload");
      }
    } catch (error) {
      if (error instanceof HybridAdapterError) throw error;
      if (local.signal.aborted) {
        const reason = local.signal.reason === "user_cancel" ? "user_cancel" : "network_timeout";
        throw new HybridAdapterError(reason, !firstContentSeen);
      }
      throw new HybridAdapterError("network_timeout", !firstContentSeen, "deepseek_network_error");
    } finally {
      clearTimeout(firstTokenTimer);
      clearTimeout(totalTimer);
      options.signal.removeEventListener("abort", externalAbort);
      this.#controllers.delete(options.turnId);
    }
  }

  async cancel(turnId: string): Promise<void> {
    this.#controllers.get(turnId)?.abort("user_cancel");
  }
}
