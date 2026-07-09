import { generateStaticQ4Draft, staticQ4Capability } from "./q4_worker_runtime.js?v=r28ship0-unified-q4-mount";

function tokensFor(prompt, maxTokens) {
  const parts = [
    "Static",
    "browser",
    "draft:",
    String(prompt || "").slice(0, 80),
    "local",
    "runtime",
    "smoke",
    "complete."
  ];
  return parts.slice(0, Math.min(maxTokens || 32, parts.length));
}

async function handleMessage(message) {
  if (message.type === "load_q4_manifest") {
    try {
      self.postMessage({ type: "state", state: "loading_q4_manifest" });
      const capability = await staticQ4Capability();
      self.postMessage({
        type: "q4_capability",
        load: {
          mode: "static_q4_experimental",
          status: "loaded_manifest_and_tokenizer",
          product_model: false,
          browser_admission: false,
          release_checkpoint_admission: false
        },
        capability
      });
    } catch (error) {
      self.postMessage({
        type: "error",
        error: error.message || "q4_manifest_load_failed",
        fallback_reason: error.message || "q4_manifest_load_failed",
        route_layer: "r28rout0_deferred_to_answer_surface_policy",
        router_deferred_to_generation_loop: true
      });
    }
    return;
  }

  if (message.type !== "generate") {
    self.postMessage({
      type: "error",
      error: "unsupported_worker_message",
      route_layer: "r28rout0_deferred_to_answer_surface_policy",
      router_deferred_to_generation_loop: true
    });
    return;
  }
  if (message.mode === "static_q4_experimental") {
    try {
      self.postMessage({ type: "state", state: "loading_model" });
      self.postMessage({ type: "state", state: "q4_forward_started" });
      const generation = await generateStaticQ4Draft(message.prompt, {
        maxTokens: message.maxTokens || 4,
        contextLength: message.contextLength || 64,
        generationKind: message.generationKind || "answer_generation",
        timeoutMs: message.timeoutMs || 30000,
        onToken: (token) => self.postMessage({ type: "token", token })
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
        error: error.message || "static_q4_generation_failed",
        fallback_reason: error.message || "static_q4_generation_failed",
        route_layer: "r28rout0_deferred_to_answer_surface_policy",
        router_deferred_to_generation_loop: true
      });
    }
    return;
  }
  self.postMessage({ type: "state", state: "drafting" });
  const tokens = tokensFor(message.prompt, message.maxTokens);
  for (const token of tokens) {
    self.postMessage({ type: "token", token });
  }
  self.postMessage({
    type: "final",
    draft: tokens.join(" "),
    tokens,
    stats: {
      tokens_generated: tokens.length,
      elapsed_ms: 0,
      runtime_mode: message.mode || "synthetic_tiny",
      decoded_text_available: true,
      decode_status: "synthetic_text",
      fallback_used: false,
      route_layer: "r28rout0_deferred_to_answer_surface_policy",
      router_input_available: false,
      router_deferred_to_generation_loop: true
    }
  });
}

self.addEventListener("message", (event) => {
  handleMessage(event.data || {});
});
