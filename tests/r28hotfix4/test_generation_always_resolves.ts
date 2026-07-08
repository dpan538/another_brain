import test from "node:test";
import assert from "node:assert/strict";
import { buildGenerationResult, generationAlwaysResolves } from "../../src/browser_runtime/generation/generation_result.ts";

test("generation result schema requires terminal status", () => {
  const result = buildGenerationResult({
    status: "timeout",
    q4_attempted: true,
    generation_started: true,
    tokens_generated: 0,
    fallback_reason: "q4_generation_timeout"
  });
  assert.equal(result.generation_status, "timeout");
  assert.equal(result.q4_attempted, true);
  assert.equal(generationAlwaysResolves(result), true);
});

test("non-terminal pending is rejected", () => {
  assert.equal(generationAlwaysResolves({ generation_status: "pending" }), false);
});
