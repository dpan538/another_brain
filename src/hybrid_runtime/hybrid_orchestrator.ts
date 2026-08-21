import {
  HybridAdapterError,
  buildDeepSeekRequest,
  isMeaningfulContent,
  type DeepSeekAdapter,
  type DeepSeekFinishReason,
} from "./deepseek_adapter.ts";
import { compileStylePolicy } from "./style_policy_compiler.ts";
import { validateLocalSignalPacket } from "./local_signal_packet_validator.ts";
import type { LocalSignalPacketV1 } from "./local_signal_packet.ts";
import type { SignalInput, SignalProvider } from "./signal_provider.ts";
import {
  HybridTelemetryCollector,
  SpendingGuard,
  packetSha256,
  sanitizeTelemetryError,
  type HybridTelemetryRecord,
} from "./hybrid_telemetry.ts";

export type HybridSourceTrace =
  | "hybrid_oracle_simulation"
  | "hybrid_heuristic_simulation"
  | "hybrid_future_efish"
  | "deepseek_only_ablation"
  | "hybrid_signal_unavailable";

export interface HybridTurnInput extends SignalInput {
  conversation: Array<{ role: "user" | "assistant"; content: string }>;
  compactCapsule?: string;
  scenario?: string;
  ablationArm?: "hybrid" | "deepseek_only";
  onState?: (state: string) => void;
  onChunk?: (chunk: string) => void;
}

export interface HybridTurnResult {
  turn_id: string;
  status: string;
  display_source: "HYBRID";
  source_trace: HybridSourceTrace;
  content: string;
  finish_reason: DeepSeekFinishReason | null;
  request_count: number;
  retry_count: number;
  signal_retry_count: number;
  packet: LocalSignalPacketV1 | null;
  compiled_style_policy: string | null;
  telemetry: HybridTelemetryRecord;
}

function jitterFor(turnId: string): number {
  return 12 + Array.from(turnId).reduce((sum, char) => sum + (char.codePointAt(0) ?? 0), 0) % 17;
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException("cancelled", "AbortError"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("cancelled", "AbortError"));
    }, { once: true });
  });
}

export class HybridOrchestrator {
  readonly signalProvider: SignalProvider;
  readonly adapter: DeepSeekAdapter;
  readonly telemetry: HybridTelemetryCollector;
  readonly spendingGuard: SpendingGuard;
  readonly systemPrompt: string;
  readonly allowDeepseekOnlyAblation: boolean;
  #activeTurnId: string | null = null;
  readonly #controllers = new Map<string, AbortController>();
  readonly #cancelKinds = new Map<string, "user" | "stale">();

  constructor(options: {
    signalProvider: SignalProvider;
    adapter: DeepSeekAdapter;
    telemetry: HybridTelemetryCollector;
    spendingGuard?: SpendingGuard;
    systemPrompt: string;
    allowDeepseekOnlyAblation?: boolean;
  }) {
    this.signalProvider = options.signalProvider;
    this.adapter = options.adapter;
    this.telemetry = options.telemetry;
    this.spendingGuard = options.spendingGuard ?? new SpendingGuard({ requestLimit: 1_000_000, inputTokenLimit: 1_000_000_000, outputTokenLimit: 1_000_000_000, concurrencyLimit: 4 });
    this.systemPrompt = options.systemPrompt;
    this.allowDeepseekOnlyAblation = options.allowDeepseekOnlyAblation ?? false;
  }

  async ready(): Promise<boolean> { return this.signalProvider.ready(); }

  async #abortTurn(turnId: string, kind: "user" | "stale"): Promise<void> {
    this.#cancelKinds.set(turnId, kind);
    this.#controllers.get(turnId)?.abort(kind === "user" ? "user_cancel" : "stale_turn");
    await Promise.allSettled([this.signalProvider.cancel(turnId), this.adapter.cancel(turnId)]);
    if (this.#activeTurnId === turnId) this.#activeTurnId = null;
  }

