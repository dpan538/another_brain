import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("chat shell exposes asset progress, cache, verification, and offline statuses", async () => {
  const html = await readFile("web/another_brain_chat/index.html", "utf8");
  const app = await readFile("web/another_brain_chat/app.js", "utf8");
  const runtime = await readFile("web/another_brain_chat/browser_runtime.js", "utf8");

  for (const id of [
    "asset-cache-status",
    "asset-progress-status",
    "asset-verification-status",
    "offline-status"
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
    assert.match(app, new RegExp(`#${id}`));
  }

  assert.match(app, /renderAssetStatus/);
  assert.match(runtime, /cache_storage_available/);
  assert.match(runtime, /offline_static_cache_supported/);
  assert.match(runtime, /no_model_assets/);
});
