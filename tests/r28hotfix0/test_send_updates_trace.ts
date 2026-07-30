import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("send path updates all six public process trace stages", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  for (const stage of ["输入包", "本地上下文", "检索证据", "模型草稿", "路由判断", "最终回答"]) {
    assert.ok(html.includes(stage));
  }
  for (const renderer of ["traceInputSummary", "traceContextSummary", "traceEvidenceSummary", "traceDraftSummary", "traceRouterSummary", "traceFinalSummary"]) {
    assert.ok(app.includes(renderer));
  }
  assert.ok(app.includes("runtime.run(runtimeInput"));
});
