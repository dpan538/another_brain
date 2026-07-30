import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { resolveQ4ShardDownloadConcurrency } from "../../web/another_brain_chat/q4_worker_runtime.js";
import { buildEvidencePacket, loadStaticMemoryRecords } from "../../web/another_brain_chat/static_retriever.js";

const root = process.cwd();

test("q4 worker has an explicit full-layer single-token transformer evaluation path", async () => {
  const source = await readFile(resolve(root, "web/another_brain_chat/q4_worker_runtime.js"), "utf8");
  const selfCheck = await readFile(resolve(root, "web/another_brain_chat/self_check_worker.js"), "utf8");
  for (const token of [
    "function transformerForwardOneToken",
    "blocks.${layer}.ln1.weight",
    "blocks.${layer}.attn.attn.in_proj_weight",
    "blocks.${layer}.mlp.0.weight",
    "blocks.${layer}.mlp.2.weight",
    "single_token_causal_qkv",
    "context_attention_supported: false",
    "forwardMode === \"transformer_single_token\""
  ]) assert.ok(source.includes(token), token);
  assert.ok(selfCheck.includes("transformer_single_token"));
});

test("loader keeps one shard on unknown or slow networks and permits a bounded fast-network override", () => {
  assert.equal(resolveQ4ShardDownloadConcurrency({}, 5), 1);
  assert.equal(resolveQ4ShardDownloadConcurrency({ downloadConcurrency: 2 }, 5), 2);
  assert.equal(resolveQ4ShardDownloadConcurrency({ downloadConcurrency: 9 }, 1), 1);
});

test("decision knowledge cards are same-origin, reviewed runtime hints and retrieve for evidence calibration", async () => {
  const cardsPath = resolve(root, "web/another_brain/static_rag/decision_cards.json");
  const manifest = JSON.parse(await readFile(resolve(root, "web/another_brain/asset_manifest.json"), "utf8"));
  const document = JSON.parse(await readFile(cardsPath, "utf8"));
  assert.equal(document.fixture_policy.answer_bank, false);
  assert.equal(document.fixture_policy.allowed_for_training, false);
  assert.ok(document.cards.length >= 12);
  for (const card of document.cards) {
    assert.equal(card.allowed_for_training, false);
    assert.equal(card.private_raw_data, false);
    assert.equal(card.review_status, "approved_for_runtime");
  }
  const manifestEntry = manifest.rag_assets.find((entry) => entry.path === "another_brain/static_rag/decision_cards.json");
  assert.ok(manifestEntry);
  const bytes = await readFile(cardsPath);
  assert.equal(manifestEntry.bytes, (await stat(cardsPath)).size);
  assert.equal(manifestEntry.sha256, createHash("sha256").update(bytes).digest("hex"));
  const fetcher = async (url) => {
    assert.match(String(url), /\/another_brain\/static_rag\/decision_cards\.json$/);
    return { ok: true, json: async () => document };
  };
  const records = await loadStaticMemoryRecords({
    baseUrl: "https://preview.example/another_brain_chat/index.html",
    assets: ["../another_brain/static_rag/decision_cards.json"],
    fetcher
  });
  const packet = buildEvidencePacket("相关不等于因果，怎样判断证据是否足够？", {}, records, { topK: 4 });
  assert.ok(packet.retrieved_evidence.some((item) => item.text.includes("Correlation is a cue")));
});
