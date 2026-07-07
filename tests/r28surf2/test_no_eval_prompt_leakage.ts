import test from "node:test";
import assert from "node:assert/strict";
import { validateR28Surf2SurfaceFragments, R28SURF2_SURFACE_FRAGMENTS } from "../../src/browser_runtime/router/r28surf2_surface_fragments.ts";

test("SURF2 surfaces do not leak eval prompt or hidden-prompt markers", async () => {
  const validation = validateR28Surf2SurfaceFragments();
  assert.equal(validation.ok, true);
  assert.deepEqual(validation.forbidden_hits, []);

  const renderedFragments = Object.values(R28SURF2_SURFACE_FRAGMENTS).flat().join("\n");
  assert.doesNotMatch(renderedFragments, /eval prompt|hidden prompt|chain-of-thought|developer prompt/i);
});
