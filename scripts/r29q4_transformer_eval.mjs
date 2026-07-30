#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { webcrypto } from "node:crypto";

const root = resolve(new URL("..", import.meta.url).pathname);
const webRoot = resolve(root, "web");

Object.defineProperty(globalThis, "location", {
  configurable: true,
  value: { href: "https://local.another-brain/another_brain_chat/index.html", origin: "https://local.another-brain" }
});
if (!globalThis.crypto) Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });

globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  if (url.origin !== globalThis.location.origin || !url.pathname.startsWith("/another_brain/")) {
    return new Response("not found", { status: 404 });
  }
  const path = resolve(webRoot, `.${url.pathname}`);
  if (!path.startsWith(`${webRoot}/`) || relative(webRoot, path).startsWith("..")) return new Response("forbidden", { status: 403 });
  try {
    const bytes = await readFile(path);
    return new Response(bytes, { status: 200, headers: { "content-length": String(bytes.byteLength) } });
  } catch {
    return new Response("not found", { status: 404 });
  }
};

const { generateStaticQ4Draft } = await import("../web/another_brain_chat/q4_worker_runtime.js");
const generation = await generateStaticQ4Draft("请解释相关性和因果性。", {
  forwardMode: "transformer_single_token",
  generationKind: "transformer_eval",
  maxTokens: 1,
  contextLength: 32,
  timeoutMs: 120_000,
  downloadTimeoutMs: 120_000
});
const stats = generation.stats || {};
const transformer = stats.transformer_evaluation || {};
if (stats.transformer_single_token_forward !== true) throw new Error("transformer_single_token_not_reported");
if (transformer.transformer_blocks_executed !== 7) throw new Error(`unexpected_transformer_block_count:${transformer.transformer_blocks_executed}`);
if (transformer.context_attention_supported !== false || transformer.context_attention_tokens !== 1) {
  throw new Error("contextual_attention_claim_mismatch");
}
console.log(JSON.stringify({
  evaluation: "r29q4_transformer_single_token",
  elapsed_ms: stats.elapsed_ms,
  generated_token_ids: stats.generated_token_ids,
  transformer_blocks_executed: transformer.transformer_blocks_executed,
  attention_mode: transformer.attention_mode,
  context_attention_tokens: transformer.context_attention_tokens,
  context_attention_supported: transformer.context_attention_supported,
  quality_status: stats.quality_status,
  draft_available: Boolean(generation.draft)
}, null, 2));
