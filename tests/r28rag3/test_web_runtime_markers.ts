import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

test("web runtime loads profile pack assets and displays source provenance", async () => {
  const retriever = await readFile(resolve(process.cwd(), "web/another_brain_chat/static_retriever.js"), "utf8");
  const app = await readFile(resolve(process.cwd(), "web/another_brain_chat/app.js"), "utf8");
  const runtime = JSON.parse(await readFile(resolve(process.cwd(), "web/another_brain/runtime_mode.json"), "utf8"));
  assert.match(retriever, /profile_cards\.json/);
  assert.match(retriever, /style_cards\.json/);
  assert.match(retriever, /boundary_cards\.json/);
  assert.match(retriever, /rag_profile_pack/);
  assert.match(app, /tone_hints/);
  assert.equal(runtime.rag_mode, "static_profile_pack");
});

test("asset manifest declares all R28RAG3 static RAG assets", async () => {
  const manifest = JSON.parse(await readFile(resolve(process.cwd(), "web/another_brain/asset_manifest.json"), "utf8"));
  const paths = manifest.rag_assets.map((item) => item.path);
  for (const path of [
    "another_brain/static_rag/demo_memory.json",
    "another_brain/static_rag/profile_cards.json",
    "another_brain/static_rag/style_cards.json",
    "another_brain/static_rag/boundary_cards.json"
  ]) {
    assert.ok(paths.includes(path), path);
    const entry = manifest.rag_assets.find((item) => item.path === path);
    assert.equal(entry.answer_bank, false);
    assert.equal(entry.private_raw_data, false);
    assert.equal(entry.allowed_for_training, false);
    assert.equal(entry.bytes, (await stat(resolve(process.cwd(), "web", path))).size);
  }
});
