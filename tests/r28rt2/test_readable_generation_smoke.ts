import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import {
  loadR28M1Q4RuntimePackage,
  runR28RT2ReadableGenerationSmoke,
  verifyCommittedShardChecksums
} from "../../src/browser_runtime/q4_runtime/index.ts";
import { handleRuntimeWorkerMessage } from "../../src/browser_runtime/runtime_worker.ts";

function arrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function fileFetcher(url) {
  const path = new URL(url).pathname.replace(/^\/+/, "");
  const file = join("web", path);
  const bytes = await readFile(file).catch(() => null);
  if (!bytes) return { ok: false, status: 404, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(bytes.toString("utf8")),
    arrayBuffer: async () => arrayBuffer(bytes),
    headers: { get: () => extname(file) === ".json" ? "application/json" : "application/octet-stream" }
  };
}

test("committed R28M1 q4 assets produce readable RT2 text", { timeout: 180000 }, async () => {
  const runtimePackage = await loadR28M1Q4RuntimePackage({ fetcher: fileFetcher, baseUrl: "https://local.test/" });
  const checksum = await verifyCommittedShardChecksums(runtimePackage, { fetcher: fileFetcher, baseUrl: "https://local.test/" });
  assert.equal(checksum.ok, true, checksum.failures.join(","));
  const smoke = await runR28RT2ReadableGenerationSmoke(runtimePackage, {
    fetcher: fileFetcher,
    baseUrl: "https://local.test/",
    prompts: ["你好"],
    maxTokens: 8
  });
  assert.equal(smoke.real_forward_passed, true, smoke.blocker || "");
  assert.equal(smoke.readable_generation_passed, true, smoke.blocker || "");
  assert.ok(smoke.generated_token_count >= 4);
  assert.equal(smoke.decoded_text_available, true);
  assert.equal(smoke.prompt_results[0].decoded_text.includes("token_id:"), false);
  assert.equal(smoke.prompt_results[0].backend_inference, false);
  assert.equal(smoke.prompt_results[0].external_api, false);
});

test("runtime worker returns readable text and debug token ids stay in stats", { timeout: 180000 }, async () => {
  const runtimePackage = await loadR28M1Q4RuntimePackage({ fetcher: fileFetcher, baseUrl: "https://local.test/" });
  const events = [];
  const result = await handleRuntimeWorkerMessage(
    {
      type: "generate",
      prompt: "请用中文简短回答：你是谁？",
      mode: "static_q4_experimental",
      runtimePackage,
      fetcher: fileFetcher,
      baseUrl: "https://local.test/",
      maxTokens: 8,
      contextLength: 16,
      timeoutMs: 120000
    },
    { postMessage: (event) => events.push(event) }
  );
  assert.equal(result.type, "final");
  assert.ok(result.tokens.length >= 4);
  assert.ok(String(result.draft || "").trim().length > 0);
  assert.equal(String(result.draft).includes("token_id:"), false);
  assert.equal(result.stats.decode_status, "lossy_runtime_display_codec");
  assert.ok(result.stats.generated_token_ids.length >= 4);
  assert.ok(events.some((event) => event.type === "token"));
});
