import { buildFallbackAnswer } from "../fallback_adapter.ts";
import { verifySha256 } from "../assets/checksum.ts";
import { inspectModelArchitecture } from "./model_architecture.ts";
import { matmulQ4Vector } from "./kernels.ts";
import { q4SignedValue, unpackQ4Nibbles } from "./q4_dequant.ts";
import { StaticQ4ForwardRuntime, runR28RT1RealForwardSmoke } from "./static_q4_runtime.ts";

export { attentionOneToken } from "./attention.ts";
export { decoderForwardOneToken, embeddingForToken } from "./decoder_forward.ts";
export { addInPlace, addVectors, applyGeluInPlace, argmax, gelu, linearQ4, linearQ4Rows, matmulQ4Vector } from "./kernels.ts";
export { layerNorm, layerNormFromStore } from "./layer_norm.ts";
export { inspectModelArchitecture } from "./model_architecture.ts";
export { mlpForward } from "./mlp.ts";
export { packQ4Nibbles, q4SignedValue, q4ValueAt, unpackQ4Nibbles } from "./q4_dequant.ts";
export { Q4Tensor, tensorNumel } from "./q4_tensor.ts";
export { Q4TensorStore, loadQ4TensorStore } from "./tensor_store.ts";
export {
  R28RT1_TOKENIZER_BLOCKER,
  StaticQ4ForwardRuntime,
  decodeTokenForSmoke,
  encodePromptForForwardSmoke,
  runGenerationSmoke,
  runR28RT1RealForwardSmoke
} from "./static_q4_runtime.ts";

export const R28RT0_REAL_INFERENCE_BLOCKER = "real_browser_inference_not_verified";
export const R28RT0_FORWARD_BLOCKER = "q4_model_forward_not_implemented";

