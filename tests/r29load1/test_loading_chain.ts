import test from "node:test";
import assert from "node:assert/strict";
import {
  loadShardIntoWeights,
  resolveQ4DownloadTimeout
} from "../../web/another_brain_chat/q4_worker_runtime.js";
import { BrowserChatRuntime } from "../../web/another_brain_chat/browser_runtime.js";

test("cold q4 download budget leaves forward time inside the deep self-check window", () => {
  assert.equal(resolveQ4DownloadTimeout({ timeoutMs: 300_000 }), 285_000);
  assert.equal(resolveQ4DownloadTimeout({ timeoutMs: 360_000 }), 345_000);
  assert.equal(resolveQ4DownloadTimeout({ timeoutMs: 300_000, downloadTimeoutMs: 240_000 }), 240_000);
});

test("interrupted whole-shard stream resumes from the received byte with Range", async () => {
  const previousFetch = globalThis.fetch;
  const previousLocation = globalThis.location;
  const expectedBytes = 1_048_580;
  const calls = [];
  let readCount = 0;

  Object.defineProperty(globalThis, "location", {
    value: { href: "https://preview.example/another_brain_chat/", origin: "https://preview.example" },
    configurable: true
  });
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async (url, options = {}) => {
      calls.push({ url, options });
      if (calls.length === 1) {
        return {
          ok: true,
          status: 200,
          body: {
            getReader: () => ({
              read: async () => {
                readCount += 1;
                if (readCount === 1) {
                  return { done: false, value: new Uint8Array([1, 2, 3, 4]) };
                }
                throw new Error("stream_interrupted");
              }
            })
          }
        };
      }
      const remaining = new Uint8Array(expectedBytes - 4);
      return {
        ok: true,
        status: 206,
        arrayBuffer: async () => remaining.buffer
      };
    }
  });

  try {
    const weights = new Uint8Array(expectedBytes);
    const progress = [];
    const state = {
      startedAt: performance.now(),
      loadedBytes: 0,
      totalBytes: expectedBytes,
      lastEmitAt: 0,
      loadedShards: 0,
      downloadTimeoutMs: 285_000
    };
    await loadShardIntoWeights({
      shard: {
        path: "another_brain/model_assets/r28m1/shards/model-q4-test.bin",
        offset: 0,
        bytes: expectedBytes
      },
      weights,
      state,
      options: { onProgress: (event) => progress.push(event) }
    });

    assert.equal(calls.length, 2);
    assert.equal(calls[1].options.headers.Range, `bytes=4-${expectedBytes - 1}`);
    assert.equal(weights[0], 1);
    assert.equal(weights[3], 4);
    assert.equal(state.loadedBytes, expectedBytes);
    assert.equal(state.loadedShards, 1);
    assert.ok(progress.some((event) => event.download_timeout_ms === 285_000));
  } finally {
    if (previousFetch === undefined) delete globalThis.fetch;
    else Object.defineProperty(globalThis, "fetch", { value: previousFetch, configurable: true });
    if (previousLocation === undefined) delete globalThis.location;
    else Object.defineProperty(globalThis, "location", { value: previousLocation, configurable: true });
  }
});

test("download byte progress survives the self-check report adapter", () => {
  const runtime = new BrowserChatRuntime({
    mode: "static_q4_experimental",
    deliveryConfig: { model_mode: "static_q4_experimental" }
  });
  const report = runtime.buildSelfCheckProgress("checking_deep", "q4_model_download", performance.now(), {
    progress: 74,
    loaded_bytes: 13_000_000,
    total_bytes: 48_267_968,
    loaded_shards: 1,
    loaded_label: "13.0MB/48.3MB",
    transfer_bps: 208_919,
    download_timeout_ms: 285_000,
    q4_download_strategy: "stream_into_preallocated_tensor_store"
  });

  assert.equal(report.progress, 74);
  assert.equal(report.loaded_bytes, 13_000_000);
  assert.equal(report.loaded_label, "13.0MB/48.3MB");
  assert.equal(report.transfer_bps, 208_919);
  assert.equal(report.download_timeout_ms, 285_000);
});

test("open question returns a fast boundary answer while background q4 mount is active", async () => {
  const runtime = new BrowserChatRuntime({
    mode: "static_q4_experimental",
    deliveryConfig: {
      model_mode: "static_q4_experimental",
      delivery_mode: "demo_static",
      rag_mode: "static_profile_pack"
    }
  });
  runtime.capabilities.worker_available = true;
  runtime.worker = {};
  runtime.memoryRecords = [];
  runtime.activeQ4MountPromise = new Promise(() => {});

  const packet = await Promise.race([
    runtime.run("机器可能拥有意识吗？什么证据会让你改变看法？"),
    new Promise((_, reject) => setTimeout(() => reject(new Error("chat_waited_for_q4_mount")), 100))
  ]);

  assert.equal(packet.fallback_used, true);
  assert.equal(packet.fallback_reason, "q4_mount_in_progress");
  assert.equal(packet.runtime_stats.q4_attempted, false);
});
