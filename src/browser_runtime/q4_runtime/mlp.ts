import { applyGeluInPlace, linearQ4 } from "./kernels.ts";

export function mlpForward(input, store, layerIndex) {
  const hidden = linearQ4(
    input,
    store.getTensor(`blocks.${layerIndex}.mlp.0.weight`),
    store.getTensor(`blocks.${layerIndex}.mlp.0.bias`)
  );
  applyGeluInPlace(hidden);
  return linearQ4(
    hidden,
    store.getTensor(`blocks.${layerIndex}.mlp.2.weight`),
    store.getTensor(`blocks.${layerIndex}.mlp.2.bias`)
  );
}
