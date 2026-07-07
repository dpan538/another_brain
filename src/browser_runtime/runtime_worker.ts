import { SyntheticTinyRuntime, runGenerationLoop } from "./generation_loop.ts";
import { StaticQ4ExperimentalRuntime, runtimeCapabilitySummary } from "./q4_runtime/index.ts";

export async function handleRuntimeWorkerMessage(message, sink = {}) {
  const post = typeof sink.postMessage === "function" ? sink.postMessage.bind(sink) : () => {};
  if (message?.type === "load_q4_manifest") {
    try {
      post({ type: "state", state: "loading_q4_manifest" });
      const runtime = new StaticQ4ExperimentalRuntime({ runtimePackage: message.runtimePackage });
      const load = await runtime.load();
      const final = {
        type: "q4_capability",
        load,
        capability: runtimeCapabilitySummary(message.runtimePackage)
      };
      post(final);
      return final;
    } catch (error) {
      const failure = { type: "error", error: error.message || "q4_manifest_load_failed" };
      post(failure);
      return failure;
    }
  }

  if (!message || message.type !== "generate") {
    return { type: "error", error: "unsupported_worker_message" };
  }
  const runtime = message.mode === "static_q4_experimental"
    ? new StaticQ4ExperimentalRuntime({ runtimePackage: message.runtimePackage })
    : new SyntheticTinyRuntime({ mode: message.mode || "synthetic_tiny" });
  try {
    post({ type: "state", state: "loading_model" });
    await runtime.load();
    post({ type: "state", state: "drafting" });
    const generation = await runGenerationLoop(runtime, message.prompt, {
      maxTokens: message.maxTokens || 32,
      contextLength: message.contextLength || 256,
      timeoutMs: message.timeoutMs || 3000,
      onToken: (token) => post({ type: "token", token })
    });
    const final = { type: "final", draft: generation.draft, tokens: generation.tokens };
    post(final);
    return final;
  } catch (error) {
    const failure = { type: "error", error: error.message || "worker_generation_failed" };
    post(failure);
    return failure;
  }
}

export function installBrowserWorker() {
  if (typeof self === "undefined" || typeof self.addEventListener !== "function") return false;
  self.addEventListener("message", (event) => {
    handleRuntimeWorkerMessage(event.data, self);
  });
  return true;
}

installBrowserWorker();