export function isRelativeSameOriginAssetPath(path) {
  const value = String(path || "");
  if (!value || value.startsWith("/") || value.startsWith("//")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  if (value.split("/").some((part) => part === "..")) return false;
  if (value.includes("/artifacts/") || value.startsWith("artifacts/")) return false;
  return true;
}

function pathFromAssetManifest(assetManifest, role) {
  return (assetManifest.model_assets || []).find((item) => item.role === role)?.path;
}

async function fetchJson(fetcher, path, baseUrl) {
  const url = new URL(path, baseUrl);
  const response = await fetcher(url.href);
  if (!response.ok) throw new Error(`fetch_json_failed:${path}:${response.status}`);
  return response.json();
}

async function fetchBytes(fetcher, path, baseUrl) {
  const url = new URL(path, baseUrl);
  const response = await fetcher(url.href);
  if (!response.ok) throw new Error(`fetch_bytes_failed:${path}:${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

export function summarizeR28M1AssetManifest(assetManifest) {
  const modelAssets = assetManifest.model_assets || [];
  const shards = modelAssets.filter((item) => item.role === "q4_shard");
  const tokenizer = (assetManifest.tokenizer_assets || [])[0] || null;
  return {
    model_assets_admitted: assetManifest.model_assets_admitted === true,
    product_model_admission: assetManifest.product_model_admission === false,
    browser_admission: assetManifest.browser_admission === false,
    release_checkpoint_admission: assetManifest.release_checkpoint_admission === false,
    same_origin_only: assetManifest.same_origin_only === true,
    backend_inference: assetManifest.backend_inference === false,
    external_llm_api: assetManifest.external_llm_api === false,
    doubao: assetManifest.doubao === false,
    hosted_vector_store: assetManifest.hosted_vector_store === false,
    quantization: assetManifest.quantization,
    shard_count: shards.length,
    tokenizer_present: Boolean(tokenizer),
    config_path: pathFromAssetManifest(assetManifest, "model_config"),
    quantization_manifest_path: pathFromAssetManifest(assetManifest, "quantization_manifest"),
    checksum_manifest_path: pathFromAssetManifest(assetManifest, "checksum_manifest"),
    shard_paths: shards.map((item) => item.path),
    tokenizer_path: tokenizer?.path || ""
  };
}

export async function loadR28M1Q4RuntimePackage(options = {}) {
  const fetcher = options.fetcher || globalThis.fetch;
  if (typeof fetcher !== "function") throw new Error("fetch_unavailable");
  const baseUrl = options.baseUrl || "http://localhost/";
  const assetManifestPath = options.assetManifestPath || "another_brain/asset_manifest.json";
  const assetManifest = await fetchJson(fetcher, assetManifestPath, baseUrl);
  const summary = summarizeR28M1AssetManifest(assetManifest);
  const failures = [];

  for (const [key, expected] of Object.entries({
    model_assets_admitted: true,
    product_model_admission: true,
    browser_admission: true,
    release_checkpoint_admission: true,
    same_origin_only: true,
    backend_inference: true,
    external_llm_api: true,
    doubao: true,
    hosted_vector_store: true,
    tokenizer_present: true
  })) {
    if (summary[key] !== expected) failures.push(`asset_manifest_${key}_invalid`);
  }
  if (summary.quantization !== "q4") failures.push("asset_manifest_quantization_not_q4");
  for (const path of [summary.config_path, summary.quantization_manifest_path, summary.checksum_manifest_path, summary.tokenizer_path, ...summary.shard_paths]) {
    if (!isRelativeSameOriginAssetPath(path)) failures.push(`non_same_origin_path:${path}`);
  }
  if (failures.length > 0) throw new Error(failures.join(","));

  const [modelConfig, quantizationManifest, tokenizer, checksums] = await Promise.all([
    fetchJson(fetcher, summary.config_path, baseUrl),
    fetchJson(fetcher, summary.quantization_manifest_path, baseUrl),
    fetchJson(fetcher, summary.tokenizer_path, baseUrl),
    fetchJson(fetcher, summary.checksum_manifest_path, baseUrl)
  ]);

  if (quantizationManifest.quantization !== "q4") throw new Error("quantization_manifest_not_q4");
  if (quantizationManifest.same_origin_only !== true) throw new Error("quantization_manifest_not_same_origin");
  if (tokenizer.browser_inference_ready === true) throw new Error("tokenizer_must_not_claim_browser_inference_ready");

  return {
    ok: true,
    assetManifest,
    modelConfig,
    quantizationManifest,
    tokenizer,
    checksums,
    summary,
    architectureInspection: inspectModelArchitecture(modelConfig, quantizationManifest, tokenizer),
    browser_worker_can_load_manifest: true
  };
}

export async function verifyCommittedShardChecksums(runtimePackage, options = {}) {
  const fetcher = options.fetcher || globalThis.fetch;
  if (typeof fetcher !== "function") throw new Error("fetch_unavailable");
  const baseUrl = options.baseUrl || "http://localhost/";
  const checksumByPath = new Map((runtimePackage.checksums.files || []).map((item) => [item.path, item]));
  const failures = [];
  const checked = [];
  for (const shard of runtimePackage.quantizationManifest.shards || []) {
    const expected = checksumByPath.get(shard.path) || shard;
    const bytes = await fetchBytes(fetcher, shard.path, baseUrl);
    if (bytes.byteLength !== Number(shard.bytes || 0)) failures.push(`shard_size_mismatch:${shard.path}`);
    const verification = await verifySha256(bytes, expected.sha256);
    if (!verification.ok) failures.push(`shard_sha256_mismatch:${shard.path}`);
    checked.push({ path: shard.path, bytes: bytes.byteLength, sha256: verification.actual, ok: verification.ok });
  }
  return {
    ok: failures.length === 0,
    checked_shards: checked.length,
    failures
  };
}

export class StaticQ4ExperimentalRuntime extends StaticQ4ForwardRuntime {}

export async function runR28RT0MinimalInferenceSmoke(runtimePackage, options = {}) {
  try {
    const report = await runR28RT1RealForwardSmoke(runtimePackage, options);
    return {
      ok: true,
      real_inference_smoke_passed: report.real_inference_smoke_passed,
      output_tokens: report.generated_token_count || 0,
      blocker: report.real_inference_smoke_passed ? "" : R28RT0_REAL_INFERENCE_BLOCKER,
      fallback_still_works: true,
      prompt_results: report.prompt_results,
      non_claims: report.non_claims
    };
  } catch (error) {
    const prompts = options.prompts || ["你好"];
    return {
      ok: true,
      real_inference_smoke_passed: false,
      output_tokens: 0,
      blocker: error.message || R28RT0_REAL_INFERENCE_BLOCKER,
      fallback_still_works: true,
      prompt_results: prompts.map((prompt) => ({
        prompt,
        ok: false,
        output_tokens: 0,
        fallback_used: true,
        final_answer: buildFallbackAnswer(prompt, error.message || R28RT0_REAL_INFERENCE_BLOCKER).final_answer
      }))
    };
  }
}

export function runtimeCapabilitySummary(runtimePackage = null) {
  const architecture = runtimePackage?.architectureInspection || null;
  return {
    committed_model_manifest_exists: Boolean(runtimePackage?.assetManifest),
    tokenizer_exists: Boolean(runtimePackage?.tokenizer),
    browser_worker_can_load_manifest: Boolean(runtimePackage?.browser_worker_can_load_manifest),
    q4_unpack_path_exists: true,
    matmul_path_exists: true,
    generation_forward_path_exists: true,
    generation_forward_blocker: "",
    real_browser_inference_admitted: false,
    release_admission: false,
    architecture_ok: architecture?.ok === true,
    tokenizer_decode_ready: architecture?.tokenizer_browser_inference_ready === true,
    tokenizer_blocker: architecture?.warnings?.includes("runtime_tokenizer_not_browser_compatible_for_text_decode")
      ? "runtime_tokenizer_not_browser_compatible_for_text_decode"
      : ""
  };
}
