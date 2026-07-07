export const DEFAULT_SPECIAL_TOKEN_IDS = Object.freeze({
  pad: 0,
  bos: 1,
  eos: 2,
  unk: 3
});

export function normalizeSpecialTokens(tokenizer = {}) {
  const vocab = tokenizer?.vocab && typeof tokenizer.vocab === "object" ? tokenizer.vocab : {};
  const names = tokenizer?.special_tokens && typeof tokenizer.special_tokens === "object"
    ? tokenizer.special_tokens
    : {};
  return {
    pad: Number.isInteger(vocab[names.pad || "<pad>"]) ? vocab[names.pad || "<pad>"] : DEFAULT_SPECIAL_TOKEN_IDS.pad,
    bos: Number.isInteger(vocab[names.bos || "<bos>"]) ? vocab[names.bos || "<bos>"] : DEFAULT_SPECIAL_TOKEN_IDS.bos,
    eos: Number.isInteger(vocab[names.eos || "<eos>"]) ? vocab[names.eos || "<eos>"] : DEFAULT_SPECIAL_TOKEN_IDS.eos,
    unk: Number.isInteger(vocab[names.unk || "<unk>"]) ? vocab[names.unk || "<unk>"] : DEFAULT_SPECIAL_TOKEN_IDS.unk
  };
}

export function isSpecialTokenId(tokenId, special = DEFAULT_SPECIAL_TOKEN_IDS) {
  const value = Number(tokenId);
  return value === special.pad || value === special.bos || value === special.eos;
}
