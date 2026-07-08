import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("browser self-check does not probe model assets relative to the chat route", async () => {
  const runtime = await readFile(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url), "utf8");
  assert.ok(runtime.includes("sameOriginAssetUrl"));
  assert.ok(runtime.includes("normalizeBrowserAssetPath"));
  assert.equal(runtime.includes("new URL(`../${path}`"), false);
  assert.equal(runtime.includes("fetchJsonSameOrigin(`../${quantizationPath}`"), false);
  assert.equal(runtime.includes("fetchJsonSameOrigin(`../${tokenizerPath}`"), false);
});
