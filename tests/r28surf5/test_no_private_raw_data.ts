import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateSurfaceFragments } from "../../src/browser_runtime/router/surface_fragments.ts";

test("R28SURF5 does not use private raw data", () => {
  const profile = JSON.parse(readFileSync(new URL("../../data/training_registry/r28surf5_style_profile.json", import.meta.url), "utf8"));
  const fragments = validateSurfaceFragments();
  assert.equal(profile.private_raw_data_used, false);
  assert.equal(profile.source_policy.private_raw_data_saved, false);
  assert.equal(fragments.ok, true);
});
