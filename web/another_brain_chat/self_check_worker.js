import { generateStaticQ4Draft } from "./q4_worker_runtime.js?v=r28livefix0-live-q4-mount";

async function handleSelfCheck(message = {}) {
  if (message.type !== "q4_smoke") {
    self.postMessage({ type: "error", error: "unsupported_self_check_message" });
    return;
  }
  const transformerEvaluation = message.forwardMode === "transformer_single_token";
  const timeoutMs = Math.min(Math.max(Number(message.timeoutMs || (transformerEvaluation ? 60_000 : 8000)), 1000), transformerEvaluation ? 120_000 : 15000);
  try {
    self.postMessage({ type: "progress", stage: "worker_loaded" });
    self.postMessage({ type: "progress", stage: "q4_forward_started" });
    const generation = await generateStaticQ4Draft(message.prompt || "R28SHIP0 q4 path smoke", {
      maxTokens: Math.min(Number(message.maxTokens || 1), 1),
      contextLength: Math.min(Number(message.contextLength || 32), 32),
      generationKind: transformerEvaluation ? "transformer_eval" : "mount_smoke",
      forwardMode: transformerEvaluation ? "transformer_single_token" : undefined,
      timeoutMs,
      onToken: (token) => self.postMessage({ type: "progress", stage: "token", token })
    });
    self.postMessage({
      type: "final",
      draft: generation.draft,
      tokens: generation.tokens,
      stats: generation.stats
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      error: error.message || "self_check_q4_smoke_failed"
    });
  }
}

self.addEventListener("message", (event) => {
  handleSelfCheck(event.data || {});
});
