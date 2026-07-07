import { decodeTokenIdsToText } from "./token_decode.ts";
import { encodeTextToTokenIds } from "./token_encode.ts";
import { normalizeSpecialTokens } from "./special_tokens.ts";

export const R28RT2_EXACT_TOKENIZER_LIMITATION = "exact_runtime_tokenizer_vocab_missing";

export function inspectRuntimeTokenizer(tokenizer = {}, modelConfig = {}, quantizationManifest = {}) {
  const architecture = modelConfig.architecture || {};
  const vocabSize = Number(tokenizer.vocab_size || architecture.vocab_size || 0);
  const vocab = tokenizer?.vocab && typeof tokenizer.vocab === "object" ? tokenizer.vocab : null;
  const specialTokens = normalizeSpecialTokens(tokenizer);
  const failures = [];
  if (!Number.isInteger(vocabSize) || vocabSize <= 0) failures.push("tokenizer_vocab_size_missing");
  if (architecture.vocab_size && Number(architecture.vocab_size) !== vocabSize) failures.push("tokenizer_model_vocab_size_mismatch");
  if (quantizationManifest.quantization && quantizationManifest.quantization !== "q4") failures.push("tokenizer_loaded_for_non_q4_manifest");
  const exactDecode = Boolean(vocab && Object.keys(vocab).length > 0);
  return {
    ok: failures.length === 0,
    failures,
    tokenizer_type: tokenizer.tokenizer_kind || tokenizer.type || "runtime_lineage_metadata",
    vocab_size: vocabSize,
    exact_vocab_available: exactDecode,
    encode_available: failures.length === 0,
    decode_available: failures.length === 0,
    decode_status: exactDecode ? "exact_vocab_decode" : "lossy_runtime_display_codec",
    exact_decode: exactDecode,
    limitation: exactDecode ? "" : R28RT2_EXACT_TOKENIZER_LIMITATION,
    special_tokens: specialTokens,
    chinese_text_handling: "unicode_codepoint_modulo_encode_with_lossy_display_decode",
    browser_runtime_ready: failures.length === 0,
    non_claims: {
      product_tokenizer: false,
      tokenizer_training_artifact: false,
      exact_bpe_decode: exactDecode
    }
  };
}

export function createRuntimeTokenizer(options = {}) {
  const tokenizer = options.tokenizer || {};
  const modelConfig = options.modelConfig || {};
  const quantizationManifest = options.quantizationManifest || {};
  const inspection = inspectRuntimeTokenizer(tokenizer, modelConfig, quantizationManifest);
  return {
    inspection,
    encode(text, encodeOptions = {}) {
      if (!inspection.ok) return { ok: false, input_ids: [], attention_mask: [], blocker: inspection.failures[0] || "tokenizer_runtime_invalid" };
      return encodeTextToTokenIds(text, {
        ...encodeOptions,
        tokenizer,
        vocabSize: inspection.vocab_size,
        contextLength: encodeOptions.contextLength || modelConfig.architecture?.context_length || 256
      });
    },
    decode(tokenIds, decodeOptions = {}) {
      if (!inspection.ok) return { ok: false, text: "", blocker: inspection.failures[0] || "tokenizer_runtime_invalid" };
      return decodeTokenIdsToText(tokenIds, { ...decodeOptions, tokenizer });
    }
  };
}
