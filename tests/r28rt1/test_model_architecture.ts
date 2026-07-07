import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { inspectModelArchitecture } from "../../src/browser_runtime/q4_runtime/model_architecture.ts";

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

test("inspects committed R28M1 decoder architecture without guessing critical fields", async () => {
  const config = await readJson("web/another_brain/model_assets/r28m1/model.config.json");
  const quant = await readJson("web/another_brain/model_assets/r28m1/quantization.manifest.json");
  const tokenizer = await readJson("web/another_brain/model_assets/r28m1/tokenizer/tokenizer.json");
  const inspected = inspectModelArchitecture(config, quant, tokenizer);
  assert.equal(inspected.ok, true, inspected.failures.join(","));
  assert.equal(inspected.architecture.vocab_size, 16000);
  assert.equal(inspected.architecture.context_length, 256);
  assert.equal(inspected.architecture.n_layer, 7);
  assert.equal(inspected.architecture.n_head, 14);
  assert.equal(inspected.architecture.n_embd, 896);
  assert.equal(inspected.architecture.head_dim, 64);
  assert.equal(inspected.architecture.activation, "gelu");
  assert.equal(inspected.architecture.norm_type, "layer_norm");
  assert.equal(inspected.architecture.positional_encoding_type, "learned_absolute");
  assert.equal(inspected.architecture.lm_head, "separate_lm_head_weight");
  assert.ok(inspected.tensor_names.includes("blocks.0.attn.attn.in_proj_weight"));
  assert.ok(inspected.warnings.includes("runtime_tokenizer_not_browser_compatible_for_text_decode"));
});
