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

self.addEventListener("message", (event) => {
  const message = event.data || {};
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
    self.postMessage({
      type: "error",
      error: "web_static_q4_worker_bundle_not_embedded",
      fallback_reason: "static_ui_q4_runtime_package_unavailable",
      route_layer: "r28rout0_deferred_to_answer_surface_policy",
      router_deferred_to_generation_loop: true
    });
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
});
