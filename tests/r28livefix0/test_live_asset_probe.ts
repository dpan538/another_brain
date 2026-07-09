import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { liveProbeSameOriginAsset } from "../../src/browser_runtime/assets/live_asset_probe.ts";

function response(body, init = {}) {
  return new Response(body, init);
}

test("live asset probe accepts Range 206 with body bytes and no content-length", async () => {
  const calls = [];
  const result = await liveProbeSameOriginAsset("another_brain/model_assets/r28m1/shards/model-q4-00001.bin", {
    origin: "https://preview.example",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      assert.equal(options.method, "GET");
      assert.equal(options.headers.Range, "bytes=0-15");
      return response(new Uint8Array([1, 2, 3, 4]), { status: 206 });
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 206);
  assert.equal(result.bytes_read, 4);
  assert.equal(result.content_length_header, "");
  assert.equal(result.method, "GET_RANGE");
  assert.equal(calls.length, 1);
});

test("live asset probe accepts 200 Range fallback when content-length is zero but body bytes exist", async () => {
  const result = await liveProbeSameOriginAsset("/another_brain/model_assets/r28m1/shards/model-q4-00002.bin", {
    origin: "https://preview.example",
    fetchImpl: async () => response(new Uint8Array([7, 8]), { status: 200, headers: { "content-length": "0" } })
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.bytes_read, 2);
  assert.equal(result.content_length_header, "0");
  assert.equal(result.method, "GET_RANGE_AS_200");
});

test("live asset probe reads one stream chunk and cancels instead of full-buffering a shard", async () => {
  let readCount = 0;
  let cancelReason = "";
  const result = await liveProbeSameOriginAsset("/another_brain/model_assets/r28m1/shards/model-q4-00003.bin", {
    origin: "https://preview.example",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "" },
      body: {
        getReader: () => ({
          read: async () => {
            readCount += 1;
            return { done: false, value: new Uint8Array([1, 2, 3, 4, 5, 6]) };
          },
          cancel: async (reason) => {
            cancelReason = String(reason || "");
          }
        })
      }
    })
  });
  assert.equal(result.ok, true);
  assert.equal(result.bytes_read, 6);
  assert.equal(readCount, 1);
  assert.equal(cancelReason, "asset_probe_byte_budget_met");
});

test("live asset probe source does not use HEAD as proof", async () => {
  const source = await readFile(new URL("../../src/browser_runtime/assets/live_asset_probe.ts", import.meta.url), "utf8");
  assert.equal(source.includes('method: "HEAD"'), false);
  assert.equal(source.includes("arrayBuffer()"), false);
  assert.ok(source.includes('reader.cancel("asset_probe_byte_budget_met")'));
  assert.ok(source.includes("bytes_read"));
  assert.ok(source.includes("content_length_header"));
});
