import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("browser diagnostics exposes branch marker, shard probes, forward status, and merge runtime readiness", async () => {
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  assert.ok(app.includes("window.__anotherBrainDiagnostics"));
  assert.ok(app.includes("branch_marker"));
  assert.ok(app.includes("asset_manifest"));
  assert.ok(app.includes("q4_shards"));
  assert.ok(app.includes("bytes_read"));
  assert.ok(app.includes("q4_forward"));
  assert.ok(app.includes("merge_runtime_ready"));
  assert.ok(app.includes("q4Shards.length === 5"));
  assert.ok(app.includes("assetsOk && tokenizerOk && forwardOk"));
});

test("UI and static entries expose R28LIVEFIX0 marker on root and chat routes", async () => {
  for (const path of [
    "../../web/another_brain_chat/index.html",
    "../../web/index.html",
    "../../web/another_brain_chat.html"
  ]) {
    const html = await readFile(new URL(path, import.meta.url), "utf8");
    assert.ok(html.includes("R28LIVEFIX0"), path);
    assert.ok(html.includes("r28livefix0-live-q4-mount"), path);
    assert.ok(html.includes("another-brain-commit-short"), path);
  }
});

test("loading panel exposes unambiguous completed q4 progress instead of skeleton-only pass state", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../../web/another_brain_chat/styles.css", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");

  assert.ok(html.includes("model-loading-summary"));
  assert.ok(css.includes(".loading-skeleton.is-complete"));
  for (const expected of [
    "summarizeLoadingProgress",
    "完成 100%",
    "q4 forward=",
    "tokens=",
    "shards=",
    "加载完成：q4 已可用",
    "loadingSkeleton?.classList.toggle"
  ]) {
    assert.ok(app.includes(expected), expected);
  }
});
