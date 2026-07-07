const R28HOTFIX2_Q4_RUNTIME_VERSION = "r28rout1-fuzzy-intent-surfaces";
const R28HOTFIX1_Q4_RUNTIME_VERSION = R28HOTFIX2_Q4_RUNTIME_VERSION;
const R28HOTFIX3_Q4_RUNTIME_VERSION = R28HOTFIX2_Q4_RUNTIME_VERSION;
const PAIR_SEPARATOR = "\u0001";
const BYTE_ENCODER = new Map();
const BYTE_DECODER = new Map();

let runtimePackagePromise = null;
let tensorStorePromise = null;

function nowMs() {
  return typeof performance?.now === "function" ? performance.now() : Date.now();
}

function originRoot() {
  return new URL("/", location.href);
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeBrowserAssetPath(value) {
  if (!value || typeof value !== "string") throw new Error("missing_asset_path");
  let path = value.trim().replace(/\\/g, "/");
  if (!path) throw new Error("missing_asset_path");
  if (path.startsWith("/" + "/") || /^[a-z][a-z0-9+.-]*:/i.test(path)) throw new Error("external_asset_url_rejected");
  if (path.startsWith("web/another_brain/")) path = path.slice("web/".length);
  if (path.startsWith("./")) throw new Error("relative_asset_base_missing");
  if (path.startsWith("another_brain/")) path = `/${path}`;
  path = path.replace(/\/{2,}/g, "/");
  const segments = path.split("/").filter(Boolean);
  if (segments.some((part) => part === "." || part === ".." || decodeURIComponentSafe(part) === "..")) {
    throw new Error("path_traversal_rejected");
  }
  if (!path.startsWith("/another_brain/")) throw new Error(`asset_path_not_public_another_brain:${value}`);
  if (path.includes("/artifacts/") || path.includes("/data/public_ingestion/")) throw new Error("forbidden_asset_path_rejected");
  return path;
}

function assetUrl(path) {
  const url = new URL(normalizeBrowserAssetPath(path), originRoot());
  if (url.origin !== location.origin) throw new Error(`non_same_origin_asset_rejected:${path}`);
  return url.href;
}

async function fetchJson(path) {
  const response = await fetch(assetUrl(path), { cache: "force-cache" });
  if (!response.ok) throw new Error(`fetch_json_failed:${path}:${response.status}`);
  return response.json();
}

async function fetchBytes(path) {
  const response = await fetch(assetUrl(path), { cache: "force-cache" });
  if (!response.ok) throw new Error(`fetch_bytes_failed:${path}:${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function sha256Hex(bytes) {
  if (!crypto?.subtle?.digest) return "";
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

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
  return Array.from(new TextEncoder().encode(text), (byte) => BYTE_ENCODER.get(byte) || "");
}

function byteLevelDecode(text) {
  buildByteMaps();
  const bytes = [];
  for (const char of Array.from(text || "")) {
    const byte = BYTE_DECODER.get(char);
    if (Number.isInteger(byte)) bytes.push(byte);
  }
  return bytes.length ? new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes)) : "";
}

function splitCjkAware(text) {
  const parts = [];
  let current = "";
  for (const char of Array.from(String(text || "").normalize("NFC"))) {
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

function exactVocab(tokenizer = {}) {
  return tokenizer.vocab || tokenizer.model?.vocab || {};
}

function exactMerges(tokenizer = {}) {
  return tokenizer.merges || tokenizer.model?.merges || [];
}

function hasExactRuntimeTokenizer(tokenizer = {}) {
  const vocab = exactVocab(tokenizer);
  return Boolean(
    tokenizer.exact_runtime_tokenizer === true &&
      tokenizer.runtime_compatible === true &&
      vocab &&
      typeof vocab === "object" &&
      Object.keys(vocab).length > 0 &&
      Array.isArray(exactMerges(tokenizer))
  );
}

function specialTokenByContent(tokenizer = {}) {
  const out = new Map();
  const vocab = exactVocab(tokenizer);
  for (const item of tokenizer.added_tokens || []) {
    if (item?.special && Number.isInteger(vocab[item.content])) out.set(item.content, vocab[item.content]);
    if (item?.special && Number.isInteger(item.id)) out.set(item.content, item.id);
  }
  for (const token of Object.values(tokenizer.special_tokens || {})) {
    if (Number.isInteger(vocab[token])) out.set(token, vocab[token]);
  }
  return out;
}

function inspectExactRuntimeTokenizer(tokenizer = {}) {
  const vocab = exactVocab(tokenizer);
  const failures = [];
  if (!hasExactRuntimeTokenizer(tokenizer)) failures.push("exact_runtime_tokenizer_unavailable");
  if (Number(tokenizer.vocab_size || Object.keys(vocab).length || 0) !== 16000) failures.push("exact_tokenizer_vocab_size_not_16000");
  for (const token of ["<unk>", "<bos>", "<eos>"]) {
    if (!Number.isInteger(vocab[token])) failures.push(`${token}_missing`);
  }
  return {
    ok: failures.length === 0,
    failures,
    decode_status: failures.length === 0 ? "exact_runtime_tokenizer" : "exact_runtime_tokenizer_unavailable",
    exact_decode: failures.length === 0,
    exact_encode: failures.length === 0
  };
}

function encodeExactRuntimeText(text, tokenizer, options = {}) {
  const inspection = inspectExactRuntimeTokenizer(tokenizer);
  if (!inspection.ok) return { ok: false, input_ids: [], blocker: inspection.failures[0] };
  const vocab = exactVocab(tokenizer);
  const mergeRanks = buildMergeRanks(exactMerges(tokenizer));
  const special = specialTokenByContent(tokenizer);
  const unkId = Number.isInteger(vocab[tokenizer.unk_token || "<unk>"]) ? vocab[tokenizer.unk_token || "<unk>"] : 1;
  const maxTokens = Math.max(1, Number(options.maxTokens || options.contextLength || 256));
  const inputIds = [];
  if (options.addBos !== false && special.has("<bos>")) inputIds.push(special.get("<bos>"));
  for (const part of splitCjkAware(text)) {
    for (const piece of applyBpe(byteLevelEncode(part), mergeRanks)) {
      inputIds.push(Number.isInteger(vocab[piece]) ? vocab[piece] : unkId);
    }
  }
  return {
    ok: inputIds.length > 0,
    input_ids: inputIds.slice(-maxTokens),
    exact_encode: true,
    encode_status: "exact_runtime_tokenizer"
  };
}

function decodeExactRuntimeTokenIds(tokenIds, tokenizer, options = {}) {
  const inspection = inspectExactRuntimeTokenizer(tokenizer);
  if (!inspection.ok) return { ok: false, text: "", blocker: inspection.failures[0], exact_decode: false };
  const inverse = new Map(Object.entries(exactVocab(tokenizer)).map(([token, id]) => [Number(id), token]));
  const specialIds = new Set(specialTokenByContent(tokenizer).values());
  const pieces = [];
  let exact = true;
  const ids = Array.isArray(tokenIds) ? tokenIds.map(Number) : [];
  for (const id of ids) {
    if (!Number.isFinite(id)) continue;
    if (!options.keepSpecialTokens && specialIds.has(id)) continue;
    const piece = inverse.get(id);
    if (piece === undefined) {
      exact = false;
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
    debug_token_ids: options.debugTokenIds ? ids : []
  };
}

function q4SignedValue(nibble) {
  const value = Number(nibble) & 0x0f;
  return value >= 8 ? value - 16 : value;
}

function q4ValueAt(bytes, index, scale = 1) {
  const byte = bytes[Math.floor(index / 2)] || 0;
  const nibble = index % 2 === 0 ? byte & 0x0f : (byte >> 4) & 0x0f;
  return q4SignedValue(nibble) * scale;
}

function addInPlace(target, value) {
  for (let index = 0; index < target.length; index += 1) target[index] += value[index] || 0;
  return target;
}

class Q4Tensor {
  constructor(metadata, bytes) {
    this.metadata = metadata;
    this.name = metadata.name;
    this.shape = metadata.shape || [];
    this.scale = Number(metadata.scale ?? 1);
    this.bytes = bytes;
  }

  get rows() {
    return Number(this.shape[0] || 0);
  }

  get cols() {
    return Number(this.shape[1] || 1);
  }

  valueAt(index) {
    return q4ValueAt(this.bytes, index, this.scale);
  }

  dequantizeRow(row) {
    const output = new Float32Array(this.cols);
    const base = row * this.cols;
    for (let col = 0; col < this.cols; col += 1) output[col] = this.valueAt(base + col);
    return output;
  }
}

class Q4TensorStore {
  constructor(modelConfig, weights) {
    this.metadata = new Map((modelConfig.tensors || []).map((tensor) => [tensor.name, tensor]));
    this.weights = weights;
    this.cache = new Map();
  }

  tensor(name) {
    if (this.cache.has(name)) return this.cache.get(name);
    const metadata = this.metadata.get(name);
    if (!metadata) throw new Error(`tensor_missing:${name}`);
    const offset = Number(metadata.offset || 0);
    const bytes = Number(metadata.bytes || 0);
    if (offset < 0 || bytes <= 0 || offset + bytes > this.weights.byteLength) {
      throw new Error(`tensor_span_out_of_bounds:${name}`);
    }
    const tensor = new Q4Tensor(metadata, this.weights.subarray(offset, offset + bytes));
    this.cache.set(name, tensor);
    return tensor;
  }
}

function topCandidatesForLinear(input, weightTensor, count = 32) {
  const cols = weightTensor.cols;
  if (input.length < cols) throw new Error(`linear_input_too_small:${weightTensor.name}`);
  const candidates = [];
  for (let row = 0; row < weightTensor.rows; row += 1) {
    let sum = 0;
    const base = row * cols;
    for (let col = 0; col < cols; col += 1) {
      sum += q4ValueAt(weightTensor.bytes, base + col, weightTensor.scale) * input[col];
    }
    if (candidates.length < count) {
      candidates.push({ id: row, value: sum });
      candidates.sort((left, right) => right.value - left.value);
    } else if (sum > candidates[candidates.length - 1].value) {
      candidates[candidates.length - 1] = { id: row, value: sum };
      candidates.sort((left, right) => right.value - left.value);
    }
  }
  return candidates;
}

function summarizeManifest(assetManifest) {
  const assets = Array.isArray(assetManifest?.model_assets) ? assetManifest.model_assets : [];
  const tokenizerAssets = Array.isArray(assetManifest?.tokenizer_assets) ? assetManifest.tokenizer_assets : [];
  return {
    configPath: assets.find((item) => item.role === "model_config")?.path || "",
    quantizationPath: assets.find((item) => item.role === "quantization_manifest")?.path || "",
    checksumPath: assets.find((item) => item.role === "checksum_manifest")?.path || "",
    shardAssets: assets.filter((item) => item.role === "q4_shard"),
    tokenizerPath: tokenizerAssets.find((item) => item.role === "exact_runtime_tokenizer")?.path ||
      assetManifest?.model_asset_manifest?.tokenizer_manifest ||
      ""
  };
}

async function loadRuntimePackage() {
  const assetManifest = await fetchJson("another_brain/asset_manifest.json");
  const summary = summarizeManifest(assetManifest);
  const failures = [];
  if (assetManifest.model_assets_admitted !== true) failures.push("model_assets_not_admitted");
  if (assetManifest.backend_inference !== false) failures.push("backend_inference_not_allowed");
  if (assetManifest.external_llm_api !== false) failures.push("external_llm_not_allowed");
  if (assetManifest.doubao !== false) failures.push("doubao_not_allowed");
  if (assetManifest.hosted_vector_store !== false) failures.push("hosted_vector_store_not_allowed");
  if (assetManifest.quantization !== "q4") failures.push("asset_manifest_quantization_not_q4");
  if (!summary.configPath || !summary.quantizationPath || !summary.checksumPath || !summary.tokenizerPath) {
    failures.push("required_q4_metadata_missing");
  }
  if (summary.shardAssets.length === 0) failures.push("q4_shards_missing");
  if (failures.length) throw new Error(failures.join(","));
  const [modelConfig, quantizationManifest, tokenizer, checksums] = await Promise.all([
    fetchJson(summary.configPath),
    fetchJson(summary.quantizationPath),
    fetchJson(summary.tokenizerPath),
    fetchJson(summary.checksumPath)
  ]);
  if (quantizationManifest.quantization !== "q4") throw new Error("quantization_manifest_not_q4");
  const tokenizerInspection = inspectExactRuntimeTokenizer(tokenizer);
  if (!tokenizerInspection.ok) throw new Error(tokenizerInspection.failures[0] || "exact_runtime_tokenizer_unavailable");
  return { assetManifest, modelConfig, quantizationManifest, tokenizer, checksums, summary, tokenizerInspection };
}

async function runtimePackage() {
  if (!runtimePackagePromise) runtimePackagePromise = loadRuntimePackage();
  return runtimePackagePromise;
}

async function tensorStore(pkg) {
  if (tensorStorePromise) return tensorStorePromise;
  tensorStorePromise = (async () => {
    const shards = pkg.quantizationManifest.shards || pkg.summary.shardAssets;
    const totalBytes = shards.reduce((total, shard) => Math.max(total, Number(shard.offset || 0) + Number(shard.bytes || 0)), 0);
    if (totalBytes <= 0) throw new Error("q4_tensor_store_empty");
    if (totalBytes > 100_000_000) throw new Error("q4_tensor_store_over_budget");
    const weights = new Uint8Array(totalBytes);
    for (const shard of shards) {
      const bytes = await fetchBytes(shard.path);
      if (bytes.byteLength !== Number(shard.bytes || 0)) throw new Error(`shard_size_mismatch:${shard.path}`);
      const expected = String(shard.sha256 || "").toLowerCase();
      if (expected && crypto?.subtle?.digest) {
        const actual = await sha256Hex(bytes);
        if (actual !== expected) throw new Error(`shard_sha256_mismatch:${shard.path}`);
      }
      weights.set(bytes, Number(shard.offset || 0));
    }
    return new Q4TensorStore(pkg.modelConfig, weights);
  })();
  return tensorStorePromise;
}

function pickNextToken(candidates, tokenizer) {
  for (const candidate of candidates) {
    const decoded = decodeExactRuntimeTokenIds([candidate.id], tokenizer);
    if (decoded.ok && decoded.text.trim()) return { ...candidate, decoded };
  }
  const fallback = candidates[0] || { id: 0, value: 0 };
  return { ...fallback, decoded: decodeExactRuntimeTokenIds([fallback.id], tokenizer, { keepSpecialTokens: true }) };
}

export async function staticQ4Capability() {
  const pkg = await runtimePackage();
  return {
    ok: true,
    runtime_version: R28HOTFIX1_Q4_RUNTIME_VERSION,
    mode: "static_q4_experimental",
    manifest_loaded: true,
    q4_shard_count: (pkg.quantizationManifest.shards || []).length || pkg.summary.shardAssets.length,
    exact_runtime_tokenizer: pkg.tokenizerInspection.ok,
    tokenizer_decode_status: pkg.tokenizerInspection.decode_status,
    product_model: false,
    browser_admission: false,
    release_checkpoint_admission: false,
    backend_inference: false,
    "doubao": false,
    "external_llm_api": false,
    "hosted_vector_store": false
  };
}

export async function generateStaticQ4Draft(prompt, options = {}) {
  const started = nowMs();
  const pkg = await runtimePackage();
  const store = await tensorStore(pkg);
  const architecture = pkg.modelConfig.architecture || {};
  const maxTokens = Math.max(1, Math.min(Number(options.maxTokens || 4), 8));
  const contextLength = Math.max(1, Math.min(Number(options.contextLength || 64), Number(architecture.context_length || 256)));
  const encoded = encodeExactRuntimeText(prompt, pkg.tokenizer, { contextLength, maxTokens: contextLength });
  if (!encoded.ok || encoded.input_ids.length === 0) throw new Error(encoded.blocker || "tokenizer_encode_failed");
  const generatedTokenIds = [];
  const tokenTexts = [];
  let tokenId = encoded.input_ids[encoded.input_ids.length - 1] || 0;
  const tokenEmbedding = store.tensor("token_emb.weight");
  const posEmbedding = store.tensor("pos_emb.weight");
  const lmHead = store.tensor("lm_head.weight");
  for (let index = 0; index < maxTokens; index += 1) {
    if (nowMs() - started > Number(options.timeoutMs || 30_000)) throw new Error("generation_timeout");
    const position = Math.min(encoded.input_ids.length + index - 1, Number(architecture.context_length || 256) - 1);
    const hidden = addInPlace(tokenEmbedding.dequantizeRow(tokenId), posEmbedding.dequantizeRow(position));
    const picked = pickNextToken(topCandidatesForLinear(hidden, lmHead, 48), pkg.tokenizer);
    tokenId = picked.id;
    generatedTokenIds.push(tokenId);
    const piece = picked.decoded?.text || "";
    if (piece) {
      tokenTexts.push(piece);
      if (typeof options.onToken === "function") options.onToken(piece, tokenId);
    }
  }
  const decoded = decodeExactRuntimeTokenIds(generatedTokenIds, pkg.tokenizer);
  const text = decoded.text || tokenTexts.join("").replace(/\s+/g, " ").trim();
  return {
    draft: text || tokenTexts.join(""),
    tokens: tokenTexts,
    stats: {
      tokens_generated: generatedTokenIds.length,
      elapsed_ms: Math.max(0, Math.round(nowMs() - started)),
      runtime_mode: "static_q4_experimental",
      decoded_text_available: Boolean(text || tokenTexts.length),
      decode_status: decoded.decode_status || "exact_runtime_tokenizer",
      exact_decode: decoded.exact_decode === true,
      generated_token_ids: generatedTokenIds,
      quality_status: "quality_weak_q4_forward_smoke",
      q4_forward_smoke: true,
      q4_forward_ran: true,
      fallback_used: false,
      route_layer: "r28rout0_deferred_to_answer_surface_policy",
      router_input_available: false,
      router_deferred_to_generation_loop: true
    }
  };
}
