import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRuntimeTokenizer, inspectRuntimeTokenizer } from "../../src/browser_runtime/tokenizer/runtime_tokenizer.ts";
import { decodeTokenIdsToText, displayPieceForTokenId } from "../../src/browser_runtime/tokenizer/token_decode.ts";
import { summarizeTokenizerSource } from "../../src/browser_runtime/tokenizer/tokenizer_source.ts";

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

test("R28TOK1 committed runtime tokenizer is exact BPE primary path", async () => {
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
  assert.equal(inspected.emergency_lossy_fallback_available, true);
  assert.equal(inspected.non_claims.product_tokenizer, false);
  assert.equal(inspected.non_claims.browser_admission, false);
});

test("R28TOK1 exact tokenizer encodes and decodes Chinese text", async () => {
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

test("R28TOK1 lossy display codec remains emergency fallback only", () => {
  const decoded = decodeTokenIdsToText([123, 456], { tokenizer: { vocab_size: 16000 } });
  assert.equal(decoded.decode_status, "lossy_runtime_display_codec_emergency_fallback");
  assert.ok(decoded.text.includes(displayPieceForTokenId(123, 0)));
});

test("R28TOK1 tokenizer source summary keeps non-claims", () => {
  const summary = summarizeTokenizerSource({
    exact_tokenizer_found: true,
    tokenizer_type: "BPE",
    vocab_size: 16000,
    source_kind: "r27a4_model_lab_tokenizer",
    can_commit_runtime_asset: true
  });
  assert.equal(summary.exact_tokenizer_found, true);
  assert.equal(summary.can_commit_runtime_asset, true);
  assert.equal(summary.non_claims.training, false);
  assert.equal(summary.non_claims.browser_admission, false);
});
