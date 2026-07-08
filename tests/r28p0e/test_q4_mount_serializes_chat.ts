import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function readWeb(path) {
  return readFile(new URL(`../../web/${path}`, import.meta.url), "utf8");
}

test("open chat generation waits for q4 mount before using the shared runtime worker", async () => {
  const runtime = await readWeb("another_brain_chat/browser_runtime.js");

  assert.match(runtime, /async waitForQ4MountBeforeDraft/);
  assert.match(runtime, /this\.activeQ4MountPromise \|\| this\.mountQ4WithRetry/);
  assert.match(runtime, /setStatus\("waiting_q4_mount"\)/);
  assert.match(runtime, /throw new Error\(reason\)/);
  assert.match(runtime, /await this\.waitForQ4MountBeforeDraft\(\{ onStatus: setStatus \}\);\s+setStatus\("drafting"\)/);
});

test("P0E cache-bust version is wired through entrypoints and workers", async () => {
  const version = "r28p0e-real-browser-q4-forward";
  const html = await readWeb("another_brain_chat/index.html");
  const app = await readWeb("another_brain_chat/app.js");
  const runtime = await readWeb("another_brain_chat/browser_runtime.js");
  const runtimeWorker = await readWeb("another_brain_chat/runtime_worker.js");
  const selfCheckWorker = await readWeb("another_brain_chat/self_check_worker.js");
  const q4 = await readWeb("another_brain_chat/q4_worker_runtime.js");
  const runtimeMode = JSON.parse(await readWeb("another_brain/runtime_mode.json"));
  const manifest = JSON.parse(await readWeb("another_brain/asset_manifest.json"));

  for (const source of [html, app, runtime, runtimeWorker, selfCheckWorker, q4]) {
    assert.match(source, new RegExp(version), source.slice(0, 60));
  }
  assert.equal(runtimeMode.ui_version, version);
  assert.equal(runtimeMode.asset_cache_version, version);
  assert.equal(runtimeMode.ui_build_marker, "R28P0E");
  assert.equal(manifest.ui_version, version);
  assert.equal(manifest.ui_build_marker, "R28P0E");
});
