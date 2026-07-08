import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function readWeb(path) {
  return readFile(new URL(`../../web/${path}`, import.meta.url), "utf8");
}

async function readScript(path) {
  return readFile(new URL(`../../scripts/${path}`, import.meta.url), "utf8");
}

test("runtime declares compatibility profiles for Safari Chrome Microsoft Bing WeChat and QQ", async () => {
  const runtime = await readWeb("another_brain_chat/browser_runtime.js");

  for (const marker of [
    "detectBrowserEnvironment",
    "safari",
    "chrome",
    "microsoft_edge",
    "bing_microsoft",
    "wechat_in_app",
    "qq_in_app",
    "MicroMessenger",
    "MQQBrowser",
    "bingsapphire",
    "edg"
  ]) {
    assert.match(runtime.toLowerCase(), new RegExp(marker.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), marker);
  }
});

test("restricted browser APIs are guarded instead of crashing the page", async () => {
  const runtime = await readWeb("another_brain_chat/browser_runtime.js");

  for (const marker of [
    "safeLocalStorageGet",
    "safeLocalStorageSet",
    "safeLocalStorageRemove",
    "local_storage_blocked",
    "createWorkerSafely",
    "_constructor_failed",
    "isolated_self_check_worker",
    "compatibility_blockers",
    "module_worker_allowed",
    "cache_storage_blocked"
  ]) {
    assert.match(runtime, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), marker);
  }

  assert.doesNotMatch(runtime, /this\.worker = new Worker\(new URL\("\.\/runtime_worker/);
  assert.doesNotMatch(runtime, /const worker = new Worker\(new URL\("\.\/self_check_worker/);
});

test("compatibility matrix covers desktop mobile network and in-app profiles", async () => {
  const script = await readScript("r28p0d_browser_compat_matrix.mjs");

  for (const marker of [
    "chrome_desktop_fast",
    "edge_desktop_fast",
    "safari_ios_3g",
    "bing_ios_3g",
    "wechat_ios_worker_blocked",
    "qq_android_cache_blocked",
    "Network.emulateNetworkConditions",
    "Network.setUserAgentOverride",
    "Emulation.setDeviceMetricsOverride",
    "blockWorkers",
    "blockStorage",
    "blockCaches",
    "artifacts/r28p0d/reports/browser_compat_matrix.json"
  ]) {
    assert.match(script, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), marker);
  }
});
