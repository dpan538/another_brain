import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { R28SURF2_SURFACE_FRAGMENTS } from "../../src/browser_runtime/router/r28surf2_surface_fragments.ts";

test("SURF2 inventory and surfaces do not use private raw data", async () => {
  const summary = JSON.parse(await readFile(new URL("../../data/training_registry/r28surf2_anchor_surface_summary.json", import.meta.url), "utf8"));
  assert.equal(summary.private_raw_data_used, false);
  assert.equal(summary.source_policy.root_docx_pdf_parsed, false);
  assert.equal(summary.source_policy.data_public_ingestion_parsed, false);

  const renderedFragments = Object.values(R28SURF2_SURFACE_FRAGMENTS).flat().join("\n");
  assert.doesNotMatch(renderedFragments, /private_sources|raw private|data\/public_ingestion|\.docx|\.pdf/i);
});
