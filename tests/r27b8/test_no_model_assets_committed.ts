import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("R27B8 asset hygiene allows only approved R28M1 static q4 assets", () => {
  const result = spawnSync("git", ["ls-files"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  const forbidden = /\.(pt|pth|safetensors|ckpt|onnx|bin|gguf)$/i;
  const allowed = new Set([
    "static_llm/fixtures/tiny_decoder_fixture/tokenizer.json",
    "web/another_brain/model_assets/r28m1/shards/model-q4-00001.bin",
    "web/another_brain/model_assets/r28m1/shards/model-q4-00002.bin",
    "web/another_brain/model_assets/r28m1/shards/model-q4-00003.bin",
    "web/another_brain/model_assets/r28m1/shards/model-q4-00004.bin",
    "web/another_brain/model_assets/r28m1/shards/model-q4-00005.bin",
    "web/another_brain/model_assets/r28m1/tokenizer/tokenizer.json",
  ]);
  const bad = result.stdout
    .split("\n")
    .filter(Boolean)
    .filter((path) => forbidden.test(path) || /(^|\/)tokenizer\.json$/i.test(path))
    .filter((path) => !allowed.has(path));
  assert.deepEqual(bad, []);
  assert.equal(result.stdout.includes("artifacts/r27b8/"), false);
});
