import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function readWeb(path) {
  return readFile(new URL(`../../web/${path}`, import.meta.url), "utf8");
}

test("P0D hotfix cache-busts app, runtime worker, self-check worker, and q4 runtime modules", async () => {
  const index = await readWeb("another_brain_chat/index.html");
  const app = await readWeb("another_brain_chat/app.js");
  const runtime = await readWeb("another_brain_chat/browser_runtime.js");
  const runtimeWorker = await readWeb("another_brain_chat/runtime_worker.js");
  const selfCheckWorker = await readWeb("another_brain_chat/self_check_worker.js");

  for (const source of [index, app, runtime, runtimeWorker, selfCheckWorker]) {
    assert.ok(source.includes("r28p0d-browser-compat-no-fallback-choice"));
  }
  assert.ok(!runtime.includes("./runtime_worker.js?v=r28ship0-unified-q4-mount"));
  assert.ok(!runtime.includes("./self_check_worker.js?v=r28ship0-unified-q4-mount"));
  assert.ok(!runtimeWorker.includes("./q4_worker_runtime.js?v=r28ship0-unified-q4-mount"));
  assert.ok(!selfCheckWorker.includes("./q4_worker_runtime.js?v=r28ship0-unified-q4-mount"));
});

test("deep q4 warmup is mobile tolerant and no longer capped at 15 seconds", async () => {
  const app = await readWeb("another_brain_chat/app.js");
  const runtime = await readWeb("another_brain_chat/browser_runtime.js");
  const selfCheckWorker = await readWeb("another_brain_chat/self_check_worker.js");

  assert.ok(runtime.includes("const SELF_CHECK_DEEP_TIMEOUT_MS = 90000"));
  assert.ok(runtime.includes("const SELF_CHECK_MAX_TIMEOUT_MS = 120000"));
  assert.ok(runtime.includes("function clampQ4WarmupTimeout"));
  assert.ok(!runtime.includes("Number(options.timeoutMs || SELF_CHECK_DEEP_TIMEOUT_MS), 1000), 15000"));
  assert.ok(selfCheckWorker.includes("Number(message.timeoutMs || 90000), 1000), 120000"));
  assert.ok(app.includes("const R28P0_Q4_WARMUP_TIMEOUT_MS = 90000"));
  assert.ok(!app.includes("timeoutMs: 15000"));
});

test("self-check warmup runs through the persistent runtime worker before fallback", async () => {
  const runtime = await readWeb("another_brain_chat/browser_runtime.js");

  assert.ok(runtime.includes("async runQ4SelfCheckSmokeOnRuntimeWorker"));
  assert.ok(runtime.includes("worker_reused_for_chat: true"));
  assert.ok(runtime.includes("worker.postMessage({\n        type: \"generate\""));
  assert.ok(runtime.includes("useIsolatedSelfCheckWorker === true"));
  assert.ok(runtime.includes("runQ4SelfCheckSmokeInIsolatedWorker"));
});

test("runtime mode metadata invalidates the old SHIP0/P0 asset cache namespace", async () => {
  const app = await readWeb("another_brain_chat/app.js");
  const runtimeMode = JSON.parse(await readWeb("another_brain/runtime_mode.json"));
  const assetManifest = JSON.parse(await readWeb("another_brain/asset_manifest.json"));

  assert.ok(app.includes("url.searchParams.set(\"v\", R28P0D_BROWSER_COMPAT_NO_FALLBACK_CHOICE_VERSION)"));
  assert.ok(app.includes("fetch(url.href, { cache: \"no-store\" })"));
  assert.equal(runtimeMode.ui_version, "r28p0d-browser-compat-no-fallback-choice");
  assert.equal(runtimeMode.asset_cache_version, "r28p0d-browser-compat-no-fallback-choice");
  assert.equal(assetManifest.ui_version, "r28p0d-browser-compat-no-fallback-choice");
  assert.equal(assetManifest.model_assets.filter((item) => item.role === "q4_shard").length, 5);
});

test("primary q4 mount is not mislabeled as Plan B before primary failure", async () => {
  const app = await readWeb("another_brain_chat/app.js");
  const runtime = await readWeb("another_brain_chat/browser_runtime.js");

  assert.ok(app.includes("主路径：正在挂载 q4"));
  assert.ok(app.includes("主路径失败，准备 Plan B"));
  assert.ok(app.includes("Plan B：正在重试模型加载"));
  assert.ok(app.includes("rawBlocker === \"q4_retry_plan_not_complete\" ? \"\" : rawBlocker"));
  assert.ok(app.includes("renderModelLoading({ report, status: \"primary_mount\", attempt: 1, strategy: \"primary\", plan_b_active: false })"));
  assert.ok(runtime.includes("status: attempt === 1 ? \"primary_mount\" : \"plan_b_retrying\""));
  assert.ok(runtime.includes("plan_b_active: attempt > 1"));
  assert.ok(runtime.includes("status: report.ok ? \"passed\" : attempt === 1 ? \"primary_failed\" : \"plan_b_retrying\""));
});
