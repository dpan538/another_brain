import { linearQ4, linearQ4Rows } from "./kernels.ts";

export function attentionOneToken(input, store, layerIndex, architecture) {
  const nEmbd = architecture.n_embd;
  const inProjWeight = store.getTensor(`blocks.${layerIndex}.attn.attn.in_proj_weight`);
  const inProjBias = store.getTensor(`blocks.${layerIndex}.attn.attn.in_proj_bias`);
  const value = linearQ4Rows(input, inProjWeight, 2 * nEmbd, nEmbd, inProjBias);
  const outProjWeight = store.getTensor(`blocks.${layerIndex}.attn.attn.out_proj.weight`);
  const outProjBias = store.getTensor(`blocks.${layerIndex}.attn.attn.out_proj.bias`);
  return linearQ4(value, outProjWeight, outProjBias);
}
