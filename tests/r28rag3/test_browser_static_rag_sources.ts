import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { buildEvidencePacket, loadStaticMemoryRecords } from "../../web/another_brain_chat/static_retriever.js";

async function readJson(name) {
  return JSON.parse(await readFile(resolve(process.cwd(), "web/another_brain/static_rag", name), "utf8"));
}

test("browser static retriever loads demo memory plus profile card assets", async () => {
  const fixtures = new Map();
  for (const name of ["demo_memory.json", "profile_cards.json", "style_cards.json", "boundary_cards.json"]) {
    fixtures.set(name, await readJson(name));
  }
  const records = await loadStaticMemoryRecords({
    baseUrl: "https://example.test/another_brain_chat/",
    fetcher: async (href) => ({
      ok: true,
      status: 200,
      json: async () => fixtures.get(basename(new URL(href).pathname))
    })
  });
  assert.ok(records.length > fixtures.get("demo_memory.json").records.length);
  assert.ok(records.some((record) => record.metadata?.profile_card === true));

  const packet = buildEvidencePacket("你是谁，为什么不要客服腔？", { local_only: true }, records);
  assert.equal(packet.profile_rag.enabled, true);
  assert.equal(packet.profile_rag.answer_bank, false);
  assert.ok(packet.expressive_context_pack.cards_used.length >= 1);
  assert.ok(packet.expressive_context_pack.dashboard_sources.some((source) => source.provenance));
});

test("dashboard code renders provenance markers for top sources", async () => {
  const appJs = await readFile(resolve(process.cwd(), "web/another_brain_chat/app.js"), "utf8");
  assert.match(appJs, /item\.provenance/);
  assert.match(appJs, /item\.kind/);
});
