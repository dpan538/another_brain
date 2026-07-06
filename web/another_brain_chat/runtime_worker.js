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
    self.postMessage({ type: "error", error: "unsupported_worker_message" });
    return;
  }
  self.postMessage({ type: "state", state: "drafting" });
  const tokens = tokensFor(message.prompt, message.maxTokens);
  for (const token of tokens) {
    self.postMessage({ type: "token", token });
  }
  self.postMessage({ type: "final", draft: tokens.join(" "), tokens });
});
