import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { inspectRuntimeTokenizer } from "../../src/browser_runtime/tokenizer/runtime_tokenizer.ts";

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

test("RT2 tokenizer runtime inspects R28M1 metadata without product-tokenizer claims", async () => {
  const tokenizer = await readJson("web/another_brain/model_assets/r28m1/tokenizer/runtime_tokenizer.json");
  const modelConfig = await readJson("web/another_brain/model_assets/r28m1/model.config.json");
  const quantization = await readJson("web/another_brain/model_assets/r28m1/quantization.manifest.json");
  const inspected = inspectRuntimeTokenizer(tokenizer, modelConfig, quantization);
  assert.equal(inspected.ok, true, inspected.failures.join(","));
  assert.equal(inspected.vocab_size, 16000);
  assert.equal(inspected.encode_available, true);
  assert.equal(inspected.decode_available, true);
  assert.equal(inspected.exact_decode, true);
  assert.equal(inspected.decode_status, "exact_runtime_tokenizer");
  assert.equal(inspected.non_claims.product_tokenizer, false);
  assert.equal(inspected.non_claims.tokenizer_training_artifact, false);
});
