import { generateStaticQ4Draft } from "./q4_worker_runtime.js?v=r28rout1-fuzzy-intent-surfaces";

async function handleSelfCheck(message = {}) {
  if (message.type !== "q4_smoke") {
    self.postMessage({ type: "error", error: "unsupported_self_check_message" });
    return;
  }
  const timeoutMs = Math.min(Math.max(Number(message.timeoutMs || 8000), 1000), 15000);
  try {
    self.postMessage({ type: "progress", stage: "worker_loaded" });
    self.postMessage({ type: "progress", stage: "q4_forward_started" });
    const generation = await generateStaticQ4Draft(message.prompt || "R28ROUT1 q4 path smoke", {
      maxTokens: Math.min(Number(message.maxTokens || 1), 1),
      contextLength: Math.min(Number(message.contextLength || 32), 32),
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
