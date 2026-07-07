const BYTE_ENCODER = new Map();
const BYTE_DECODER = new Map();
const PAIR_SEPARATOR = "\u0001";

function buildByteMaps() {
  if (BYTE_ENCODER.size > 0) return;
  const bs = [];
  for (let code = 33; code <= 126; code += 1) bs.push(code);
  for (let code = 161; code <= 172; code += 1) bs.push(code);
  for (let code = 174; code <= 255; code += 1) bs.push(code);
  const cs = [...bs];
  let extra = 0;
  for (let byte = 0; byte < 256; byte += 1) {
    if (!bs.includes(byte)) {
      bs.push(byte);
      cs.push(256 + extra);
      extra += 1;
    }
  }
  for (let index = 0; index < bs.length; index += 1) {
    const char = String.fromCodePoint(cs[index]);
    BYTE_ENCODER.set(bs[index], char);
    BYTE_DECODER.set(char, bs[index]);
  }
}

function byteLevelEncode(text) {
  buildByteMaps();
  const bytes = new TextEncoder().encode(text);
  return Array.from(bytes, (byte) => BYTE_ENCODER.get(byte) || "");
}

function byteLevelDecode(text) {
  buildByteMaps();
  const bytes = [];
  for (const char of Array.from(text || "")) {
    const byte = BYTE_DECODER.get(char);
    if (Number.isInteger(byte)) bytes.push(byte);
  }
  if (bytes.length === 0) return "";
  return new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes));
}

function normalizeInput(text, tokenizer) {
  const value = String(text || "");
  if (tokenizer?.normalizer?.type === "NFKC") return value.normalize("NFKC");
  if (tokenizer?.normalization === "NFKC") return value.normalize("NFKC");
  return value.normalize("NFC");
}

