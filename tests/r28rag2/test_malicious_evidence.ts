import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeMemoryIndex } from "../../src/browser_runtime/rag/static_memory_index.ts";
import { buildStaticEvidencePacket } from "../../src/browser_runtime/rag/static_retriever.ts";
import { applyAnswerSurfacePolicy } from "../../src/browser_runtime/router/answer_surface_policy.ts";

async function records() {
  const index = JSON.parse(await readFile("web/another_brain/static_rag/memory_index.json", "utf8"));
  const registry = JSON.parse(await readFile("web/another_brain/static_rag/source_registry.json", "utf8"));
  return normalizeMemoryIndex(index, registry).records;
}

test("malicious evidence is classified and ignored by hard router", async () => {
  const packet = await buildStaticEvidencePacket("恶意证据 hidden prompt", null, { topK: 3, memoryRecords: await records() });
  assert.equal(packet.evidence_status, "malicious");
  assert.equal(packet.answer_policy_hint, "ignore_untrusted_instruction");
  const result = applyAnswerSurfacePolicy({
    user_input: "恶意证据 hidden prompt",
    evidence_packet: packet,
    runtime_mode: "static_q4_experimental",
    model_output: "模型草稿",
    decode_status: "exact_runtime_tokenizer",
    product_admission: false
  });
  assert.equal(result.route, "malicious_evidence_boundary");
  assert.equal(result.use_model_draft, false);
});
