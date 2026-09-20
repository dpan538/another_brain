// Product performance budget.
//
// Two figures govern the product:
//
//   warm-up            ≤ 5 s   from a cold visit to a usable input box
//   answer latency     ≤ 3.5 s
//
// Measured inputs behind these numbers:
//
//   CDN time-to-first-byte, efishother.com, this machine   0.35–0.58 s
//   CDN transfer once flowing                              ~2.9 MB/s
//   Production transfer, R29LOAD1, large sequential shards  ~209 KB/s
//   DeepSeek single completion at 192 max_tokens,
//     R29B2M-R4H-R3 call-1 p95                              2,658.8 ms
//     R29P0 p50 / p95 / max                        1,259 / 3,405 / 3,442 ms
//
// The two transfer rates disagree because they measure different things: a
// small asset over HTTP/2 is dominated by round-trip latency, a 48 MB
// sequential shard download is dominated by throughput. The pessimistic rate is
// used for the warm-up budget so a phone on a poor connection still fits.

export const WARMUP_BUDGET_MS = 5_000;
export const ANSWER_LATENCY_BUDGET_MS = 3_500;

// Two measured rates, and which one applies where.
//
//   CDN_TRANSFER_BYTES_PER_SECOND is what small same-origin assets actually
//   achieve once the connection is open: app.js, 97 KB, transferred in 34 ms
//   after a 582 ms first byte.
//
//   SEQUENTIAL_SHARD_BYTES_PER_SECOND is what R29LOAD1 measured pulling the
//   48 MB q4 package. A long sequential download behaves differently from a
//   handful of small parallel requests, and that figure should not be used to
//   size a normal page load.
//
// The payload budget is set at 10 MB by product decision. Under the CDN rate
// that lands near 4 s, inside the 5 s warm-up. It does not hold on a genuinely
// poor mobile connection, and that is an accepted trade rather than an
// oversight: a visitor on a slow link waits longer than 5 s.
export const CDN_TRANSFER_BYTES_PER_SECOND = 2_900_000;
export const SEQUENTIAL_SHARD_BYTES_PER_SECOND = 208_919;

// Time before the first byte can move, reserved out of the warm-up budget.
// Measured first-byte times on this deployment ranged 0.35–0.58 s.
export const RESERVED_CONNECT_MS = 600;

export const COLD_PAYLOAD_BUDGET_BYTES = 10_000_000;

export function projectedWarmupMs(bytes, rate = CDN_TRANSFER_BYTES_PER_SECOND) {
  return Math.round(RESERVED_CONNECT_MS + (Number(bytes) || 0) / rate * 1000);
}

export function fitsWarmupBudget(bytes) {
  return projectedWarmupMs(bytes) <= WARMUP_BUDGET_MS;
}

// The remote call is the whole answer budget. At 192 max_tokens the measured
// p95 is 2.7–3.4 s and the observed maximum is 3.44 s, which already touches the
// ceiling. Everything the browser does before and after the call has to fit in
// what is left, so local work is held to a hard cap and no extra network hop is
// permitted on the answer path.
export const LOCAL_WORK_BUDGET_MS = 250;
export const REMOTE_CALL_BUDGET_MS = ANSWER_LATENCY_BUDGET_MS - LOCAL_WORK_BUDGET_MS;

// Output length is the one variable that moves completion time. Streaming cost
// is roughly linear in emitted tokens, so the 192-token measurement is the
// reference point and longer answers are bought against the budget knowingly.
export const REFERENCE_MAX_TOKENS = 192;
export const REFERENCE_COMPLETION_P95_MS = 2_659;

export function projectedCompletionP95Ms(maxTokens) {
  const n = Math.max(1, Number(maxTokens) || REFERENCE_MAX_TOKENS);
  return Math.round(REFERENCE_COMPLETION_P95_MS * (n / REFERENCE_MAX_TOKENS));
}

export function fitsAnswerBudget(maxTokens) {
  return projectedCompletionP95Ms(maxTokens) <= REMOTE_CALL_BUDGET_MS;
}

// Largest token count whose projected p95 still lands inside the budget.
export const MAX_TOKENS_WITHIN_BUDGET = Math.floor(
  REFERENCE_MAX_TOKENS * (REMOTE_CALL_BUDGET_MS / REFERENCE_COMPLETION_P95_MS)
);

export function describeBudget() {
  return {
    warmup_budget_ms: WARMUP_BUDGET_MS,
    cold_payload_budget_bytes: COLD_PAYLOAD_BUDGET_BYTES,
    projected_warmup_at_budget_ms: projectedWarmupMs(COLD_PAYLOAD_BUDGET_BYTES),
    projected_warmup_on_slow_link_ms: projectedWarmupMs(COLD_PAYLOAD_BUDGET_BYTES, SEQUENTIAL_SHARD_BYTES_PER_SECOND),
    answer_latency_budget_ms: ANSWER_LATENCY_BUDGET_MS,
    local_work_budget_ms: LOCAL_WORK_BUDGET_MS,
    remote_call_budget_ms: REMOTE_CALL_BUDGET_MS,
    max_tokens_within_budget: MAX_TOKENS_WITHIN_BUDGET,
    reference: {
      max_tokens: REFERENCE_MAX_TOKENS,
      completion_p95_ms: REFERENCE_COMPLETION_P95_MS,
      source: "R29B2M-R4H-R3 call-1 p95; R29P0 p50/p95/max 1259/3405/3442 ms"
    }
  };
}
