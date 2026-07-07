import test from "node:test";
import assert from "node:assert/strict";
import { SURFACE_FRAGMENTS } from "../../src/browser_runtime/router/surface_fragments.ts";

test("surface fragments do not expose hidden prompts or private data", () => {
  const joined = Object.values(SURFACE_FRAGMENTS).flat().join("\n").toLowerCase();
  for (const marker of ["hidden prompt", "developer prompt", "chain-of-thought", "raw private", "secret", "api key", "password"]) {
    assert.equal(joined.includes(marker), false, marker);
  }
});
