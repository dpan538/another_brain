import { Q4TensorStore } from "../../src/browser_runtime/q4_runtime/tensor_store.ts";
import { packQ4Nibbles } from "../../src/browser_runtime/q4_runtime/q4_dequant.ts";

function addTensor(tensors, chunks, name, shape, values, scale = 1) {
  const offset = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const bytes = packQ4Nibbles(values, scale);
  chunks.push(bytes);
  tensors.push({
    name,
    shape,
    offset,
    bytes: bytes.byteLength,
    encoding: "q4_symmetric_per_tensor",
    scale,
    pad_nibbles: values.length % 2
  });
}

function zeros(count) {
  return Array.from({ length: count }, () => 0);
}

export function buildTinyDecoderFixture() {
  const tensors = [];
  const chunks = [];
  addTensor(tensors, chunks, "token_emb.weight", [4, 2], [2, 0, 0, 2, -2, 0, 0, -2]);
  addTensor(tensors, chunks, "pos_emb.weight", [4, 2], zeros(8));
  addTensor(tensors, chunks, "blocks.0.ln1.weight", [2], [1, 1]);
  addTensor(tensors, chunks, "blocks.0.ln1.bias", [2], [0, 0]);
  addTensor(tensors, chunks, "blocks.0.attn.attn.in_proj_weight", [6, 2], zeros(12));
  addTensor(tensors, chunks, "blocks.0.attn.attn.in_proj_bias", [6], zeros(6));
  addTensor(tensors, chunks, "blocks.0.attn.attn.out_proj.weight", [2, 2], zeros(4));
  addTensor(tensors, chunks, "blocks.0.attn.attn.out_proj.bias", [2], zeros(2));
  addTensor(tensors, chunks, "blocks.0.ln2.weight", [2], [1, 1]);
  addTensor(tensors, chunks, "blocks.0.ln2.bias", [2], [0, 0]);
  addTensor(tensors, chunks, "blocks.0.mlp.0.weight", [4, 2], zeros(8));
  addTensor(tensors, chunks, "blocks.0.mlp.0.bias", [4], zeros(4));
  addTensor(tensors, chunks, "blocks.0.mlp.2.weight", [2, 4], zeros(8));
  addTensor(tensors, chunks, "blocks.0.mlp.2.bias", [2], zeros(2));
  addTensor(tensors, chunks, "ln_f.weight", [2], [1, 1]);
  addTensor(tensors, chunks, "ln_f.bias", [2], [0, 0]);
  addTensor(tensors, chunks, "lm_head.weight", [4, 2], [0, 0, 1, -1, -1, 1, 1, 0]);
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const weights = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    weights.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  const modelConfig = {
    architecture: {
      vocab_size: 4,
      context_length: 4,
      n_layer: 1,
      n_head: 1,
      n_embd: 2
    },
    tensors
  };
  const quantizationManifest = {
    quantization: "q4",
    quantization_kind: "q4_symmetric_per_tensor_with_bool_bitpack",
    same_origin_only: true,
    shards: [{ path: "fixture.bin", offset: 0, bytes: weights.byteLength, sha256: "fixture" }]
  };
  const tokenizer = { runtime_compatible: false, browser_inference_ready: false, vocab_size: 4 };
  const runtimePackage = { modelConfig, quantizationManifest, tokenizer, assetManifest: {}, checksums: {}, browser_worker_can_load_manifest: true };
  const store = new Q4TensorStore({ modelConfig, quantizationManifest, weights, maxTensorCacheEntries: 16 });
  return { modelConfig, quantizationManifest, tokenizer, runtimePackage, store, weights };
}
