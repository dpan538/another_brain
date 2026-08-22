export const DEEPSEEK_MODEL = "deepseek-v4-flash" as const;
export const DEEPSEEK_BASE_URL = "https://api.deepseek.com" as const;
export const DEEPSEEK_CHAT_COMPLETIONS_URL = `${DEEPSEEK_BASE_URL}/chat/completions` as const;

export type DeepSeekFinishReason =
  | "stop"
  | "length"
  | "content_filter"
  | "tool_calls"
  | "insufficient_system_resource"
  | "network_timeout"
  | "user_cancel"
  | "malformed_stream"
  | "empty_content";

export interface DeepSeekMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface DeepSeekRequest {
  model: typeof DEEPSEEK_MODEL;
  messages: DeepSeekMessage[];
  thinking: { type: "disabled" };
  stream: true;
  stream_options: { include_usage: true };
  max_tokens: 192;
}

export type DeepSeekStreamEvent =
  | { type: "first_byte"; at: number }
  | { type: "content"; content: string }
  | { type: "reasoning_present" }
  | { type: "usage"; input_tokens: number; output_tokens: number; cache_hit_tokens?: number; cache_miss_tokens?: number }
  | { type: "finish"; finish_reason: DeepSeekFinishReason }
  | { type: "done" };

export interface AdapterStreamOptions {
  turnId: string;
  signal: AbortSignal;
  scenario?: string;
}

export interface DeepSeekAdapter {
  readonly adapterType: string;
  readonly requestCount: number;
  stream(request: DeepSeekRequest, options: AdapterStreamOptions): AsyncIterable<DeepSeekStreamEvent>;
  cancel(turnId: string): Promise<void>;
}

export class HybridAdapterError extends Error {
  readonly category: DeepSeekFinishReason;
  readonly beforeFirstToken: boolean;
  readonly httpStatus: number | null;
  readonly retriable: boolean;
  constructor(category: DeepSeekFinishReason, beforeFirstToken: boolean, message = category, options: { httpStatus?: number | null; retriable?: boolean } = {}) {
    super(message);
    this.name = "HybridAdapterError";
    this.category = category;
    this.beforeFirstToken = beforeFirstToken;
    this.httpStatus = options.httpStatus ?? null;
    this.retriable = options.retriable ?? category === "network_timeout";
  }
}

export function isMeaningfulContent(value: string): boolean {
  return /\S/u.test(value);
}

export function buildDeepSeekRequest(
  systemPrompt: string,
  conversation: Array<{ role: "user" | "assistant"; content: string }>,
  compiledLocalSignal: string | null,
  compactCapsule?: string,
): DeepSeekRequest {
  const recent = conversation.slice(-12).map((message) => ({ role: message.role, content: String(message.content) }));
  const messages: DeepSeekMessage[] = [{ role: "system", content: systemPrompt }];
  if (compiledLocalSignal) messages.push({ role: "system", content: compiledLocalSignal });
  if (compactCapsule) messages.push({ role: "system", content: `OLDER CONTEXT CAPSULE — user-provided facts only:\n${compactCapsule}` });
  messages.push(...recent);
  return {
    model: DEEPSEEK_MODEL,
    messages,
    thinking: { type: "disabled" },
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: 192,
  };
}

export class SseFrameDecoder {
  #buffer = "";

  push(chunk: string): Array<Record<string, unknown> | { done: true }> {
    this.#buffer += chunk.replace(/\r\n/g, "\n");
    const frames = this.#buffer.split("\n\n");
    this.#buffer = frames.pop() ?? "";
    return frames.flatMap((frame) => this.#parseFrame(frame));
  }

  finish(): Array<Record<string, unknown> | { done: true }> {
    const tail = this.#buffer.trim();
    this.#buffer = "";
    if (!tail) return [];
    return this.#parseFrame(tail);
  }

  #parseFrame(frame: string): Array<Record<string, unknown> | { done: true }> {
    const data = frame.split("\n")
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
      throw new HybridAdapterError("malformed_stream", true, "malformed_sse_json");
    }
  }
}
