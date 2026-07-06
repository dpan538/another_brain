export const R27B0_PIPELINE_SCHEMA = Object.freeze({
  input: "string",
  state_packet: "object",
  retrieved_evidence: "array",
  decoder_draft: "string",
  verifier_result: "object",
  final_answer: "string",
  fallback_used: "boolean"
});

export class BrowserModelRuntime {
  async load() {
    throw new Error("BrowserModelRuntime.load is an interface method");
  }

  async draft(_packet) {
    throw new Error("BrowserModelRuntime.draft is an interface method");
  }
}

export class TokenizerRuntime {
  encode(_text) {
    throw new Error("TokenizerRuntime.encode is an interface method");
  }

  decode(_tokens) {
    throw new Error("TokenizerRuntime.decode is an interface method");
  }
}

export class LocalRetrievalRuntime {
  async retrieve(_statePacket) {
    throw new Error("LocalRetrievalRuntime.retrieve is an interface method");
  }
}

export class VerifierRuntime {
  async verify(_packet) {
    throw new Error("VerifierRuntime.verify is an interface method");
  }
}

export class FinalizerRuntime {
  async finalize(_packet) {
    throw new Error("FinalizerRuntime.finalize is an interface method");
  }
}

export class FallbackRuntime {
  async fallback(_packet) {
    throw new Error("FallbackRuntime.fallback is an interface method");
  }
}

export function createStatePacket(input, turnIndex) {
  return {
    runtime_version: "r27b0-static-chat-shell-v1",
    local_only: true,
    backend_inference: false,
    external_runtime_dependency: false,
    turn_index: turnIndex,
    user_input_length: input.length,
    product_surface: "memory-backed personal answer surface",
    pipeline: [
      "input/state packet",
      "local retrieval",
      "browser local decoder draft",
      "verifier/finalizer/fallback",
      "answer"
    ]
  };
}
