import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("preview UI keeps non-product and non-admission claims visible", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url), "utf8");
  assert.ok(html.includes("不是已 admission 的产品模型"));
  assert.ok(runtime.includes("product_admission: false"));
  assert.ok(runtime.includes("browser_admission: false"));
  assert.ok(runtime.includes("release_checkpoint: false"));
  assert.equal(/product admission (passed|approved|complete)/i.test(`${html}\n${runtime}`), false);
});
