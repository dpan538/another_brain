import test from "node:test";
import assert from "node:assert/strict";
import { buildTinyDecoderFixture } from "./fixture_helpers.ts";

test("q4 tensor store resolves tensor metadata and byte offsets", () => {
  const { store } = buildTinyDecoderFixture();
  const tokenEmb = store.getTensor("token_emb.weight");
  assert.equal(tokenEmb.rows, 4);
  assert.equal(tokenEmb.cols, 2);
  assert.deepEqual(Array.from(tokenEmb.dequantizeRow(0)), [2, 0]);
  const lmHead = store.getTensor("lm_head.weight");
  assert.deepEqual(Array.from(lmHead.dequantizeRow(1)), [1, -1]);
});

test("q4 tensor store fails closed on missing tensors", () => {
  const { store } = buildTinyDecoderFixture();
  assert.throws(() => store.getTensor("missing.weight"), /tensor_missing/);
});
