import test from "node:test";
import assert from "node:assert/strict";
import { validateSurfaceFragments, SURFACE_FRAGMENTS } from "../../src/browser_runtime/router/surface_fragments.ts";

test("R28SURF5 surface fragments do not contain eval or hidden reasoning markers", () => {
  const validation = validateSurfaceFragments();
  const rendered = Object.values(SURFACE_FRAGMENTS).flat().join("\n");
  assert.equal(validation.ok, true);
  assert.doesNotMatch(rendered, /eval prompt|question_pack_001|rows 51-100|chain-of-thought|hidden prompt|raw private|api key|password/i);
});
