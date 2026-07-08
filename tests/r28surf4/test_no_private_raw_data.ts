import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { R28SURF4_NATURAL_SURFACE_VARIANTS } from "../../src/browser_runtime/router/natural_surfaces.ts";

test("SURF4 surfaces and profile do not use private raw data", async () => {
  const profile = JSON.parse(await readFile(new URL("../../data/training_registry/r28surf4_style_profile.json", import.meta.url), "utf8"));
  assert.equal(profile.private_raw_data_used, false);
  assert.equal(profile.source_policy.data_public_ingestion_parsed, false);
  const joined = Object.values(R28SURF4_NATURAL_SURFACE_VARIANTS).flat().join("\n").toLowerCase();
  for (const marker of ["raw private", "secret", "api key", "password"]) {
    assert.ok(!joined.includes(marker), marker);
  }
});
