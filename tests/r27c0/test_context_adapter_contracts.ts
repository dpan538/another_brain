import test from "node:test";
import assert from "node:assert/strict";
import {
  ADAPTER_PACKET_SCHEMAS,
  LOCAL_SESSION_PRIVACY_SCOPE,
  createStateAdapterPacket,
  parseLocalImportPacket,
  validateAdapterPacket
} from "../../src/browser_runtime/context_adapter.ts";
import { runChatPipeline } from "../../src/browser_runtime/generation_loop.ts";

function validMemoryPacket(overrides = {}) {
  return {
    packet_type: "MemoryContextPacket",
    source_type: "manual_json",
    source_label: "Manual packet fixture",
    content: "manual bridge target context says the bridge is local only",
    evidence: [],
    privacy_scope: LOCAL_SESSION_PRIVACY_SCOPE,
    allowed_for_training: false,
    created_at_client: "2026-07-06T00:00:00.000Z",
    provenance: { fixture: "r27c0" },
    ...overrides
  };
}

test("exports all R27C0 adapter packet schemas", () => {
  for (const name of [
    "InputAdapterPacket",
    "StatePacket",
    "EvidencePacket",
    "MemoryContextPacket",
    "AnswerSurfaceRequest",
    "AnswerSurfaceResponse"
  ]) {
    assert.equal(ADAPTER_PACKET_SCHEMAS[name].title, name);
    assert.equal(ADAPTER_PACKET_SCHEMAS[name].properties.privacy_scope.const, LOCAL_SESSION_PRIVACY_SCOPE);
    assert.equal(ADAPTER_PACKET_SCHEMAS[name].properties.allowed_for_training.const, false);
  }
});

test("valid JSON packet and plain text imports are accepted", () => {
  const jsonResult = parseLocalImportPacket(JSON.stringify(validMemoryPacket()));
  assert.equal(jsonResult.ok, true);
  assert.equal(jsonResult.packet.packet_type, "MemoryContextPacket");
  assert.equal(jsonResult.packet.allowed_for_training, false);

  const textResult = parseLocalImportPacket("plain text local context");
  assert.equal(textResult.ok, true);
  assert.equal(textResult.packet.source_type, "manual_text");
  assert.equal(textResult.packet.privacy_scope, LOCAL_SESSION_PRIVACY_SCOPE);
});

test("invalid packets are rejected by schema validation", () => {
  const result = parseLocalImportPacket(JSON.stringify({
    source_type: "manual_json",
    source_label: "bad",
    content: "missing required fields"
  }));
  assert.equal(result.ok, false);
  assert.match(result.failures.join(","), /evidence_must_be_array/);
  assert.match(result.failures.join(","), /privacy_scope_must_be_local_session_only/);
});

test("private scope or training allowed packets are rejected", () => {
  const privateResult = parseLocalImportPacket(JSON.stringify(validMemoryPacket({ privacy_scope: "private_raw" })));
  assert.equal(privateResult.ok, false);
  assert.match(privateResult.failures.join(","), /privacy_scope_must_be_local_session_only/);

  const trainingResult = parseLocalImportPacket(JSON.stringify(validMemoryPacket({ allowed_for_training: true })));
  assert.equal(trainingResult.ok, false);
  assert.match(trainingResult.failures.join(","), /allowed_for_training_must_be_false/);
});

test("external URL provenance is not fetched during import", () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("fetch_should_not_be_called");
  };
  try {
    const result = parseLocalImportPacket(JSON.stringify(validMemoryPacket({
      provenance: { shared_url: "https://example.invalid/private/context.json" }
    })));
    assert.equal(result.ok, true);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("StatePacket export validates and imports locally", () => {
  const packet = createStateAdapterPacket({
    runtime_version: "test-runtime",
    local_only: true,
    backend_inference: false
  }, { createdAtClient: "2026-07-06T00:00:00.000Z" });
  const validation = validateAdapterPacket(packet, { expectedPacketType: "StatePacket" });
  assert.equal(validation.ok, true);

  const importResult = parseLocalImportPacket(JSON.stringify(packet));
  assert.equal(importResult.ok, true);
  assert.equal(importResult.packet.packet_type, "StatePacket");
});

test("manual evidence packet integrates with RAG runtime", async () => {
  const importResult = parseLocalImportPacket(JSON.stringify({
    packet_type: "EvidencePacket",
    source_type: "manual_json",
    source_label: "Manual evidence fixture",
    content: "bridge evidence target",
    evidence: [
      {
        source_id: "manual-evidence-r27c0",
        title: "Manual bridge evidence",
        text: "The bridge evidence target is only loaded into the local session RAG runtime.",
        trust_level: "high",
        retrieval_score: 1,
        license_or_origin: "manual local session",
        can_answer: true,
        keywords: ["bridge", "evidence", "target"]
      }
    ],
    privacy_scope: LOCAL_SESSION_PRIVACY_SCOPE,
    allowed_for_training: false,
    created_at_client: "2026-07-06T00:00:00.000Z",
    provenance: { fixture: "r27c0" }
  }));
  assert.equal(importResult.ok, true);

  const packet = await runChatPipeline("bridge evidence target", {
    contextPackets: [importResult.packet],
    topK: 2,
    maxTokens: 8
  });
  assert.equal(packet.state_packet.backend_inference, false);
  assert.equal(packet.evidence_packet.backend_retrieval, false);
  assert.equal(packet.adapter_context_summary.local_session_only, true);
  assert.equal(packet.answer_surface_request.allowed_for_training, false);
  assert.equal(packet.answer_surface_response.provenance.training_promotion, false);
  assert.ok(packet.retrieved_evidence.some((item) => item.source_id === "manual-evidence-r27c0"));
});
