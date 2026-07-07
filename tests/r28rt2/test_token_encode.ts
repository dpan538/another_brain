import test from "node:test";
import assert from "node:assert/strict";
import { encodeTextToTokenIds } from "../../src/browser_runtime/tokenizer/token_encode.ts";

test("RT2 prompt encoder handles simple Chinese text locally", () => {
  const encoded = encodeTextToTokenIds("你好，鳄鱼", { vocabSize: 16000, maxTokens: 16 });
  assert.equal(encoded.ok, true);
  assert.ok(encoded.input_ids.length >= 4);
  assert.ok(encoded.input_ids.every((id) => Number.isInteger(id) && id >= 0 && id < 16000));
  assert.equal(encoded.exact_encode, false);
  assert.equal(encoded.preserves_chinese_codepoints_before_modulo, true);
});
