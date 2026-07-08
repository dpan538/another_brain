import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function readWeb(path) {
  return readFile(new URL(`../../web/${path}`, import.meta.url), "utf8");
}

async function readScript(path) {
  return readFile(new URL(`../../scripts/${path}`, import.meta.url), "utf8");
}

test("P0D cache version is wired through entrypoints and runtime truth files", async () => {
  const html = await readWeb("another_brain_chat/index.html");
  const app = await readWeb("another_brain_chat/app.js");
  const runtime = await readWeb("another_brain_chat/browser_runtime.js");
  const worker = await readWeb("another_brain_chat/runtime_worker.js");
  const selfCheck = await readWeb("another_brain_chat/self_check_worker.js");
  const q4 = await readWeb("another_brain_chat/q4_worker_runtime.js");
  const runtimeMode = JSON.parse(await readWeb("another_brain/runtime_mode.json"));
  const manifest = JSON.parse(await readWeb("another_brain/asset_manifest.json"));

  for (const source of [html, app, runtime, worker, selfCheck, q4]) {
    assert.ok(source.includes("r28p0d-browser-compat-no-fallback-choice"));
  }
  assert.equal(runtimeMode.ui_version, "r28p0d-browser-compat-no-fallback-choice");
  assert.equal(runtimeMode.asset_cache_version, "r28p0d-browser-compat-no-fallback-choice");
  assert.equal(runtimeMode.ui_build_marker, "R28P0D");
  assert.equal(manifest.ui_version, "r28p0d-browser-compat-no-fallback-choice");
  assert.equal(manifest.ui_build_marker, "R28P0D");
});

test("P0D records cold-start metrics without exposing hidden reasoning", async () => {
  const app = await readWeb("another_brain_chat/app.js");
  assert.ok(app.includes("globalThis.__anotherBrainBootMetrics"));
  assert.ok(app.includes("chat_interactive_ms"));
  assert.ok(app.includes("quick_check_ms"));
  assert.ok(app.includes("q4_ready_ms"));
  assert.ok(app.includes("q4_background"));
  assert.ok(!app.includes("chain of thought"));
  assert.ok(!app.includes("hidden prompt"));
});

test("P0D keeps q4 mount as the default background path on mobile and slow connections", async () => {
  const app = await readWeb("another_brain_chat/app.js");
  assert.ok(app.includes("function shouldMountQ4InBackground"));
  assert.ok(app.includes("q4_status = \"background_mount\""));
  assert.ok(!app.includes("mobile_q4_warmup_deferred"));
  assert.ok(!app.includes("lightweight_ready"));
  assert.ok(!app.includes("lightweight_until_q4_ready"));
});

test("P0C cold-start matrix covers desktop, mobile, fast, and 3G profiles", async () => {
  const script = await readScript("r28p0c_coldstart_matrix.mjs");
  for (const marker of [
    "desktop_fast_cold",
    "desktop_3g_cold",
    "mobile_fast_cold",
    "mobile_3g_cold",
    "Network.emulateNetworkConditions",
    "Emulation.setDeviceMetricsOverride",
    "Emulation.setCPUThrottlingRate",
    "artifacts/r28p0c/reports/coldstart_matrix.json"
  ]) {
    assert.ok(script.includes(marker), marker);
  }
});
