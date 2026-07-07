import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("asset manifest and runtime JS include cache-busting version", async () => {
  const chat = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url), "utf8");
  const manifest = JSON.parse(await readFile(new URL("../../web/another_brain/asset_manifest.json", import.meta.url), "utf8"));
  const runtimeMode = JSON.parse(await readFile(new URL("../../web/another_brain/runtime_mode.json", import.meta.url), "utf8"));
  const acceptedVersions = ["r28ux4-visible-preview-ui", "r28hotfix0-runtime-ui-activation", "r28hotfix1-route-loop-free-runtime", "r28hotfix2-nonblocking-selfcheck", "r28hotfix3-q4-asset-path-fix"];
  assert.ok(acceptedVersions.some((version) => chat.includes(`app.js?v=${version}`)));
  assert.ok(acceptedVersions.some((version) => app.includes(`browser_runtime.js?v=${version}`)));
  assert.ok(runtime.includes("invalidateStaleAssetCache"));
  assert.ok(acceptedVersions.includes(manifest.ui_version));
  assert.ok(acceptedVersions.includes(runtimeMode.ui_version));
});
