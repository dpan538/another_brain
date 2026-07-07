import { DEFAULT_SPECIAL_TOKEN_IDS, normalizeSpecialTokens } from "./special_tokens.ts";
import { encodeExactRuntimeText, hasExactRuntimeTokenizer } from "./exact_runtime_tokenizer.ts";

function clampVocabId(value, vocabSize) {
  const id = Number(value);
  if (!Number.isFinite(id)) return DEFAULT_SPECIAL_TOKEN_IDS.unk;
  return ((Math.trunc(id) % vocabSize) + vocabSize) % vocabSize;
}

export function encodeTextToTokenIds(text, options = {}) {
  if (hasExactRuntimeTokenizer(options.tokenizer || {})) {
    return encodeExactRuntimeText(text, options);
  }
  const vocabSize = Math.max(4, Number(options.vocabSize || options.tokenizer?.vocab_size || 16000));
  const maxTokens = Math.max(1, Number(options.maxTokens || options.contextLength || 256));
  const special = normalizeSpecialTokens(options.tokenizer || {});
  const value = String(text || "").normalize("NFC");
  const chars = Array.from(value.trim() || "\u0000");
  const encoded = chars.map((char) => clampVocabId(char.codePointAt(0) || special.unk, vocabSize));
  const inputIds = [
    ...(options.addBos ? [special.bos] : []),
    ...encoded,
    ...(options.addEos ? [special.eos] : [])
  ].slice(-maxTokens);
  return {
    ok: inputIds.length > 0,
    input_ids: inputIds,
    attention_mask: inputIds.map(() => 1),
    vocab_size: vocabSize,
    tokenizer_type: "unicode_modulo_runtime_display_codec",
    exact_encode: false,
    encode_status: "lossy_runtime_display_codec_emergency_fallback",
    preserves_chinese_codepoints_before_modulo: /[\u3400-\u9fff]/u.test(value),
    unknown_token_id: special.unk,
    special_tokens: special
  };
}
