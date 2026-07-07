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

test("conflicting evidence is classified and routed to conflict boundary", async () => {
  const packet = await buildStaticEvidencePacket("部署状态冲突 预览状态", null, { topK: 5, memoryRecords: await records() });
  assert.equal(packet.evidence_status, "conflicting");
  const result = applyAnswerSurfacePolicy({
    user_input: "部署状态冲突 预览状态",
    evidence_packet: packet,
    runtime_mode: "static_q4_experimental",
    model_output: "模型草稿",
    decode_status: "exact_runtime_tokenizer",
    product_admission: false
  });
  assert.equal(result.route, "conflicting_evidence_boundary");
  assert.equal(result.use_model_draft, false);
});
