export function generationWatchdogProfile(environment = {}) {
  const userAgent = String(environment.userAgent || "");
  const mobile = environment.mobile === true || /Mobile|Android|iPhone|iPad|MicroMessenger|QQ\//i.test(userAgent);
  const slow = environment.slow === true || /3g|slow/i.test(String(environment.network || ""));
  return {
    mobile,
    start_timeout_ms: 1500,
    first_token_timeout_ms: mobile ? 10000 : 6000,
    max_total_generation_ms: mobile ? 20000 : 12000,
    max_new_tokens: mobile && slow ? 12 : 24
  };
}

export function isTerminalGenerationStatus(status = "") {
  return ["completed", "timeout", "failed", "aborted", "fallback"].includes(status);
}

export function watchdogFallbackReason(status = "") {
  if (status === "start_failed") return "q4_generation_start_failed";
  if (status === "timeout") return "q4_generation_timeout";
  if (status === "aborted") return "generation_aborted";
  if (status === "failed") return "q4_generation_failed";
  return "";
}
