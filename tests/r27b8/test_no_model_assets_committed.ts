import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("R27B8 does not track model weights, tokenizer artifacts, shards, or ONNX assets", () => {
  const result = spawnSync("git", ["ls-files"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  const forbidden = /\.(pt|pth|safetensors|ckpt|onnx|bin|gguf)$/i;
  const bad = result.stdout
    .split("\n")
    .filter(Boolean)
    .filter((path) => forbidden.test(path) || /(^|\/)tokenizer\.json$/i.test(path))
    .filter((path) => path !== "static_llm/fixtures/tiny_decoder_fixture/tokenizer.json");
  assert.deepEqual(bad, []);
  assert.equal(result.stdout.includes("artifacts/r27b8/"), false);
});
