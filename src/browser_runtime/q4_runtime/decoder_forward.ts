import { attentionOneToken } from "./attention.ts";
import { addInPlace, argmax, linearQ4 } from "./kernels.ts";
import { layerNormFromStore } from "./layer_norm.ts";
import { mlpForward } from "./mlp.ts";

export function embeddingForToken(store, tokenId, position) {
  const tokenEmb = store.getTensor("token_emb.weight").dequantizeRow(tokenId);
  const posEmb = store.getTensor("pos_emb.weight").dequantizeRow(position);
  return addInPlace(tokenEmb, posEmb);
}

export function decoderForwardOneToken(store, architecture, tokenId, options = {}) {
  const vocabSize = architecture.vocab_size;
  const contextLength = architecture.context_length;
  const token = Math.max(0, Math.min(Number(tokenId || 0), vocabSize - 1));
  const position = Math.max(0, Math.min(Number(options.position || 0), contextLength - 1));
  let hidden = embeddingForToken(store, token, position);
  for (let layer = 0; layer < architecture.n_layer; layer += 1) {
    const norm1 = layerNormFromStore(hidden, store, `blocks.${layer}.ln1.weight`, `blocks.${layer}.ln1.bias`);
    const attention = attentionOneToken(norm1, store, layer, architecture);
    hidden = addInPlace(hidden, attention);
    const norm2 = layerNormFromStore(hidden, store, `blocks.${layer}.ln2.weight`, `blocks.${layer}.ln2.bias`);
    const mlp = mlpForward(norm2, store, layer);
    hidden = addInPlace(hidden, mlp);
  }
  hidden = layerNormFromStore(hidden, store, "ln_f.weight", "ln_f.bias");
  const logits = linearQ4(hidden, store.getTensor("lm_head.weight"));
  const next = argmax(logits);
  return {
    token_id: token,
    position,
    logits,
    next_token_id: next.index,
    next_token_logit: next.value
  };
}
