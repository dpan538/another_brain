import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("q4 runtime activation markers are the default when assets are available", async () => {
  const runtimeMode = JSON.parse(await readFile(new URL("../../web/another_brain/runtime_mode.json", import.meta.url), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("../../web/another_brain/asset_manifest.json", import.meta.url), "utf8"));
  const runtime = await readFile(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url), "utf8");
  const worker = await readFile(new URL("../../web/another_brain_chat/runtime_worker.js", import.meta.url), "utf8");
  assert.equal(runtimeMode.model_mode, "static_q4_experimental");
  assert.ok(["r28hotfix2-nonblocking-selfcheck", "r28hotfix3-q4-asset-path-fix"].includes(runtimeMode.ui_version));
  assert.ok(["r28hotfix2-nonblocking-selfcheck", "r28hotfix3-q4-asset-path-fix"].includes(manifest.ui_version));
  assert.ok(runtime.includes("R28HOTFIX2 q4 path smoke") || runtime.includes("R28HOTFIX3 q4 path smoke"));
  assert.ok(worker.includes("generateStaticQ4Draft"));
});
