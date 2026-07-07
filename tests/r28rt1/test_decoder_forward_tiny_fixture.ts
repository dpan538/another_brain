import test from "node:test";
import assert from "node:assert/strict";
import { decoderForwardOneToken } from "../../src/browser_runtime/q4_runtime/decoder_forward.ts";
import { inspectModelArchitecture } from "../../src/browser_runtime/q4_runtime/model_architecture.ts";
import { StaticQ4ForwardRuntime, runGenerationSmoke } from "../../src/browser_runtime/q4_runtime/static_q4_runtime.ts";
import { buildTinyDecoderFixture } from "./fixture_helpers.ts";

test("tiny generated-at-test-time fixture produces deterministic next token", async () => {
  const fixture = buildTinyDecoderFixture();
  const inspected = inspectModelArchitecture(fixture.modelConfig, fixture.quantizationManifest, fixture.tokenizer);
  assert.equal(inspected.ok, true, inspected.failures.join(","));
  const forward = decoderForwardOneToken(fixture.store, inspected.architecture, 0, { position: 0 });
  assert.equal(forward.next_token_id, 1);
  assert.equal(forward.logits.length, 4);
});

test("static q4 runtime uses real forward path for generated fixture", async () => {
  const fixture = buildTinyDecoderFixture();
  const runtime = new StaticQ4ForwardRuntime({
    runtimePackage: fixture.runtimePackage,
    store: fixture.store
  });
  await runtime.load();
  const generation = await runGenerationSmoke(runtime, "hello", { maxTokens: 1, timeoutMs: 1000 });
  assert.equal(generation.tokens.length, 1);
  assert.ok(generation.tokens[0].length > 0);
  assert.equal(generation.tokens[0].includes("token_id:"), false);
  assert.equal(generation.decode_status, "lossy_runtime_display_codec");
});
