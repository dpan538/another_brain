import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("no model assets or tokenizer artifacts are tracked", () => {
  const result = spawnSync("git", ["ls-files"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stdout, /\.(pt|pth|safetensors|ckpt|onnx|bin|gguf)$/m);
  assert.doesNotMatch(result.stdout, /^(artifacts|web\/another_brain|web\/another_brain_chat|src\/browser_runtime).*tokenizer\.json$/m);
  assert.doesNotMatch(result.stdout, /^artifacts\/r27b1b\//m);
});
