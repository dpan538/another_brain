import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGenerationPolicy, runGenerationLoop, SyntheticTinyRuntime } from "../../src/browser_runtime/generation_loop.ts";

test("GEN0 policy defaults to greedy bounded generation", () => {
  const policy = normalizeGenerationPolicy({});
  assert.equal(policy.decoding, "greedy");
  assert.equal(policy.max_new_tokens, 16);
  assert.equal(policy.max_token_cap, 64);
  assert.equal(policy.repetition_guard, true);
  assert.equal(policy.empty_output_fallback, true);
});

test("generation loop returns policy stats without backend fallback", async () => {
  const generation = await runGenerationLoop(new SyntheticTinyRuntime(), "hello", { maxTokens: 5 });
  assert.equal(generation.generation_policy.decoding, "greedy");
  assert.equal(generation.tokens_generated, 5);
  assert.equal(generation.fallback_used, false);
  assert.equal(generation.needs_fallback, false);
  assert.equal(generation.runtime_mode, "synthetic_tiny");
});
