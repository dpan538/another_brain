import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("UX6 keeps static-only non-product boundaries visible", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  const runtimeMode = await readFile(new URL("../../web/another_brain/runtime_mode.json", import.meta.url), "utf8");
  const combined = [html, app, runtimeMode].join("\n");

  assert.ok(combined.includes("not product"));
  assert.ok(combined.includes("No backend inference"));
  assert.ok(combined.includes("backend_inference: false") || combined.includes('"backend_inference": false'));
  assert.ok(combined.includes("external_llm_api: false") || combined.includes('"external_llm_api": false'));
  assert.ok(combined.includes("product_model: false") || combined.includes('"product_model": false'));
  assert.ok(combined.includes("browser_admission: false") || combined.includes('"browser_admission": false'));
  assert.ok(combined.includes("release_checkpoint: false") || combined.includes('"release_checkpoint": false'));
  assert.equal(combined.includes("Doubao"), false);
  assert.equal(combined.includes("hosted vector store"), false);
});
