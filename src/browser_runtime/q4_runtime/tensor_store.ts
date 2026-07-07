import { verifySha256 } from "../assets/checksum.ts";
import { toSameOriginAssetUrl } from "../assets/asset_path_normalizer.ts";
import { Q4Tensor } from "./q4_tensor.ts";

function metadataByName(config) {
  return new Map((config.tensors || []).map((tensor) => [tensor.name, tensor]));
}

async function fetchBytes(fetcher, path, baseUrl) {
  const response = await fetcher(toSameOriginAssetUrl(path, { origin: new URL(baseUrl).origin }).href);
  if (!response.ok) throw new Error(`fetch_bytes_failed:${path}:${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

export class Q4TensorStore {
  constructor(options = {}) {
    this.modelConfig = options.modelConfig;
    this.quantizationManifest = options.quantizationManifest;
    this.tensorMetadata = metadataByName(options.modelConfig || {});
    this.weights = options.weights;
    this.tensorCache = new Map();
    this.maxTensorCacheEntries = Number(options.maxTensorCacheEntries || 8);
  }

  getMetadata(name) {
    const metadata = this.tensorMetadata.get(name);
    if (!metadata) throw new Error(`tensor_missing:${name}`);
    return metadata;
  }

  getTensorBytes(name) {
    const metadata = this.getMetadata(name);
    const offset = Number(metadata.offset || 0);
    const bytes = Number(metadata.bytes || 0);
    if (offset < 0 || bytes <= 0 || offset + bytes > this.weights.byteLength) {
      throw new Error(`tensor_span_out_of_bounds:${name}`);
    }
    return this.weights.subarray(offset, offset + bytes);
  }

  getTensor(name) {
    if (this.tensorCache.has(name)) return this.tensorCache.get(name);
    const metadata = this.getMetadata(name);
    const tensor = new Q4Tensor(metadata, this.getTensorBytes(name));
    this.tensorCache.set(name, tensor);
    if (this.tensorCache.size > this.maxTensorCacheEntries) {
      const [first] = this.tensorCache.keys();
      this.tensorCache.delete(first);
    }
    return tensor;
  }

  dequantize(name) {
    return this.getTensor(name).dequantize();
  }
}

export async function loadQ4TensorStore(runtimePackage, options = {}) {
  const fetcher = options.fetcher || globalThis.fetch;
  if (typeof fetcher !== "function") throw new Error("fetch_unavailable");
  const baseUrl = options.baseUrl || "http://localhost/";
  const shards = runtimePackage.quantizationManifest.shards || [];
  const totalBytes = shards.reduce((total, shard) => Math.max(total, Number(shard.offset || 0) + Number(shard.bytes || 0)), 0);
  if (totalBytes <= 0) throw new Error("q4_shards_missing");
  if (totalBytes > Number(options.maxTotalBytes || 100_000_000)) throw new Error("q4_tensor_store_over_budget");
  const weights = new Uint8Array(totalBytes);
  const failures = [];
  for (const shard of shards) {
    const bytes = await fetchBytes(fetcher, shard.path, baseUrl);
    if (bytes.byteLength !== Number(shard.bytes || 0)) failures.push(`shard_size_mismatch:${shard.path}`);
    const verification = await verifySha256(bytes, shard.sha256);
    if (!verification.ok) failures.push(`shard_sha256_mismatch:${shard.path}`);
    weights.set(bytes, Number(shard.offset || 0));
  }
  if (failures.length > 0) throw new Error(failures.join(","));
  return new Q4TensorStore({
    modelConfig: runtimePackage.modelConfig,
    quantizationManifest: runtimePackage.quantizationManifest,
    weights,
    maxTensorCacheEntries: options.maxTensorCacheEntries
  });
}
