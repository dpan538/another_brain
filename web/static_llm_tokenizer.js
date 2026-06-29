function cleanText(text) {
  return String(text || "").trim();
}

function reverseVocab(vocab = {}) {
  const out = {};
  for (const [token, id] of Object.entries(vocab || {})) out[String(id)] = token;
  return out;
}

async function readJsonFromFetcher(file, fetcher) {
  if (typeof fetcher !== "function") return { ok: false, reason: "fetcher_required" };
  const result = await fetcher(file);
  if (!result?.ok) return { ok: false, reason: result?.reason || "asset_fetch_failed" };
  if (result.json && typeof result.json === "object") return { ok: true, json: result.json };
  if (typeof result.text === "string") {
    try {
      return { ok: true, json: JSON.parse(result.text) };
    } catch {
      return { ok: false, reason: "json_parse_failed" };
    }
  }
  if (result.arrayBuffer) {
    try {
      const text = new TextDecoder().decode(result.arrayBuffer);
      return { ok: true, json: JSON.parse(text) };
    } catch {
      return { ok: false, reason: "json_parse_failed" };
    }
  }
  return { ok: false, reason: "fetcher_returned_no_json" };
}

export async function loadTokenizerFromManifest(manifest, fetcher) {
  const files = Array.isArray(manifest?.files) ? manifest.files : [];
  const tokenizerFile = files.find((file) => file.role === "tokenizer");
  const configFile = files.find((file) => file.role === "config");
  if (!tokenizerFile) return { ok: false, reason: "tokenizer_file_missing", tokenizer: null, config: null };
  if (!configFile) return { ok: false, reason: "config_file_missing", tokenizer: null, config: null };
  const tokenizer = await readJsonFromFetcher(tokenizerFile, fetcher);
  if (!tokenizer.ok) return { ok: false, reason: tokenizer.reason, tokenizer: null, config: null };
  const config = await readJsonFromFetcher(configFile, fetcher);
  if (!config.ok) return { ok: false, reason: config.reason, tokenizer: tokenizer.json, config: null };
  const validation = validateTokenizerConfig(tokenizer.json, config.json);
  return {
    ok: validation.ok,
    reason: validation.ok ? "tokenizer_loaded" : validation.reason,
    tokenizer: tokenizer.json,
    config: config.json,
    validation
  };
}

export function tokenizeForStaticLlm(text, tokenizer = {}, options = {}) {
  const value = cleanText(text);
  if (tokenizer.fixture !== true && tokenizer.type !== "wordpiece-placeholder") {
    return {
      ok: false,
      reason: "unsupported_tokenizer_format",
      productionReady: false,
      inputIds: [],
      attentionMask: []
    };
  }
  const vocab = tokenizer.vocab || {};
  const bos = Number.isInteger(vocab["<bos>"]) ? vocab["<bos>"] : null;
  const eos = Number.isInteger(vocab["<eos>"]) ? vocab["<eos>"] : null;
  const fallback = Number.isInteger(vocab["<pad>"]) ? vocab["<pad>"] : 0;
  const words = value.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const inputIds = [
    ...(options.addBos === false || bos === null ? [] : [bos]),
    ...words.map((word) => Number.isInteger(vocab[word]) ? vocab[word] : fallback),
    ...(options.addEos === true && eos !== null ? [eos] : [])
  ];
  return {
    ok: true,
    reason: "fixture_tokenized",
    productionReady: false,
    inputIds,
    attentionMask: inputIds.map(() => 1)
  };
}

export function detokenizeStaticLlmTokens(tokens = [], tokenizer = {}, options = {}) {
  if (tokenizer.fixture !== true && tokenizer.type !== "wordpiece-placeholder") {
    return { ok: false, reason: "unsupported_tokenizer_format", text: "" };
  }
  const inverse = reverseVocab(tokenizer.vocab || {});
  const special = new Set(options.keepSpecialTokens ? [] : ["<pad>", "<bos>", "<eos>"]);
  const parts = (Array.isArray(tokens) ? tokens : [])
    .map((token) => inverse[String(token)] || "<unk>")
    .filter((token) => !special.has(token));
  return {
    ok: true,
    reason: "fixture_detokenized",
    text: parts.join(" ").trim()
  };
}

export function validateTokenizerConfig(tokenizer = {}, config = {}) {
  if (!tokenizer || typeof tokenizer !== "object") return { ok: false, reason: "tokenizer_not_object", productionReady: false };
  if (!config || typeof config !== "object") return { ok: false, reason: "config_not_object", productionReady: false };
  if (tokenizer.fixture === true && config.fixture === true) {
    return {
      ok: true,
      reason: "fixture_tokenizer_config_valid",
      productionReady: false,
      tokenizerType: tokenizer.type || "fixture",
      modelType: config.model_type || "fixture"
    };
  }
  if (!tokenizer.type && !tokenizer.model && !tokenizer.tokenizer_class) {
    return { ok: false, reason: "unsupported_tokenizer_format", productionReady: false };
  }
  if (!config.model_type && !config.architecture && !config.architectures) {
    return { ok: false, reason: "config_missing_model_type", productionReady: false };
  }
  return {
    ok: true,
    reason: "tokenizer_config_metadata_present",
    productionReady: false,
    tokenizerType: tokenizer.type || tokenizer.tokenizer_class || "unknown",
    modelType: config.model_type || config.architecture || "unknown"
  };
}
