import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import {
  loadR28M1Q4RuntimePackage,
  runR28RT1RealForwardSmoke,
  verifyCommittedShardChecksums
} from "../../src/browser_runtime/q4_runtime/index.ts";

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

test("committed R28M1 q4 assets produce a real next token id", { timeout: 120000 }, async () => {
  const runtimePackage = await loadR28M1Q4RuntimePackage({ fetcher: fileFetcher, baseUrl: "https://local.test/" });
  const checksum = await verifyCommittedShardChecksums(runtimePackage, { fetcher: fileFetcher, baseUrl: "https://local.test/" });
  assert.equal(checksum.ok, true, checksum.failures.join(","));
  const smoke = await runR28RT1RealForwardSmoke(runtimePackage, {
    fetcher: fileFetcher,
    baseUrl: "https://local.test/",
    prompts: ["你好"]
  });
  assert.equal(smoke.real_forward_passed, true, smoke.blocker || "");
  assert.equal(smoke.real_inference_smoke_passed, true, smoke.blocker || "");
  assert.ok(smoke.generated_token_count >= 1);
  assert.equal(smoke.prompt_results[0].backend_inference, false);
  assert.equal(smoke.prompt_results[0].external_api, false);
});
