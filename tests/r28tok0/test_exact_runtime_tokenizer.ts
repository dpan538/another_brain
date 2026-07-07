import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRuntimeTokenizer, inspectRuntimeTokenizer } from "../../src/browser_runtime/tokenizer/runtime_tokenizer.ts";
import { decodeTokenIdsToText, displayPieceForTokenId } from "../../src/browser_runtime/tokenizer/token_decode.ts";

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

test("R28TOK0 committed runtime tokenizer is exact BPE primary path", async () => {
  const tokenizer = await readJson("web/another_brain/model_assets/r28m1/tokenizer/runtime_tokenizer.json");
  const modelConfig = await readJson("web/another_brain/model_assets/r28m1/model.config.json");
  const quantization = await readJson("web/another_brain/model_assets/r28m1/quantization.manifest.json");
  const inspected = inspectRuntimeTokenizer(tokenizer, modelConfig, quantization);
  assert.equal(inspected.ok, true, inspected.failures.join(","));
  assert.equal(inspected.vocab_size, 16000);
  assert.equal(inspected.tokenizer_type, "exact_runtime_tokenizer");
  assert.equal(inspected.exact_encode, true);
  assert.equal(inspected.exact_decode, true);
  assert.equal(inspected.decode_status, "exact_runtime_tokenizer");
  assert.equal(inspected.limitation, "");
  assert.equal(inspected.non_claims.product_tokenizer, false);
  assert.equal(inspected.non_claims.browser_admission, false);
});

test("R28TOK0 exact tokenizer encodes and decodes Chinese text", async () => {
  const tokenizer = await readJson("web/another_brain/model_assets/r28m1/tokenizer/runtime_tokenizer.json");
  const runtimeTokenizer = createRuntimeTokenizer({
    tokenizer,
    modelConfig: { architecture: { vocab_size: 16000, context_length: 256 } },
    quantizationManifest: { quantization: "q4" }
  });
  for (const text of ["你好", "请用中文简短回答。", "证据不足时应该怎么回答？"]) {
    const encoded = runtimeTokenizer.encode(text, { maxTokens: 64 });
    assert.equal(encoded.ok, true);
    assert.equal(encoded.exact_encode, true);
    assert.ok(encoded.input_ids.length > 0);
    const decoded = runtimeTokenizer.decode(encoded.input_ids);
    assert.equal(decoded.ok, true);
    assert.equal(decoded.exact_decode, true);
    assert.equal(decoded.decode_status, "exact_runtime_tokenizer");
    assert.notEqual(decoded.text, "");
    assert.equal(decoded.text.includes("token_id:"), false);
  }
});

test("R28TOK0 lossy display codec remains emergency fallback only", () => {
  const decoded = decodeTokenIdsToText([123, 456], { tokenizer: { vocab_size: 16000 } });
  assert.equal(decoded.decode_status, "lossy_runtime_display_codec_emergency_fallback");
  assert.ok(decoded.text.includes(displayPieceForTokenId(123, 0)));
});
