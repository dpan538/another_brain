import {
  HybridAdapterError,
  type AdapterStreamOptions,
  type DeepSeekAdapter,
  type DeepSeekRequest,
  type DeepSeekStreamEvent,
} from "./deepseek_adapter.ts";

function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException("request_cancelled", "AbortError"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("request_cancelled", "AbortError"));
    }, { once: true });
  });
}

export class MockDeepSeekAdapter implements DeepSeekAdapter {
  readonly adapterType = "mock_deepseek_sse";
  requestCount = 0;
  readonly requests: Array<{ turn_id: string; model: string; message_count: number; thinking: string; max_tokens: number }> = [];
  readonly #attempts = new Map<string, number>();
  readonly #controllers = new Map<string, AbortController>();
  readonly chunkDelayMs: number;

  constructor(options: { chunkDelayMs?: number } = {}) {
    this.chunkDelayMs = options.chunkDelayMs ?? 0;
  }

  async *stream(request: DeepSeekRequest, options: AdapterStreamOptions): AsyncIterable<DeepSeekStreamEvent> {
    this.requestCount += 1;
    const attempt = (this.#attempts.get(options.turnId) ?? 0) + 1;
    this.#attempts.set(options.turnId, attempt);
    this.requests.push({
      turn_id: options.turnId,
      model: request.model,
      message_count: request.messages.length,
      thinking: request.thinking.type,
      max_tokens: request.max_tokens,
    });
    const local = new AbortController();
    this.#controllers.set(options.turnId, local);
    const abort = () => local.abort();
    options.signal.addEventListener("abort", abort, { once: true });
    const signal = local.signal;
    const scenario = options.scenario ?? "normal";
    try {
      if (["timeout", "connection_before_first"].includes(scenario)) {
        await wait(Math.max(1, this.chunkDelayMs), signal);
        throw new HybridAdapterError("network_timeout", true);
      }
      if (scenario === "retry_before_first" && attempt === 1) {
        throw new HybridAdapterError("network_timeout", true, "simulated_retryable_failure");
      }
      if (scenario === "malformed_sse") throw new HybridAdapterError("malformed_stream", true);
      if (scenario === "cancel") await wait(Math.max(30, this.chunkDelayMs), signal);
      yield { type: "first_byte", at: performance.now() };
      if (scenario === "empty_content") {
        yield { type: "content", content: "   " };
        yield { type: "finish", finish_reason: "stop" };
        return;
      }
      if (scenario === "resource_stop") {
        yield { type: "finish", finish_reason: "insufficient_system_resource" };
        return;
      }
      if (scenario === "unexpected_tool_call") {
        yield { type: "finish", finish_reason: "tool_calls" };
        return;
      }
      const chunks = scenario === "slow_stream"
        ? ["这是一段", "缓慢但有序的", "简短模拟回答。"]
        : ["这是一段", "用于链路验证的", "简短模拟回答。"];
      for (let index = 0; index < chunks.length; index += 1) {
        await wait(scenario === "slow_stream" ? Math.max(4, this.chunkDelayMs) : this.chunkDelayMs, signal);
        yield { type: "content", content: chunks[index] };
        if (scenario === "connection_after_first" && index === 0) {
          throw new HybridAdapterError("network_timeout", false, "simulated_post_token_disconnect");
        }
      }
      yield { type: "usage", input_tokens: 96, output_tokens: 18, cache_hit_tokens: 0, cache_miss_tokens: 96 };
      yield { type: "finish", finish_reason: scenario === "length_stop" ? "length" : "stop" };
    } finally {
      options.signal.removeEventListener("abort", abort);
      this.#controllers.delete(options.turnId);
    }
  }

  async cancel(turnId: string): Promise<void> {
    this.#controllers.get(turnId)?.abort();
  }
}
