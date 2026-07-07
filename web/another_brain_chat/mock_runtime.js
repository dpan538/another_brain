import {
  BrowserModelRuntime,
  FallbackRuntime,
  FinalizerRuntime,
  LocalRetrievalRuntime,
  TokenizerRuntime,
  VerifierRuntime,
  createStatePacket
} from "./runtime_interfaces.js";

export class MockTokenizerRuntime extends TokenizerRuntime {
  encode(text) {
    return Array.from(text).map((char) => char.codePointAt(0));
  }

  decode(tokens) {
    return tokens.map((token) => String.fromCodePoint(token)).join("");
  }
}

export class MockLocalRetrievalRuntime extends LocalRetrievalRuntime {
  async retrieve(statePacket) {
    return [
      {
        id: "r27b0-local-skeleton",
        source: "same-origin mock packet",
        score: 1,
        text: "R27B0 only wires the browser product skeleton and deterministic local mock runtime."
      },
      {
        id: "r27b0-non-claims",
        source: "static manifest",
        score: 0.92,
        text: "No product model, tokenizer artifact, backend inference, external LLM API, Doubao, or release claim."
      }
    ].map((item) => ({ ...item, turn_index: statePacket.turn_index }));
  }
}

export class MockBrowserModelRuntime extends BrowserModelRuntime {
  async load() {
    return {
      status: "placeholder_loaded",
      model_assets_loaded: 0,
      model_exists: false
    };
  }

  async draft(packet) {
    const evidenceCount = packet.retrieved_evidence.length;
    return [
      "Static mock draft:",
      `I received "${packet.input}".`,
      `The local retrieval placeholder returned ${evidenceCount} evidence items.`,
      "This response is deterministic and does not use a real checkpoint."
    ].join(" ");
  }
}

export class VerifierRuntimeMock extends VerifierRuntime {
  async verify(packet) {
    const safe =
      packet.state_packet.local_only === true &&
      packet.state_packet.backend_inference === false &&
      packet.state_packet.external_runtime_dependency === false;
    return {
      passed: safe,
      reason: safe ? "static_local_mock_only" : "runtime_boundary_violation",
      fallback_recommended: !safe
    };
  }
}

export class MockFinalizerRuntime extends FinalizerRuntime {
  async finalize(packet) {
    return [
      packet.decoder_draft,
      "Final shell answer: the path is wired for local retrieval, browser draft, verifier, finalizer, and fallback display only."
    ].join(" ");
  }
}

export class MockFallbackRuntime extends FallbackRuntime {
  async fallback(packet) {
    return `Static fallback: ${packet.input.slice(0, 80) || "empty input"} could not be finalized inside the mock shell.`;
  }
}

export class R27B0MockRuntime {
  constructor() {
    this.tokenizer = new MockTokenizerRuntime();
    this.retrieval = new MockLocalRetrievalRuntime();
    this.model = new MockBrowserModelRuntime();
    this.verifier = new VerifierRuntimeMock();
    this.finalizer = new MockFinalizerRuntime();
    this.fallback = new MockFallbackRuntime();
    this.turnIndex = 0;
  }

  async run(input) {
    this.turnIndex += 1;
    const statePacket = createStatePacket(input, this.turnIndex);
    const tokenIds = this.tokenizer.encode(input);
    const retrievedEvidence = await this.retrieval.retrieve(statePacket);
    const decoderDraft = await this.model.draft({
      input,
      state_packet: statePacket,
      retrieved_evidence: retrievedEvidence,
      token_ids: tokenIds
    });
    const packet = {
      input,
      state_packet: statePacket,
      retrieved_evidence: retrievedEvidence,
      decoder_draft: decoderDraft,
      verifier_result: {},
      final_answer: "",
      fallback_used: false
    };
    packet.verifier_result = await this.verifier.verify(packet);
    packet.fallback_used = packet.verifier_result.fallback_recommended === true;
    packet.final_answer = packet.fallback_used
      ? await this.fallback.fallback(packet)
      : await this.finalizer.finalize(packet);
    return packet;
  }
}
