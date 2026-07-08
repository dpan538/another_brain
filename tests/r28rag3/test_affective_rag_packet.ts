import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildAffectiveRagPacket } from "../../src/browser_runtime/rag/affective_rag.ts";
import { normalizeR28Rag3CardFixture } from "../../src/browser_runtime/rag/profile_retriever.ts";

async function allCards() {
  const names = ["profile_cards.json", "style_cards.json", "boundary_cards.json"];
  const cards = [];
  for (const name of names) {
    cards.push(...normalizeR28Rag3CardFixture(JSON.parse(await readFile(resolve(process.cwd(), `web/another_brain/static_rag/${name}`), "utf8"))));
  }
  return cards;
}

test("affective RAG packet carries runtime-only tone hints and source display", async () => {
  const packet = buildAffectiveRagPacket("证据不足怎么办", { local_only: true }, { cards: await allCards(), topK: 4, minScore: 0.01 });
  assert.equal(packet.local_only, true);
  assert.equal(packet.hosted_vector_store, false);
  assert.ok(packet.retrieved_evidence.length > 0);
  assert.equal(packet.rag_profile_pack.runtime_hints_only, true);
  assert.equal(packet.rag_profile_pack.training_data, false);
  assert.equal(packet.rag_profile_pack.broad_answer_bank, false);
  assert.equal(packet.rag_profile_pack.private_raw_data, false);
  assert.equal(packet.rag_profile_pack.hosted_vector_store, false);
  assert.ok(packet.rag_profile_pack.tone_hints.length > 0);
  assert.ok(packet.rag_profile_pack.source_display.some((source) => source.provenance));
});
