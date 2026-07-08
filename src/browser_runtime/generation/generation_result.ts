export const TERMINAL_GENERATION_STATUSES = Object.freeze(["completed", "timeout", "failed", "aborted", "fallback"]);

export function buildGenerationResult(input = {}) {
  const status = TERMINAL_GENERATION_STATUSES.includes(input.status) ? input.status : "failed";
  const tokens = Math.max(0, Number(input.tokens_generated || 0));
  return {
    q4_attempted: input.q4_attempted === true,
    generation_started: input.generation_started === true,
    generation_finished: status === "completed",
    generation_status: status,
    generation_timeout: status === "timeout",
    generation_aborted: status === "aborted",
    generation_failed: status === "failed",
    tokens_generated: tokens,
    first_token_ms: Number.isFinite(Number(input.first_token_ms)) ? Number(input.first_token_ms) : null,
    total_generation_ms: Math.max(0, Number(input.total_generation_ms || 0)),
    fallback_reason: input.fallback_reason || (status === "timeout" ? "q4_generation_timeout" : status === "aborted" ? "generation_aborted" : status === "failed" ? "q4_generation_failed" : ""),
    answer_source: input.answer_source || (status === "completed" && tokens > 0 ? "model_draft" : "fallback")
  };
}

export function generationAlwaysResolves(result = {}) {
  return TERMINAL_GENERATION_STATUSES.includes(result.generation_status || result.status);
}