  async cancel(turnId: string): Promise<void> { await this.#abortTurn(turnId, "user"); }

  async runTurn(input: HybridTurnInput): Promise<HybridTurnResult> {
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(input.turnId)) throw new Error("invalid_turn_id");
    if (!input.currentUserMessage.trim() || Array.from(input.currentUserMessage).length > 4_000) throw new Error("invalid_user_input");
    if (input.ablationArm === "deepseek_only" && !this.allowDeepseekOnlyAblation) throw new Error("deepseek_only_ablation_not_authorized");
    if (this.#activeTurnId && this.#activeTurnId !== input.turnId) await this.#abortTurn(this.#activeTurnId, "stale");

    const controller = new AbortController();
    this.#controllers.set(input.turnId, controller);
    this.#activeTurnId = input.turnId;
    const started = performance.now();
    input.onState?.("responding");
    const deepseekOnly = input.ablationArm === "deepseek_only";
    let sourceTrace: HybridSourceTrace = deepseekOnly
      ? "deepseek_only_ablation"
      : this.signalProvider.providerType.includes("oracle")
        ? "hybrid_oracle_simulation"
        : this.signalProvider.providerType.includes("heuristic")
          ? "hybrid_heuristic_simulation"
          : "hybrid_future_efish";
    let packet: LocalSignalPacketV1 | null = null;
    let compiled: { instruction: string; fields_used: string[] } | null = null;
    let signalRetryCount = 0;
    let signalEnd: number | null = null;
    let packetValid = false;
    let status = "STARTED";
    let content = "";
    let finishReason: DeepSeekFinishReason | null = null;
    let retryCount = 0;
    let firstByte: number | null = null;
    let firstContent: number | null = null;
    let requestStart: number | null = null;
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheHitTokens = 0;
    let cacheMissTokens = 0;
    const requestsBefore = this.adapter.requestCount;
    let errorCategory: string | null = null;
    let guardActive = false;
    const declaredDelay = Number((this.signalProvider as SignalProvider & { delayMs?: number }).delayMs ?? 0);

    const finalize = (): HybridTurnResult => {
      const ended = performance.now();
      const record: HybridTelemetryRecord = {
        turn_id: input.turnId,
        public_fixture_id: input.caseId ?? null,
        adapter_type: this.adapter.adapterType,
        signal_provider_type: this.signalProvider.providerType,
        source_trace: sourceTrace,
        packet_sha256: packet ? packetSha256(packet) : null,
        packet_validation_valid: packetValid,
        packet_fields_used: compiled?.fields_used ?? [],
        signal_start_ms: started,
        signal_end_ms: signalEnd,
        signal_elapsed_ms: signalEnd === null ? null : signalEnd - started,
        declared_signal_delay_ms: declaredDelay,
        request_start_ms: requestStart,
        first_byte_ms: firstByte,
        first_content_ms: firstContent,
        stream_end_ms: ended,
        ttft_ms: firstContent === null ? null : firstContent - started,
        total_elapsed_ms: ended - started,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_hit_tokens: cacheHitTokens,
        cache_miss_tokens: cacheMissTokens,
        retry_count: retryCount,
        request_count: this.adapter.requestCount - requestsBefore,
        finish_reason: finishReason,
        cancelled: finishReason === "user_cancel",
        response_length: Array.from(content).length,
        error_category: errorCategory,
        estimated_cost: 0,
        raw_message_recorded: false,
      };
      this.telemetry.add(record);
      return {
        turn_id: input.turnId,
        status,
        display_source: "HYBRID",
        source_trace: sourceTrace,
        content,
        finish_reason: finishReason,
        request_count: record.request_count,
        retry_count: retryCount,
        signal_retry_count: signalRetryCount,
        packet,
        compiled_style_policy: compiled?.instruction ?? null,
        telemetry: record,
      };
    };

    try {
      if (!deepseekOnly) {
        input.onState?.("signal");
        if (!(await this.signalProvider.ready())) {
          signalEnd = performance.now();
          status = "HYBRID_NOT_READY";
          sourceTrace = "hybrid_signal_unavailable";
          return finalize();
        }
        for (let attempt = 0; attempt < 2; attempt += 1) {
          packet = await this.signalProvider.analyze(input);
          const validation = validateLocalSignalPacket(packet, input.currentUserMessage);
          if (validation.valid) {
            packetValid = true;
            break;
          }
          packet = null;
          if (attempt === 0) signalRetryCount += 1;
        }
        signalEnd = performance.now();
        if (!packet || !packetValid) {
          status = "HYBRID_SIGNAL_UNAVAILABLE";
          sourceTrace = "hybrid_signal_unavailable";
          errorCategory = "packet_validation_failed_after_retry";
          return finalize();
        }
        compiled = compileStylePolicy(packet, input.currentUserMessage);
      } else {
        signalEnd = performance.now();
      }

      const request = buildDeepSeekRequest(this.systemPrompt, input.conversation, compiled?.instruction ?? null, input.compactCapsule);
      input.onState?.("streaming");
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (!this.spendingGuard.canStart()) {
          status = "SPENDING_GUARD_BLOCKED";
          errorCategory = "live_spending_guard_blocked";
          break;
        }
        this.spendingGuard.start();
        guardActive = true;
        requestStart ??= performance.now();
        let thisAttemptSawContent = false;
        try {
          for await (const event of this.adapter.stream(request, { turnId: input.turnId, signal: controller.signal, scenario: input.scenario })) {
            if (controller.signal.aborted) throw new DOMException("cancelled", "AbortError");
            if (event.type === "first_byte") firstByte ??= event.at;
            if (event.type === "usage") {
              inputTokens = event.input_tokens;
              outputTokens = event.output_tokens;
              cacheHitTokens = event.cache_hit_tokens ?? 0;
              cacheMissTokens = event.cache_miss_tokens ?? Math.max(0, inputTokens - cacheHitTokens);
            }
            if (event.type === "content") {
              if (isMeaningfulContent(event.content)) {
                thisAttemptSawContent = true;
                firstContent ??= performance.now();
              }
              if (this.#activeTurnId === input.turnId) {
                content += event.content;
                input.onChunk?.(event.content);
              }
            }
            if (event.type === "finish") finishReason = event.finish_reason;
          }
          this.spendingGuard.finish(inputTokens, outputTokens);
          guardActive = false;
          if (finishReason === "tool_calls") {
            status = "UNEXPECTED_TOOL_CALL";
            errorCategory = "tool_calls";
          } else if (finishReason === "insufficient_system_resource") {
            status = "RESOURCE_STOP";
            errorCategory = finishReason;
          } else if (!content.trim()) {
            finishReason = "empty_content";
            status = "EMPTY_CONTENT";
            errorCategory = "empty_content";
          } else if (finishReason === "length") {
            status = "LENGTH_STOP";
          } else {
            finishReason ??= "stop";
            status = "COMPLETED";
          }
          break;
        } catch (error) {
          if (guardActive) {
            this.spendingGuard.abortActive();
            guardActive = false;
          }
          if (error instanceof DOMException && error.name === "AbortError") {
            const kind = this.#cancelKinds.get(input.turnId) ?? "user";
            status = kind === "stale" ? "STALE_TURN_CANCELLED" : "USER_CANCELLED";
            finishReason = "user_cancel";
            errorCategory = kind === "stale" ? "stale_turn" : "user_cancel";
            break;
          }
          const adapterError = error instanceof HybridAdapterError
            ? error
            : new HybridAdapterError("network_timeout", !thisAttemptSawContent, sanitizeTelemetryError(error));
          finishReason = adapterError.category;
          errorCategory = adapterError.category;
          if (!thisAttemptSawContent && firstContent === null && attempt === 0 && this.spendingGuard.canStart()) {
            retryCount += 1;
            await delay(jitterFor(input.turnId), controller.signal);
            continue;
          }
          status = firstContent === null ? "FAILED_BEFORE_FIRST_TOKEN" : "STREAM_INTERRUPTED_NO_RETRY";
          break;
        }
      }
      return finalize();
    } catch (error) {
      if (guardActive) this.spendingGuard.abortActive();
      if (error instanceof DOMException && error.name === "AbortError") {
        const kind = this.#cancelKinds.get(input.turnId) ?? "user";
        status = kind === "stale" ? "STALE_TURN_CANCELLED" : "USER_CANCELLED";
        finishReason = "user_cancel";
        errorCategory = kind === "stale" ? "stale_turn" : "user_cancel";
      } else {
        status = "ORCHESTRATION_ERROR";
        errorCategory = sanitizeTelemetryError(error);
      }
      return finalize();
    } finally {
      this.#controllers.delete(input.turnId);
      this.#cancelKinds.delete(input.turnId);
      if (this.#activeTurnId === input.turnId) this.#activeTurnId = null;
    }
  }
}
