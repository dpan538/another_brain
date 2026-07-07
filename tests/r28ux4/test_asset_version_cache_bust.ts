import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("asset manifest and runtime JS include cache-busting version", async () => {
  const chat = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url), "utf8");
  const manifest = JSON.parse(await readFile(new URL("../../web/another_brain/asset_manifest.json", import.meta.url), "utf8"));
  const runtimeMode = JSON.parse(await readFile(new URL("../../web/another_brain/runtime_mode.json", import.meta.url), "utf8"));
  assert.ok(chat.includes("app.js?v=r28ux4-visible-preview-ui"));
  assert.ok(app.includes("browser_runtime.js?v=r28ux4-visible-preview-ui"));
  assert.ok(runtime.includes("invalidateStaleAssetCache"));
  assert.equal(manifest.ui_version, "r28ux4-visible-preview-ui");
  assert.equal(runtimeMode.ui_version, "r28ux4-visible-preview-ui");
});
