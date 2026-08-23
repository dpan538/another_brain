import { createHash } from "node:crypto";

import {
  HybridAdapterError,
  SseFrameDecoder,
  type DeepSeekFinishReason,
  type DeepSeekRequest,
} from "./deepseek_adapter.ts";

export interface R29P0LiveResult {
  request_started_at: string;
  request_body_sha256: string;
  model: string | null;
  system_fingerprint: string | null;
  http_status: number | null;
  api_success: boolean;
  valid_sse: boolean;
  saw_done: boolean;
  reasoning_present: boolean;
  tool_call_count: number;
  finish_reason: DeepSeekFinishReason | null;
  first_byte_ms: number | null;
  first_meaningful_token_ms: number | null;
  completion_ms: number;
  input_tokens: number;
  output_tokens: number;
  cache_hit_tokens: number;
  cache_miss_tokens: number;
  usage_present: boolean;
  response: string;
  response_sha256: string;
  error_category: string | null;
  authorization_recorded: false;
  secret_metadata_recorded: false;
  unvalidated_candidate_exposed: false;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeStatus(status: number): string {
  return `deepseek_http_${Number.isInteger(status) ? status : "error"}`;
}

export function assertR29P0LiveRequest(request: DeepSeekRequest): void {
  if (request.model !== "deepseek-v4-flash") throw new Error("r29p0_model_mismatch");
  if (request.temperature !== 0) throw new Error("r29p0_temperature_not_zero");
  if (request.thinking?.type !== "disabled") throw new Error("r29p0_thinking_not_disabled");
  if (request.stream !== true || request.stream_options?.include_usage !== true) throw new Error("r29p0_stream_contract_mismatch");
  if (request.max_tokens !== 192) throw new Error("r29p0_max_tokens_mismatch");
  if ("top_p" in request) throw new Error("r29p0_top_p_must_be_omitted");
  if ("tools" in request) throw new Error("r29p0_tools_must_be_omitted");
  if (!Array.isArray(request.messages) || request.messages.length < 2 || request.messages[0]?.role !== "system") {
    throw new Error("r29p0_message_contract_mismatch");
  }
}

export async function collectR29P0LiveResponse(
  request: DeepSeekRequest,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<R29P0LiveResult> {
  if (typeof window !== "undefined") throw new Error("r29p0_live_client_server_only");
  assertR29P0LiveRequest(request);
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("deepseek_api_key_unavailable");
  const fetchImpl = options.fetchImpl ?? fetch;
  const body = JSON.stringify(request);
  const startWall = new Date().toISOString();
  const start = performance.now();
  let firstByte: number | null = null;
  let firstMeaningful: number | null = null;
  let responseText = "";
  let model: string | null = null;
  let fingerprint: string | null = null;
  let finishReason: DeepSeekFinishReason | null = null;
  let reasoningPresent = false;
  let toolCallCount = 0;
  let sawDone = false;
  let validSse = false;
  let usagePresent = false;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheHitTokens = 0;
  let cacheMissTokens = 0;
  let httpStatus: number | null = null;
  let errorCategory: string | null = null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("r29p0_timeout"), options.timeoutMs ?? 20_000);
  try {
    const httpResponse = await fetchImpl("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body,
      signal: controller.signal,
    });
    httpStatus = httpResponse.status;
    if (!httpResponse.ok || !httpResponse.body) {
      throw new HybridAdapterError("network_timeout", true, safeStatus(httpResponse.status), {
        httpStatus: httpResponse.status,
        retriable: httpResponse.status === 408 || httpResponse.status === 429 || httpResponse.status >= 500,
      });
    }
    const reader = httpResponse.body.getReader();
    const decoder = new TextDecoder();
    const sse = new SseFrameDecoder();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (firstByte === null) firstByte = performance.now();
      for (const frame of sse.push(decoder.decode(chunk.value, { stream: true }))) {
        if ("done" in frame) {
          sawDone = true;
          continue;
        }
        if (typeof frame.model === "string") model = frame.model;
        if (typeof frame.system_fingerprint === "string") fingerprint = frame.system_fingerprint;
        const usage = frame.usage as Record<string, unknown> | null | undefined;
        if (usage) {
          usagePresent = true;
          inputTokens = Number(usage.prompt_tokens ?? 0);
          outputTokens = Number(usage.completion_tokens ?? 0);
          cacheHitTokens = Number(usage.prompt_cache_hit_tokens ?? 0);
          cacheMissTokens = Number(usage.prompt_cache_miss_tokens ?? Math.max(0, inputTokens - cacheHitTokens));
        }
        const choices = Array.isArray(frame.choices) ? frame.choices : [];
        for (const choice of choices as Array<Record<string, unknown>>) {
          const delta = (choice.delta ?? {}) as Record<string, unknown>;
          if (Array.isArray(delta.tool_calls) && delta.tool_calls.length) toolCallCount += delta.tool_calls.length;
          if (typeof delta.reasoning_content === "string" && /\S/u.test(delta.reasoning_content)) reasoningPresent = true;
          if (typeof delta.content === "string" && delta.content.length) {
            responseText += delta.content;
            if (firstMeaningful === null && /\S/u.test(delta.content)) firstMeaningful = performance.now();
          }
          if (typeof choice.finish_reason === "string") finishReason = choice.finish_reason as DeepSeekFinishReason;
        }
      }
    }
    for (const frame of sse.finish()) {
      if ("done" in frame) sawDone = true;
      else throw new HybridAdapterError("malformed_stream", firstMeaningful === null, "unterminated_sse_payload", { retriable: false });
    }
    validSse = sawDone;
    if (!sawDone) throw new HybridAdapterError("malformed_stream", firstMeaningful === null, "missing_sse_done", { retriable: false });
  } catch (error) {
    if (error instanceof HybridAdapterError) errorCategory = error.message;
    else if (controller.signal.aborted) errorCategory = "network_timeout";
    else errorCategory = "deepseek_network_error";
  } finally {
    clearTimeout(timer);
  }
  const end = performance.now();
  const response = responseText.trim();
  return {
    request_started_at: startWall,
    request_body_sha256: sha256(body),
    model,
    system_fingerprint: fingerprint,
    http_status: httpStatus,
    api_success: errorCategory === null,
    valid_sse: validSse,
    saw_done: sawDone,
    reasoning_present: reasoningPresent,
    tool_call_count: toolCallCount,
    finish_reason: finishReason,
    first_byte_ms: firstByte === null ? null : firstByte - start,
    first_meaningful_token_ms: firstMeaningful === null ? null : firstMeaningful - start,
    completion_ms: end - start,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_hit_tokens: cacheHitTokens,
    cache_miss_tokens: cacheMissTokens,
    usage_present: usagePresent,
    response,
    response_sha256: sha256(response),
    error_category: errorCategory,
    authorization_recorded: false,
    secret_metadata_recorded: false,
    unvalidated_candidate_exposed: false,
  };
}

export function r29p0LiveResultPassed(result: R29P0LiveResult): boolean {
  return result.api_success && result.valid_sse && result.saw_done && result.usage_present &&
    result.response.length > 0 && result.first_meaningful_token_ms !== null &&
    result.tool_call_count === 0 && !result.reasoning_present &&
    ["stop", "length"].includes(String(result.finish_reason));
}
