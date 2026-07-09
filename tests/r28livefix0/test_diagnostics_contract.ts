import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { verifyDraft } from "../../web/another_brain_chat/browser_runtime.js";

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

test("mojibake q4 drafts are rejected before reaching the chat surface", async () => {
  const app = await readFile(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url), "utf8");
  const draft = "� plant buy如果命题P� really•ания。";
  const verifier = verifyDraft(draft, {
    evidence_status: "sufficient",
    retrieved_evidence: [{ title: "local", text: "生与死问题的本地证据", source_id: "local" }]
  });

  assert.equal(verifier.passed, false);
  assert.ok(verifier.failures.includes("mojibake_output"));
  assert.ok(verifier.fallback_recommended);
  assert.ok(app.includes("model_gibberish_fallback"));
  assert.ok(app.includes("mojibake_output"));
});
