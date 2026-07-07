export const R28RT1_MODEL_CONFIG_BLOCKER = "model_config_insufficient_for_forward";

function tensorByName(config, name) {
  return (config.tensors || []).find((tensor) => tensor.name === name) || null;
}

function requireNumber(value, label, failures) {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    failures.push(`missing_or_invalid:${label}`);
    return 0;
  }
  return numberValue;
}

export function inspectModelArchitecture(modelConfig = {}, quantizationManifest = {}, tokenizer = {}) {
  const failures = [];
  const architecture = modelConfig.architecture || {};
  const vocabSize = requireNumber(architecture.vocab_size, "vocab_size", failures);
  const contextLength = requireNumber(architecture.context_length, "context_length", failures);
  const nLayer = requireNumber(architecture.n_layer, "n_layer", failures);
  const nHead = requireNumber(architecture.n_head, "n_head", failures);
  const nEmbd = requireNumber(architecture.n_embd, "n_embd", failures);
  const headDim = nHead > 0 ? nEmbd / nHead : 0;
  if (!Number.isInteger(headDim) || headDim <= 0) failures.push("head_dim_not_integer");

  const requiredTensors = [
    "token_emb.weight",
    "pos_emb.weight",
    "ln_f.weight",
    "ln_f.bias",
    "lm_head.weight"
  ];
  for (let layer = 0; layer < nLayer; layer += 1) {
    requiredTensors.push(
      `blocks.${layer}.ln1.weight`,
      `blocks.${layer}.ln1.bias`,
      `blocks.${layer}.attn.attn.in_proj_weight`,
      `blocks.${layer}.attn.attn.in_proj_bias`,
      `blocks.${layer}.attn.attn.out_proj.weight`,
      `blocks.${layer}.attn.attn.out_proj.bias`,
      `blocks.${layer}.ln2.weight`,
      `blocks.${layer}.ln2.bias`,
      `blocks.${layer}.mlp.0.weight`,
      `blocks.${layer}.mlp.0.bias`,
      `blocks.${layer}.mlp.2.weight`,
      `blocks.${layer}.mlp.2.bias`
    );
  }
  const tensorNames = new Set((modelConfig.tensors || []).map((tensor) => tensor.name));
  for (const name of requiredTensors) {
    if (!tensorNames.has(name)) failures.push(`missing_tensor:${name}`);
  }

  if (quantizationManifest.quantization !== "q4") failures.push("quantization_not_q4");
  if (quantizationManifest.quantization_kind !== "q4_symmetric_per_tensor_with_bool_bitpack") {
    failures.push("unsupported_q4_packing_format");
  }
  const tokenizerReady = tokenizer.exact_runtime_tokenizer === true || tokenizer.runtime_compatible === true;
  if (!tokenizerReady) {
    failures.push("runtime_tokenizer_not_browser_compatible_for_text_decode");
  }

  const lmHead = tensorByName(modelConfig, "lm_head.weight");
  const tokenEmb = tensorByName(modelConfig, "token_emb.weight");
  const tiedEmbedding = Boolean(lmHead && tokenEmb && lmHead.offset === tokenEmb.offset);

  return {
    ok: failures.filter((failure) => failure !== "runtime_tokenizer_not_browser_compatible_for_text_decode").length === 0,
    blocker: failures.some((failure) => failure.startsWith("missing_or_invalid") || failure.startsWith("missing_tensor") || failure === "head_dim_not_integer")
      ? R28RT1_MODEL_CONFIG_BLOCKER
      : "",
    warnings: failures.filter((failure) => failure === "runtime_tokenizer_not_browser_compatible_for_text_decode"),
    failures: failures.filter((failure) => failure !== "runtime_tokenizer_not_browser_compatible_for_text_decode"),
    architecture: {
      vocab_size: vocabSize,
      context_length: contextLength,
      n_layer: nLayer,
      n_head: nHead,
      n_embd: nEmbd,
      head_dim: headDim,
      activation: "gelu",
      activation_inferred_from_tensors: true,
      norm_type: "layer_norm",
      norm_type_inferred_from_tensors: true,
      attention_type: "packed_qkv_multihead_attention",
      positional_encoding_type: "learned_absolute",
      tied_embedding: tiedEmbedding,
      lm_head: lmHead ? "separate_lm_head_weight" : "missing"
    },
    tensor_names: Array.from(tensorNames).sort(),
    q4_tensor_packing_format: quantizationManifest.quantization_kind || "",
    tokenizer_runtime_compatible: tokenizerReady,
    tokenizer_browser_inference_ready: tokenizer.exact_runtime_tokenizer === true || tokenizer.browser_runtime_ready === true
  };
}

export function assertForwardArchitecture(inspected) {
  if (!inspected?.ok) {
    throw new Error(inspected?.blocker || R28RT1_MODEL_CONFIG_BLOCKER);
  }
  return inspected.architecture;
}
