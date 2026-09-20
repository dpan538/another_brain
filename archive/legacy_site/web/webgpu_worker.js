self.onmessage = async (event) => {
  const message = event.data || {};
  if (message.type === "capability") {
    self.postMessage({
      type: "capability",
      webgpu: Boolean(self.navigator?.gpu),
      wasm: typeof self.WebAssembly === "object",
      worker: true
    });
    return;
  }
  self.postMessage({
    type: "error",
    reason: "r20_webgpu_worker_only_exposes_capability_smoke"
  });
};

