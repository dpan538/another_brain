import test from "node:test";
import assert from "node:assert/strict";
import { applyGeluInPlace, argmax, linearQ4 } from "../../src/browser_runtime/q4_runtime/kernels.ts";
import { layerNorm } from "../../src/browser_runtime/q4_runtime/layer_norm.ts";
import { buildTinyDecoderFixture } from "./fixture_helpers.ts";

test("layer norm normalizes a vector with affine parameters", () => {
  const out = layerNorm(new Float32Array([2, 0]), new Float32Array([1, 1]), new Float32Array([0, 0]));
  assert.ok(out[0] > 0.99);
  assert.ok(out[1] < -0.99);
});

test("linear q4 matmul and argmax work on tiny q4 tensors", () => {
  const { store } = buildTinyDecoderFixture();
  const logits = linearQ4(new Float32Array([1, -1]), store.getTensor("lm_head.weight"));
  const best = argmax(logits);
  assert.equal(best.index, 1);
});

test("gelu activation is monotonic around the positive fixture range", () => {
  const values = applyGeluInPlace(new Float32Array([-1, 0, 1, 2]));
  assert.ok(values[0] < values[1]);
  assert.ok(values[2] < values[3]);
});
