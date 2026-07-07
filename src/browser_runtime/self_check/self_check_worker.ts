export const R28HOTFIX2_SELFCHECK_WORKER_PROTOCOL = Object.freeze({
  version: "r28hotfix2-self-check-worker-v1",
  request: "q4_smoke",
  progress: "progress",
  final: "final",
  error: "error"
});

export function buildSelfCheckWorkerRequest({ prompt = "R28HOTFIX2 q4 path smoke", timeoutMs = 8000 } = {}) {
  return {
    type: R28HOTFIX2_SELFCHECK_WORKER_PROTOCOL.request,
    prompt,
    maxTokens: 1,
    contextLength: 32,
    timeoutMs: Math.min(Math.max(Number(timeoutMs || 8000), 1000), 15000)
  };
}
