import { SyntheticTinyRuntime, runGenerationLoop } from "./generation_loop.ts";
import { StaticQ4ExperimentalRuntime, runtimeCapabilitySummary } from "./q4_runtime/index.ts";
import { createTraceEvent } from "./trace/trace_event.ts";

export async function handleRuntimeWorkerMessage(message, sink = {}) {
  const post = typeof sink.postMessage === "function" ? sink.postMessage.bind(sink) : () => {};
  if (message?.type === "load_q4_manifest") {
    try {
      post({ type: "state", state: "loading_q4_manifest", trace_event: createTraceEvent("model_manifest_loaded") });
      const final = {
        type: "q4_capability",
        load: {
          mode: "static_q4_experimental",
          status: "loaded_manifest_only",
          product_model: false,
          browser_admission: false,
          release_checkpoint_admission: false
        },
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
    ? new StaticQ4ExperimentalRuntime({
        runtimePackage: message.runtimePackage,
        fetcher: message.fetcher,
        baseUrl: message.baseUrl
      })
    : new SyntheticTinyRuntime({ mode: message.mode || "synthetic_tiny" });
  try {
    post({ type: "state", state: "loading_model", trace_event: createTraceEvent("model_manifest_loaded") });
    await runtime.load();
    post({ type: "state", state: "drafting", trace_event: createTraceEvent("q4_forward_started", { runtime_mode: runtime.mode || message.mode || "synthetic_tiny" }) });
    const generation = await runGenerationLoop(runtime, message.prompt, {
      maxTokens: message.maxTokens || 32,
      contextLength: message.contextLength || 256,
      timeoutMs: message.timeoutMs || 3000,
      onToken: (token) => post({ type: "token", token })
    });
    const final = {
      type: "final",
      draft: generation.draft,
      tokens: generation.tokens,
      stats: {
        tokens_generated: generation.tokens_generated,
        elapsed_ms: generation.elapsed_ms,
        runtime_mode: generation.runtime_mode,
        decoded_text_available: generation.decoded_text_available,
        decode_status: generation.decode_status,
        generated_token_ids: generation.generated_token_ids,
        quality_status: generation.quality_status,
        fallback_used: false,
        route_layer: "r28rout0_deferred_to_answer_surface_policy",
        router_input_available: false,
        router_deferred_to_generation_loop: true,
        trace_events: [
          createTraceEvent("q4_forward_completed", {
            q4_forward_ran: generation.runtime_mode === "static_q4_experimental",
            tokens_generated: generation.tokens_generated
          }),
          createTraceEvent("draft_generated", { draft_generated: Boolean(generation.draft) })
        ]
      }
    };
    post(final);
    return final;
  } catch (error) {
    const failure = {
      type: "error",
      error: error.message || "worker_generation_failed",
      route_layer: "r28rout0_deferred_to_answer_surface_policy",
      router_deferred_to_generation_loop: true,
      trace_event: createTraceEvent("fallback_used", { reason: error.message || "worker_generation_failed" })
    };
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