function splitCjkAware(text) {
  const parts = [];
  let current = "";
  for (const char of Array.from(text)) {
    if (/[\u4e00-\u9fff]/u.test(char)) {
      if (current) parts.push(current);
      parts.push(char);
      current = "";
    } else {
      current += char;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function mergeKey(left, right) {
  return `${left}${PAIR_SEPARATOR}${right}`;
}

function buildMergeRanks(merges = []) {
  const ranks = new Map();
  merges.forEach((merge, index) => {
    if (Array.isArray(merge) && merge.length >= 2) {
      ranks.set(mergeKey(String(merge[0]), String(merge[1])), index);
      return;
    }
    if (typeof merge === "string") {
      const [left, right] = merge.split(/\s+/);
      if (left && right) ranks.set(mergeKey(left, right), index);
    }
  });
  return ranks;
}

function applyBpe(symbols, mergeRanks) {
  if (symbols.length <= 1 || mergeRanks.size === 0) return symbols;
  let pieces = symbols.slice();
  while (pieces.length > 1) {
    let bestIndex = -1;
    let bestRank = Infinity;
    for (let index = 0; index < pieces.length - 1; index += 1) {
      const rank = mergeRanks.get(mergeKey(pieces[index], pieces[index + 1]));
      if (rank !== undefined && rank < bestRank) {
        bestRank = rank;
        bestIndex = index;
      }
    }
    if (bestIndex < 0) break;
    const next = [];
    for (let index = 0; index < pieces.length; index += 1) {
      if (index === bestIndex) {
        next.push(pieces[index] + pieces[index + 1]);
        index += 1;
      } else {
        next.push(pieces[index]);
      }
    }
    pieces = next;
  }
  return pieces;
}

function specialTokenByContent(tokenizer = {}) {
  const out = new Map();
  const vocab = tokenizer.vocab || tokenizer.model?.vocab || {};
  for (const item of tokenizer.added_tokens || []) {
    if (item?.special && Number.isInteger(vocab[item.content])) out.set(item.content, vocab[item.content]);
    if (item?.special && Number.isInteger(item.id)) out.set(item.content, item.id);
  }
  for (const token of Object.values(tokenizer.special_tokens || {})) {
    if (Number.isInteger(vocab[token])) out.set(token, vocab[token]);
  }
  return out;
}

function exactVocab(tokenizer = {}) {
  return tokenizer.vocab || tokenizer.model?.vocab || {};
}

function exactMerges(tokenizer = {}) {
  return tokenizer.merges || tokenizer.model?.merges || [];
}

export function hasExactRuntimeTokenizer(tokenizer = {}) {
  const vocab = exactVocab(tokenizer);
  const merges = exactMerges(tokenizer);
  return Boolean(
    tokenizer.exact_runtime_tokenizer === true &&
      tokenizer.runtime_compatible === true &&
      vocab &&
      typeof vocab === "object" &&
      Object.keys(vocab).length > 0 &&
      Array.isArray(merges)
  );
}

export function encodeExactRuntimeText(text, options = {}) {
  const tokenizer = options.tokenizer || {};
  if (!hasExactRuntimeTokenizer(tokenizer)) {
    return { ok: false, input_ids: [], attention_mask: [], blocker: "exact_runtime_tokenizer_unavailable" };
  }
  const vocab = exactVocab(tokenizer);
  const merges = exactMerges(tokenizer);
  const mergeRanks = buildMergeRanks(merges);
  const special = specialTokenByContent(tokenizer);
  const unkId = Number.isInteger(vocab[tokenizer.unk_token || "<unk>"]) ? vocab[tokenizer.unk_token || "<unk>"] : 1;
  const normalized = normalizeInput(text, tokenizer);
  const maxTokens = Math.max(1, Number(options.maxTokens || options.contextLength || 256));
  const addBos = options.addBos !== undefined ? options.addBos === true : true;
  const addEos = options.addEos === true;
  const inputIds = [];
  if (addBos && special.has("<bos>")) inputIds.push(special.get("<bos>"));
  for (const part of splitCjkAware(normalized)) {
    const byteSymbols = byteLevelEncode(part);
    const bpePieces = applyBpe(byteSymbols, mergeRanks);
    for (const piece of bpePieces) {
      inputIds.push(Number.isInteger(vocab[piece]) ? vocab[piece] : unkId);
    }
  }
  if (addEos && special.has("<eos>")) inputIds.push(special.get("<eos>"));
  const clipped = inputIds.slice(-maxTokens);
  return {
    ok: clipped.length > 0,
    input_ids: clipped,
    attention_mask: clipped.map(() => 1),
    vocab_size: Number(tokenizer.vocab_size || Object.keys(vocab).length),
    tokenizer_type: tokenizer.tokenizer_kind || "exact_runtime_bpe",
    exact_encode: true,
    encode_status: "exact_runtime_tokenizer",
    special_tokens_added: {
      bos: addBos,
      eos: addEos
    },
    unknown_token_id: unkId,
    chinese_text_handling: "cjk_split_bytelevel_bpe"
  };
}

export function decodeExactRuntimeTokenIds(tokenIds, options = {}) {
  const tokenizer = options.tokenizer || {};
  if (!hasExactRuntimeTokenizer(tokenizer)) {
    return { ok: false, text: "", blocker: "exact_runtime_tokenizer_unavailable" };
  }
  const vocab = exactVocab(tokenizer);
  const inverse = new Map(Object.entries(vocab).map(([token, id]) => [Number(id), token]));
  const specialIds = new Set();
  for (const id of specialTokenByContent(tokenizer).values()) specialIds.add(id);
  const ids = Array.isArray(tokenIds) ? tokenIds.map((token) => Number(token)) : [];
  const pieces = [];
  const debugUnknownTokens = [];
  let exact = true;
  for (const id of ids) {
    if (!Number.isFinite(id)) continue;
    if (!options.keepSpecialTokens && specialIds.has(id)) continue;
    const piece = inverse.get(id);
    if (piece === undefined) {
      exact = false;
      if (options.debugUnknownTokens) debugUnknownTokens.push(`token_id:${id}`);
      continue;
    }
    if (!options.keepSpecialTokens && /^<[^>]+>$/.test(piece)) continue;
    pieces.push(piece);
  }
  const text = byteLevelDecode(pieces.join("")).replace(/\s+/g, " ").trim();
  return {
    ok: text.length > 0,
    text,
    exact_decode: exact,
    decode_status: exact ? "exact_runtime_tokenizer" : "exact_runtime_tokenizer_with_unknown_ids",
    quality_status: "not_assessed",
    debug_token_ids: options.debugTokenIds ? ids : [],
    debug_unknown_tokens: options.debugUnknownTokens ? debugUnknownTokens : [],
    suppressed_special_tokens: ids.length - pieces.length
  };
}

export function inspectExactRuntimeTokenizer(tokenizer = {}) {
  const vocab = exactVocab(tokenizer);
  const merges = exactMerges(tokenizer);
  const failures = [];
  if (!hasExactRuntimeTokenizer(tokenizer)) failures.push("exact_runtime_tokenizer_unavailable");
  const vocabSize = Number(tokenizer.vocab_size || Object.keys(vocab || {}).length || 0);
  if (vocabSize !== 16000) failures.push("exact_tokenizer_vocab_size_not_16000");
  if (!Number.isInteger(vocab["<unk>"])) failures.push("unk_token_missing");
  if (!Number.isInteger(vocab["<bos>"])) failures.push("bos_token_missing");
  if (!Number.isInteger(vocab["<eos>"])) failures.push("eos_token_missing");
  return {
    ok: failures.length === 0,
    failures,
    tokenizer_type: tokenizer.tokenizer_kind || tokenizer.model?.type || "unknown",
    vocab_size: vocabSize,
    merge_count: Array.isArray(merges) ? merges.length : 0,
    exact_encode: failures.length === 0,
    exact_decode: failures.length === 0,
    decode_status: failures.length === 0 ? "exact_runtime_tokenizer" : "exact_runtime_tokenizer_unavailable",
    source_lineage: tokenizer.source_lineage || {}
  };
}
