import test from "node:test";
import assert from "node:assert/strict";
import { composeNaturalSurface } from "../../src/browser_runtime/router/natural_surfaces.ts";
import { pickDeterministicVariant } from "../../src/browser_runtime/router/surface_variation.ts";

test("surface variation is deterministic by input hash", () => {
  const first = composeNaturalSurface({ intent: "identity_who_are_you", input: "你是谁" });
  const second = composeNaturalSurface({ intent: "identity_who_are_you", input: "你是谁" });
  assert.deepEqual(second, first);
  const variantA = pickDeterministicVariant(["a", "b", "c"], "same input", "salt");
  const variantB = pickDeterministicVariant(["a", "b", "c"], "same input", "salt");
  assert.deepEqual(variantB, variantA);
});
