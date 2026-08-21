import { createHash } from "node:crypto";
import { canonicalPacket, type LocalSignalPacketV1 } from "./local_signal_packet.ts";

export interface PricingSnapshot {
  model: string;
  currency: string;
  unit_tokens: number;
  input_cache_hit: number;
  input_cache_miss: number;
  output: number;
  pricing_version: string;
}

export interface HybridTelemetryRecord {
  turn_id: string;
  public_fixture_id: string | null;
  adapter_type: string;
  signal_provider_type: string;
  source_trace: string;
  packet_sha256: string | null;
  packet_validation_valid: boolean;
  packet_fields_used: string[];
  signal_start_ms: number;
  signal_end_ms: number | null;
  signal_elapsed_ms: number | null;
  declared_signal_delay_ms: number;
  request_start_ms: number | null;
  first_byte_ms: number | null;
  first_content_ms: number | null;
  stream_end_ms: number | null;
  ttft_ms: number | null;
  total_elapsed_ms: number | null;
  input_tokens: number;
  output_tokens: number;
  cache_hit_tokens: number;
  cache_miss_tokens: number;
  retry_count: number;
  request_count: number;
  finish_reason: string | null;
  cancelled: boolean;
  response_length: number;
  error_category: string | null;
  estimated_cost: number;
  raw_message_recorded: false;
}

export function packetSha256(packet: LocalSignalPacketV1): string {
  return createHash("sha256").update(canonicalPacket(packet)).digest("hex");
}

export function sanitizeTelemetryError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, "Bearer [REDACTED]")
    .replace(/(?:api[ _-]?key|authorization)\s*[:=]\s*[^\s,;]+/gi, "[REDACTED_SECRET_REFERENCE]")
    .slice(0, 160);
}

export function estimateCost(record: Pick<HybridTelemetryRecord, "cache_hit_tokens" | "cache_miss_tokens" | "output_tokens">, pricing: PricingSnapshot): number {
  return (
    record.cache_hit_tokens * pricing.input_cache_hit +
    record.cache_miss_tokens * pricing.input_cache_miss +
    record.output_tokens * pricing.output
  ) / pricing.unit_tokens;
}

export class SpendingGuard {
  readonly requestLimit: number;
  readonly inputTokenLimit: number;
  readonly outputTokenLimit: number;
  readonly concurrencyLimit: number;
  requestCount = 0;
  inputTokens = 0;
  outputTokens = 0;
  active = 0;
  killed = false;

  constructor(options: { requestLimit?: number; inputTokenLimit?: number; outputTokenLimit?: number; concurrencyLimit?: number } = {}) {
    this.requestLimit = options.requestLimit ?? 100;
    this.inputTokenLimit = options.inputTokenLimit ?? 400_000;
    this.outputTokenLimit = options.outputTokenLimit ?? 40_000;
    this.concurrencyLimit = options.concurrencyLimit ?? 2;
  }

  canStart(): boolean {
    return !this.killed && this.active < this.concurrencyLimit && this.requestCount < this.requestLimit && this.inputTokens < this.inputTokenLimit && this.outputTokens < this.outputTokenLimit;
  }

  start(): void {
    if (!this.canStart()) throw new Error("live_spending_guard_blocked");
    this.requestCount += 1;
    this.active += 1;
  }

  finish(inputTokens: number, outputTokens: number): void {
    this.active = Math.max(0, this.active - 1);
    this.inputTokens += Math.max(0, inputTokens);
    this.outputTokens += Math.max(0, outputTokens);
    if (this.requestCount >= this.requestLimit || this.inputTokens >= this.inputTokenLimit || this.outputTokens >= this.outputTokenLimit) this.killed = true;
  }

  abortActive(): void { this.active = Math.max(0, this.active - 1); }
}

export class HybridTelemetryCollector {
  readonly records: HybridTelemetryRecord[] = [];
  readonly pricing: PricingSnapshot;
  constructor(pricing: PricingSnapshot) { this.pricing = pricing; }
  add(record: HybridTelemetryRecord): void {
    record.estimated_cost = estimateCost(record, this.pricing);
    this.records.push(structuredClone(record));
  }
}

export function percentile(values: number[], quantile: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(quantile * sorted.length) - 1));
  return sorted[index];
}

export function latencySummary(values: number[]): Record<string, number | null> {
  return {
    p50: percentile(values, 0.5), p75: percentile(values, 0.75), p90: percentile(values, 0.9),
    p95: percentile(values, 0.95), max: values.length ? Math.max(...values) : null, sample_count: values.length,
  };
}
