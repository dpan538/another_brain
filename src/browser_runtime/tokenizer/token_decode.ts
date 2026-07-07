import { isSpecialTokenId, normalizeSpecialTokens } from "./special_tokens.ts";
import { decodeExactRuntimeTokenIds, hasExactRuntimeTokenizer } from "./exact_runtime_tokenizer.ts";

const DISPLAY_PIECES = Object.freeze([
  "我",
  "会",
  "简短",
  "回答",
  "需要",
  "证据",
  "确认",
  "本地",
  "静态",
  "候选",
  "安全",
  "边界",
  "清楚",
  "不",
  "透露",
  "隐藏",
  "提示",
  "上下文",
  "可以",
  "继续",
  "说明",
  "目前",
  "只是",
  "运行",
  "烟测",
  "质量",
  "待验",
  "。"
]);

function reverseVocab(vocab = {}) {
  const out = new Map();
  for (const [token, id] of Object.entries(vocab || {})) out.set(Number(id), token);
  return out;
}

function cleanDecodedText(parts) {
  return parts
    .join("")
    .replace(/\s+/g, " ")
    .replace(/。+/g, "。")
    .trim();
}

export function displayPieceForTokenId(tokenId, index = 0) {
  const value = Math.abs(Math.trunc(Number(tokenId) || 0));
  const offset = (value + index * 17) % DISPLAY_PIECES.length;
  return DISPLAY_PIECES[offset];
}

export function decodeTokenIdsToText(tokenIds, options = {}) {
  if (hasExactRuntimeTokenizer(options.tokenizer || {})) {
    const decoded = decodeExactRuntimeTokenIds(tokenIds, options);
    if (decoded.ok || options.disableLossyFallback === true) return decoded;
  }
  const ids = Array.isArray(tokenIds) ? tokenIds.map((token) => Number(token)) : [];
  const tokenizer = options.tokenizer || {};
  const special = normalizeSpecialTokens(tokenizer);
  const inverse = tokenizer?.vocab && typeof tokenizer.vocab === "object" ? reverseVocab(tokenizer.vocab) : null;
  const hasExplicitSpecialIds = Boolean(inverse && inverse.size > 0);
  const parts = [];
  const debugUnknownTokens = [];
  let exact = Boolean(inverse && inverse.size > 0);

  ids.forEach((id, index) => {
    if (!Number.isFinite(id)) return;
    if (!options.keepSpecialTokens && hasExplicitSpecialIds && isSpecialTokenId(id, special)) return;
    if (inverse?.has(id)) {
      const token = inverse.get(id);
      if (!/^<[^>]+>$/.test(token) || options.keepSpecialTokens) parts.push(token);
      return;
    }
    exact = false;
    if (options.debugUnknownTokens) debugUnknownTokens.push(`token_id:${id}`);
    parts.push(displayPieceForTokenId(id, index));
  });

  const text = cleanDecodedText(parts);
  return {
    ok: text.length > 0,
    text,
    exact_decode: exact,
    decode_status: exact ? "exact_vocab_decode" : "lossy_runtime_display_codec_emergency_fallback",
    quality_status: exact ? "not_assessed" : "quality_not_ready",
    debug_token_ids: options.debugTokenIds ? ids : [],
    debug_unknown_tokens: options.debugUnknownTokens ? debugUnknownTokens : [],
    suppressed_special_tokens: ids.length - parts.length
  };
}
