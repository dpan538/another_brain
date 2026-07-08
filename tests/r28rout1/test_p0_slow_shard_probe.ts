import test from "node:test";
import assert from "node:assert/strict";
import { BrowserChatRuntime } from "../../web/another_brain_chat/browser_runtime.js";

const originalFetch = globalThis.fetch;
const originalLocation = globalThis.location;

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function shardResponse(path) {
  return new Response(new Uint8Array([1]), {
    status: 206,
    headers: {
      "content-length": "1",
      "content-range": `bytes 0-0/${path.endsWith("00005.bin") ? 270336 : 11_000_000}`
    }
  });
}

test("P0 self-check does not misclassify slow production shard probes as missing assets", async () => {
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { href: "https://preview.example/another_brain_chat/?v=test", origin: "https://preview.example" }
  });

  const shardPaths = [1, 2, 3, 4, 5].map((index) => `another_brain/model_assets/r28m1/shards/model-q4-${String(index).padStart(5, "0")}.bin`);
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.endsWith("/another_brain/asset_manifest.json")) {
      return jsonResponse({
        shard_count: 5,
        tokenizer_decode_status: "exact_runtime_tokenizer",
        model_asset_manifest: {
          quantization_manifest: "another_brain/model_assets/r28m1/quantization.manifest.json",
          tokenizer_manifest: "another_brain/model_assets/r28m1/tokenizer/runtime_tokenizer.json"
        },
        model_assets: shardPaths.map((path, index) => ({
          role: "q4_shard",
          path,
          bytes: index === 4 ? 270336 : 11_000_000
        })),
        total_model_asset_bytes: 44_270_336
      });
    }
    if (href.endsWith("/another_brain/model_assets/r28m1/quantization.manifest.json")) {
      return jsonResponse({ quantization: "q4", shard_count: 5 });
    }
    if (href.endsWith("/another_brain/model_assets/r28m1/tokenizer/runtime_tokenizer.json")) {
      return jsonResponse({ exact_runtime_tokenizer: true, runtime_compatible: true });
    }
    if (href.includes("/another_brain/model_assets/r28m1/shards/model-q4-")) {
      assert.equal(options.method, "GET");
      assert.equal(options.headers?.Range, "bytes=0-0");
      await new Promise((resolve) => setTimeout(resolve, 2500));
      return shardResponse(href);
    }
    throw new Error(`unexpected_fetch:${href}`);
  };

  try {
    const runtime = new BrowserChatRuntime({
      mode: "static_q4_experimental",
      deliveryConfig: { model_mode: "static_q4_experimental", shard_count: 5 }
    });
    const report = await runtime.quickSelfCheckModelPath({ jsonTimeoutMs: 500, shardTimeoutMs: 5000 });
    assert.equal(report.assets.shards_verified, true);
    assert.equal(report.assets.failing_shard_paths.length, 0);
    assert.equal(report.q4_forward.status, "skipped");
    assert.equal(report.q4_forward.runtime_mode, "static_q4_experimental");
    assert.equal(report.blockers.includes("q4_forward_skipped_quick_check"), true);
    assert.equal(report.blockers.some((item) => item.includes("asset_probe_failed")), false);
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "location", { configurable: true, value: originalLocation });
  }
});
