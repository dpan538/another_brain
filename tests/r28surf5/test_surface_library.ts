import test from "node:test";
import assert from "node:assert/strict";
import { validateSurfaceFragments } from "../../src/browser_runtime/router/surface_fragments.ts";
import { R28SURF5_SURFACE_CATEGORIES } from "../../src/browser_runtime/router/surface_length_policy.ts";
import { validateSurfaceLibrary } from "../../src/browser_runtime/router/surface_library.ts";

test("R28SURF5 exposes the required bounded surface categories", () => {
  const library = validateSurfaceLibrary();
  const fragments = validateSurfaceFragments();
  assert.equal(library.ok, true);
  assert.deepEqual(library.categories, [...R28SURF5_SURFACE_CATEGORIES]);
  assert.equal(library.answer_bank, false);
  assert.equal(library.broad_answer_bank, false);
  assert.equal(fragments.ok, true);
  assert.ok(fragments.fragment_count >= 50);
  assert.ok(fragments.fragment_count <= 80);
});
